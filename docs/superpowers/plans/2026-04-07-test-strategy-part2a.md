# Test Strategy Part 2a — API Integration Tests

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create API integration tests that call Next.js route handlers directly against a real SQLite test database. No HTTP server needed — handlers are async functions invoked in-process.

**Architecture:** Each test file imports route handlers from `src/app/api/...` and calls them with `Request` objects. A `globalSetup` creates `prisma/test.db` with the full schema + seed data before the test run. Each test file re-seeds in `beforeAll`. Cleanup happens in `afterEach` or `afterAll`.

**Tech Stack:** Vitest (already installed), sqlite3 CLI (for DB creation), Prisma client (for seed data + assertions)

**Branch:** `feature/api-integration-tests`

---

## Task 1: Test DB Infrastructure

**Files:** `vitest.config.ts` (modify), `tests/api/global-setup.ts` (new), `tests/api/global-teardown.ts` (new), `tests/api/helpers.ts` (new), `tests/api/seed.ts` (new)

### Step 1.1 — Modify vitest.config.ts

Add `env` and `globalSetup` for the API test project. The key insight: `DATABASE_URL` must be set BEFORE any Prisma imports, and `globalSetup` runs before any test files load.

```ts
// /Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp/vitest.config.ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/api/**/*.test.ts'],
    env: {
      DATABASE_URL: `file:${path.resolve(__dirname, 'prisma/test.db')}`,
    },
    globalSetup: ['tests/api/global-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/app/api/**'],
    },
  },
})
```

**Why `env` instead of `.env.test`:** The Prisma singleton in `src/lib/prisma.ts` reads `process.env.DATABASE_URL` at first import. Setting it via `vitest.config.ts > test.env` ensures it's available before any test file loads. The `file:` prefix is required by the libSQL adapter.

**Important:** The `env` field sets `DATABASE_URL` for ALL test files (unit AND api). This is harmless for unit tests since they don't import Prisma. If a unit test somehow does import Prisma, it will hit the test DB instead of dev DB — which is the safe direction.

### Step 1.2 — Create tests/api/global-setup.ts

This runs ONCE before all test files. It creates `prisma/test.db` from the dev.db schema using the sqlite3 CLI (same pattern as `scripts/prepare-electron-db.js`).

```ts
// /Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp/tests/api/global-setup.ts
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

export default function globalSetup() {
  const root = path.resolve(__dirname, '../..')
  const devDbPath = path.join(root, 'prisma', 'dev.db')
  const testDbPath = path.join(root, 'prisma', 'test.db')

  if (!fs.existsSync(devDbPath)) {
    throw new Error('prisma/dev.db not found — run the dev server at least once to create it')
  }

  // Remove old test DB + WAL/SHM files
  for (const f of [testDbPath, testDbPath + '-shm', testDbPath + '-wal']) {
    if (fs.existsSync(f)) fs.unlinkSync(f)
  }

  // Extract CREATE TABLE statements (exclude _prisma_migrations and sqlite internals)
  const tableSql = execSync(
    `sqlite3 "${devDbPath}" "SELECT sql || ';' FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations' AND sql IS NOT NULL ORDER BY name;"`,
    { encoding: 'utf-8' }
  )

  // Extract CREATE INDEX statements
  const indexSql = execSync(
    `sqlite3 "${devDbPath}" "SELECT sql || ';' FROM sqlite_master WHERE type='index' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name;"`,
    { encoding: 'utf-8' }
  )

  const fullSql = [tableSql.trim(), indexSql.trim()].filter(Boolean).join('\n')

  // Write to temp file, then create test.db via sqlite3 CLI
  const tmpFile = path.join(root, 'prisma', '_test_schema_tmp.sql')
  fs.writeFileSync(tmpFile, fullSql)

  try {
    execSync(`sqlite3 "${testDbPath}" < "${tmpFile}"`, { stdio: 'pipe' })
  } finally {
    fs.unlinkSync(tmpFile)
  }

  // Verify tables were created
  const count = execSync(
    `sqlite3 "${testDbPath}" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"`,
    { encoding: 'utf-8' }
  ).trim()

  console.log(`[test-setup] Created prisma/test.db (${count} tables)`)
}
```

### Step 1.3 — Create tests/api/global-teardown.ts

```ts
// /Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp/tests/api/global-teardown.ts
import fs from 'fs'
import path from 'path'

export default function globalTeardown() {
  const root = path.resolve(__dirname, '../..')
  const testDbPath = path.join(root, 'prisma', 'test.db')

  for (const f of [testDbPath, testDbPath + '-shm', testDbPath + '-wal']) {
    if (fs.existsSync(f)) fs.unlinkSync(f)
  }

  console.log('[test-teardown] Removed prisma/test.db')
}
```

### Step 1.4 — Create tests/api/helpers.ts

Shared utilities for all API test files.

```ts
// /Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp/tests/api/helpers.ts
import { prisma } from '@/lib/prisma'

/**
 * Build a Request object for calling route handlers directly.
 * No HTTP server needed — route handlers accept standard Request objects.
 */
export function createRequest(
  method: string,
  path: string,
  body?: unknown,
): Request {
  const url = `http://test${path}`
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
  }
  return new Request(url, init)
}

/**
 * Build a route context with params (for [id] routes).
 * Next.js App Router passes params as a Promise.
 */
export function createParams(params: Record<string, string>) {
  return { params: Promise.resolve(params) }
}

/**
 * Seed a test account directly via Prisma. Returns the created account.
 */
export async function seedAccount(overrides: {
  name?: string
  type?: 'CHECKING' | 'SAVINGS' | 'CREDIT_CARD' | 'CASH' | 'INVESTMENT'
  currentBalance?: number
  sortOrder?: number
  iban?: string | null
  bank?: string | null
  color?: string
  isActive?: boolean
} = {}) {
  return prisma.account.create({
    data: {
      name: overrides.name ?? 'Test Account',
      type: overrides.type ?? 'CHECKING',
      currentBalance: overrides.currentBalance ?? 0,
      sortOrder: overrides.sortOrder ?? 0,
      iban: overrides.iban ?? null,
      bank: overrides.bank ?? null,
      color: overrides.color ?? '#6366f1',
      isActive: overrides.isActive ?? true,
    },
  })
}

/**
 * Seed a category group directly via Prisma.
 */
export async function seedCategoryGroup(accountId: string, overrides: {
  name?: string
  sortOrder?: number
} = {}) {
  return prisma.categoryGroup.create({
    data: {
      name: overrides.name ?? 'Test Group',
      sortOrder: overrides.sortOrder ?? 0,
      accountId,
    },
  })
}

/**
 * Seed a category directly via Prisma.
 */
export async function seedCategory(overrides: {
  name?: string
  type?: 'INCOME' | 'EXPENSE' | 'TRANSFER'
  groupId?: string | null
  color?: string
  sortOrder?: number
} = {}) {
  return prisma.category.create({
    data: {
      name: overrides.name ?? 'Test Category',
      type: overrides.type ?? 'EXPENSE',
      groupId: overrides.groupId ?? null,
      color: overrides.color ?? '#6366f1',
      sortOrder: overrides.sortOrder ?? 0,
    },
  })
}

/**
 * Seed a transaction directly via Prisma (does NOT update account balance).
 * For tests that need correct balance, use the POST route handler instead.
 */
export async function seedTransaction(accountId: string, overrides: {
  date?: Date
  mainAmount?: number | null
  mainType?: 'INCOME' | 'EXPENSE' | 'TRANSFER'
  subAmount?: number | null
  subType?: 'INCOME' | 'EXPENSE' | 'TRANSFER' | null
  description?: string
  payee?: string | null
  categoryId?: string | null
  status?: 'PENDING' | 'CLEARED' | 'RECONCILED'
  importHash?: string | null
} = {}) {
  return prisma.transaction.create({
    data: {
      date: overrides.date ?? new Date('2026-04-01'),
      mainAmount: overrides.mainAmount ?? -50,
      mainType: overrides.mainType ?? 'EXPENSE',
      subAmount: overrides.subAmount ?? null,
      subType: overrides.subType ?? null,
      description: overrides.description ?? 'Test transaction',
      payee: overrides.payee ?? null,
      categoryId: overrides.categoryId ?? null,
      status: overrides.status ?? 'PENDING',
      importHash: overrides.importHash ?? null,
      accountId,
    },
  })
}

/**
 * Seed a category rule directly via Prisma.
 */
export async function seedRule(categoryId: string, overrides: {
  name?: string
  field?: 'DESCRIPTION' | 'PAYEE' | 'AMOUNT'
  operator?: 'CONTAINS' | 'STARTS_WITH' | 'ENDS_WITH' | 'EQUALS' | 'GREATER_THAN' | 'LESS_THAN' | 'REGEX'
  value?: string
  priority?: number
  isActive?: boolean
} = {}) {
  return prisma.categoryRule.create({
    data: {
      name: overrides.name ?? 'Test Rule',
      field: overrides.field ?? 'DESCRIPTION',
      operator: overrides.operator ?? 'CONTAINS',
      value: overrides.value ?? 'test',
      categoryId,
      priority: overrides.priority ?? 0,
      isActive: overrides.isActive ?? true,
    },
  })
}

/**
 * Delete all rows from a table.
 * Uses deleteMany to respect Prisma's type safety.
 */
export async function cleanTable(table: 'transaction' | 'account' | 'category' | 'categoryGroup' | 'categoryRule' | 'appSetting' | 'csvProfile' | 'loanPayment' | 'loan' | 'subAccountEntry' | 'subAccountGroup' | 'subAccount') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma[table] as any).deleteMany()
}

/**
 * Clean ALL data from the database. Use in beforeAll/beforeEach to reset state.
 * Order matters — delete children before parents to avoid FK violations.
 */
export async function cleanAll() {
  // Children first, parents last
  await prisma.loanPayment.deleteMany()
  await prisma.loan.deleteMany()
  await prisma.savingsEntry.deleteMany()
  await prisma.savingsConfig.deleteMany()
  await prisma.portfolioValue.deleteMany()
  await prisma.portfolio.deleteMany()
  await prisma.assetValue.deleteMany()
  await prisma.asset.deleteMany()
  await prisma.assetType.deleteMany()
  await prisma.reconciliation.deleteMany()
  await prisma.budgetEntry.deleteMany()
  await prisma.transaction.deleteMany()
  await prisma.subAccountEntry.deleteMany()
  await prisma.subAccountGroup.deleteMany()
  await prisma.subAccount.deleteMany()
  await prisma.categoryRule.deleteMany()
  await prisma.category.deleteMany()
  await prisma.categoryGroup.deleteMany()
  await prisma.account.deleteMany()
  await prisma.csvProfile.deleteMany()
  await prisma.appSetting.deleteMany()
}
```

### Step 1.5 — Create tests/api/seed.ts

Inserts the fixed baseline data that all tests can rely on. Returns stable references (IDs) for use in tests.

```ts
// /Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp/tests/api/seed.ts
import { prisma } from '@/lib/prisma'
import { cleanAll } from './helpers'

/**
 * Seed data IDs — deterministic so tests can reference them.
 * Using fixed CUIDs avoids needing to capture return values.
 */
export const SEED = {
  accounts: {
    girokonto: 'seed-acc-girokonto',
    sparkonto: 'seed-acc-sparkonto',
  },
  groups: {
    giroFixkosten: 'seed-grp-giro-fix',
    giroVariable: 'seed-grp-giro-var',
    sparFixkosten: 'seed-grp-spar-fix',
    sparVariable: 'seed-grp-spar-var',
  },
  categories: {
    miete: 'seed-cat-miete',
    lebensmittel: 'seed-cat-lebensmittel',
    gehalt: 'seed-cat-gehalt',
    sonstiges: 'seed-cat-sonstiges',
  },
  csvProfiles: {
    deutscheBank: 'seed-csv-deutsche-bank',
  },
} as const

/**
 * Insert all seed data. Call this in beforeAll of each test file.
 * Idempotent: calls cleanAll() first to avoid duplicates.
 */
export async function seedDatabase() {
  await cleanAll()

  // --- Accounts ---
  await prisma.account.createMany({
    data: [
      {
        id: SEED.accounts.girokonto,
        name: 'Girokonto',
        type: 'CHECKING',
        currentBalance: 1000,
        sortOrder: 0,
        color: '#3b82f6',
      },
      {
        id: SEED.accounts.sparkonto,
        name: 'Sparkonto',
        type: 'SAVINGS',
        currentBalance: 5000,
        sortOrder: 1,
        color: '#10b981',
      },
    ],
  })

  // --- Category Groups (2 per account) ---
  await prisma.categoryGroup.createMany({
    data: [
      {
        id: SEED.groups.giroFixkosten,
        name: 'Fixkosten',
        sortOrder: 0,
        accountId: SEED.accounts.girokonto,
      },
      {
        id: SEED.groups.giroVariable,
        name: 'Variable Kosten',
        sortOrder: 1,
        accountId: SEED.accounts.girokonto,
      },
      {
        id: SEED.groups.sparFixkosten,
        name: 'Fixkosten',
        sortOrder: 0,
        accountId: SEED.accounts.sparkonto,
      },
      {
        id: SEED.groups.sparVariable,
        name: 'Variable Kosten',
        sortOrder: 1,
        accountId: SEED.accounts.sparkonto,
      },
    ],
  })

  // --- Categories ---
  await prisma.category.createMany({
    data: [
      {
        id: SEED.categories.miete,
        name: 'Miete',
        type: 'EXPENSE',
        groupId: SEED.groups.giroFixkosten,
        sortOrder: 0,
        color: '#ef4444',
      },
      {
        id: SEED.categories.lebensmittel,
        name: 'Lebensmittel',
        type: 'EXPENSE',
        groupId: SEED.groups.giroVariable,
        sortOrder: 0,
        color: '#f59e0b',
      },
      {
        id: SEED.categories.gehalt,
        name: 'Gehalt',
        type: 'INCOME',
        groupId: SEED.groups.giroFixkosten,
        sortOrder: 1,
        color: '#22c55e',
      },
      {
        id: SEED.categories.sonstiges,
        name: 'Sonstiges',
        type: 'EXPENSE',
        groupId: SEED.groups.giroVariable,
        sortOrder: 1,
        color: '#6366f1',
      },
    ],
  })

  // --- CSV Profile ---
  await prisma.csvProfile.create({
    data: {
      id: SEED.csvProfiles.deutscheBank,
      name: 'Deutsche Bank',
      delimiter: ';',
      dateFormat: 'DD.MM.YYYY',
      encoding: 'UTF-8',
      skipRows: 4,
      columnMapping: JSON.stringify({
        date: 'Buchungstag',
        amount: 'Betrag',
        description: 'Verwendungszweck',
        payee: 'Beguenstigter/Zahlungspflichtiger',
      }),
      amountFormat: 'DE',
    },
  })

  // --- App Settings ---
  await prisma.appSetting.createMany({
    data: [
      { key: 'currency', value: 'EUR' },
      { key: 'locale', value: 'de-DE' },
    ],
  })
}
```

### Step 1.6 — Verify infrastructure

```bash
cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp"
npx vitest run tests/api 2>&1 | head -20
# Expected: "No test files found" or similar — proves globalSetup ran without errors
```

### Acceptance criteria
- [ ] `prisma/test.db` is created when running `npm run test:api`
- [ ] `prisma/test.db` is deleted after the test run
- [ ] `seedDatabase()` inserts all baseline data
- [ ] `cleanAll()` removes all data without FK violations
- [ ] Helper functions (`createRequest`, `createParams`, seed functions) compile without errors
- [ ] Unit tests still pass (env variable is harmless for them)

---

## Task 2: accounts.test.ts

**File:** `tests/api/accounts.test.ts`
**Routes under test:**
- `src/app/api/accounts/route.ts` — GET (list active), POST (create with auto sortOrder)
- `src/app/api/accounts/[id]/route.ts` — GET (with transactions), PUT (partial update), DELETE (soft delete)

### Step 2.1 — Create accounts.test.ts

```ts
// /Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp/tests/api/accounts.test.ts
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { GET, POST } from '@/app/api/accounts/route'
import { GET as GET_BY_ID, PUT, DELETE } from '@/app/api/accounts/[id]/route'
import { createRequest, createParams, seedAccount, seedTransaction, cleanAll } from './helpers'
import { seedDatabase, SEED } from './seed'

describe('Accounts API', () => {
  beforeAll(async () => {
    await seedDatabase()
  })

  afterEach(async () => {
    // Remove any accounts created during tests (but keep seed data)
    await prisma.transaction.deleteMany({
      where: { accountId: { notIn: [SEED.accounts.girokonto, SEED.accounts.sparkonto] } },
    })
    await prisma.account.deleteMany({
      where: { id: { notIn: [SEED.accounts.girokonto, SEED.accounts.sparkonto] } },
    })
    // Restore seed accounts to active (in case DELETE tests soft-deleted them)
    await prisma.account.updateMany({
      where: { id: { in: [SEED.accounts.girokonto, SEED.accounts.sparkonto] } },
      data: { isActive: true },
    })
  })

  // ──────────────────────────────────────────────
  // GET /api/accounts — list active accounts
  // ──────────────────────────────────────────────

  describe('GET /api/accounts', () => {
    it('returns all active accounts ordered by sortOrder', async () => {
      const req = createRequest('GET', '/api/accounts')
      const res = await GET(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toHaveLength(2)
      expect(data[0].name).toBe('Girokonto')
      expect(data[1].name).toBe('Sparkonto')
    })

    it('excludes soft-deleted accounts', async () => {
      await prisma.account.update({
        where: { id: SEED.accounts.sparkonto },
        data: { isActive: false },
      })

      const req = createRequest('GET', '/api/accounts')
      const res = await GET(req)
      const data = await res.json()

      expect(data).toHaveLength(1)
      expect(data[0].name).toBe('Girokonto')
    })

    it('includes transaction count (_count.transactions)', async () => {
      await seedTransaction(SEED.accounts.girokonto, { description: 'Test TX' })

      const req = createRequest('GET', '/api/accounts')
      const res = await GET(req)
      const data = await res.json()

      const giro = data.find((a: { name: string }) => a.name === 'Girokonto')
      expect(giro._count.transactions).toBeGreaterThanOrEqual(1)
    })

    it('returns empty array when no active accounts exist', async () => {
      await prisma.account.updateMany({ data: { isActive: false } })

      const req = createRequest('GET', '/api/accounts')
      const res = await GET(req)
      const data = await res.json()

      expect(data).toEqual([])
    })
  })

  // ──────────────────────────────────────────────
  // POST /api/accounts — create account
  // ──────────────────────────────────────────────

  describe('POST /api/accounts', () => {
    it('creates an account with required fields', async () => {
      const req = createRequest('POST', '/api/accounts', {
        name: 'Neues Konto',
        type: 'CHECKING',
      })
      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(201)
      expect(data.name).toBe('Neues Konto')
      expect(data.type).toBe('CHECKING')
      expect(data.id).toBeDefined()
      expect(data.isActive).toBe(true)
    })

    it('auto-assigns sortOrder as max + 1', async () => {
      const req = createRequest('POST', '/api/accounts', {
        name: 'Drittes Konto',
      })
      const res = await POST(req)
      const data = await res.json()

      // Seed accounts have sortOrder 0 and 1, so new one should be 2
      expect(data.sortOrder).toBe(2)
    })

    it('applies default values (type=CHECKING, color, balance=0)', async () => {
      const req = createRequest('POST', '/api/accounts', {
        name: 'Defaults Konto',
      })
      const res = await POST(req)
      const data = await res.json()

      expect(data.type).toBe('CHECKING')
      expect(data.color).toBe('#6366f1')
      expect(data.currentBalance).toBe(0)
    })

    it('accepts optional fields (iban, bank, color, icon, currentBalance)', async () => {
      const req = createRequest('POST', '/api/accounts', {
        name: 'Volles Konto',
        type: 'SAVINGS',
        iban: 'DE89370400440532013000',
        bank: 'Deutsche Bank',
        color: '#ff0000',
        icon: 'Wallet',
        currentBalance: 2500.50,
      })
      const res = await POST(req)
      const data = await res.json()

      expect(data.iban).toBe('DE89370400440532013000')
      expect(data.bank).toBe('Deutsche Bank')
      expect(data.color).toBe('#ff0000')
      expect(data.icon).toBe('Wallet')
      expect(data.currentBalance).toBe(2500.50)
    })

    it('returns 400 for missing name', async () => {
      const req = createRequest('POST', '/api/accounts', {
        type: 'CHECKING',
      })
      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBeInstanceOf(Array)
    })

    it('returns 400 for empty name', async () => {
      const req = createRequest('POST', '/api/accounts', {
        name: '',
      })
      const res = await POST(req)

      expect(res.status).toBe(400)
    })

    it('returns 400 for invalid account type', async () => {
      const req = createRequest('POST', '/api/accounts', {
        name: 'Ungültig',
        type: 'CRYPTO',
      })
      const res = await POST(req)

      expect(res.status).toBe(400)
    })
  })

  // ──────────────────────────────────────────────
  // GET /api/accounts/[id] — get account with transactions
  // ──────────────────────────────────────────────

  describe('GET /api/accounts/[id]', () => {
    it('returns account with its transactions', async () => {
      await seedTransaction(SEED.accounts.girokonto, {
        description: 'Included TX',
        categoryId: SEED.categories.miete,
      })

      const req = createRequest('GET', `/api/accounts/${SEED.accounts.girokonto}`)
      const ctx = createParams({ id: SEED.accounts.girokonto })
      const res = await GET_BY_ID(req, ctx)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.name).toBe('Girokonto')
      expect(data.transactions).toBeInstanceOf(Array)
      expect(data.transactions.length).toBeGreaterThanOrEqual(1)
      // Transactions include category
      const tx = data.transactions.find((t: { description: string }) => t.description === 'Included TX')
      expect(tx.category).toBeDefined()
      expect(tx.category.name).toBe('Miete')
    })

    it('limits transactions to 50', async () => {
      // Create 55 transactions
      for (let i = 0; i < 55; i++) {
        await seedTransaction(SEED.accounts.girokonto, {
          description: `Bulk TX ${i}`,
          date: new Date(`2026-03-${String(i % 28 + 1).padStart(2, '0')}`),
        })
      }

      const req = createRequest('GET', `/api/accounts/${SEED.accounts.girokonto}`)
      const ctx = createParams({ id: SEED.accounts.girokonto })
      const res = await GET_BY_ID(req, ctx)
      const data = await res.json()

      expect(data.transactions.length).toBeLessThanOrEqual(50)
    })

    it('returns 404 for non-existent account', async () => {
      const req = createRequest('GET', '/api/accounts/non-existent-id')
      const ctx = createParams({ id: 'non-existent-id' })
      const res = await GET_BY_ID(req, ctx)
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.error).toBe('Konto nicht gefunden')
    })
  })

  // ──────────────────────────────────────────────
  // PUT /api/accounts/[id] — update account
  // ──────────────────────────────────────────────

  describe('PUT /api/accounts/[id]', () => {
    it('updates name only (partial update)', async () => {
      const req = createRequest('PUT', `/api/accounts/${SEED.accounts.girokonto}`, {
        name: 'Umbenennt',
      })
      const ctx = createParams({ id: SEED.accounts.girokonto })
      const res = await PUT(req, ctx)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.name).toBe('Umbenennt')
      // Other fields should remain unchanged
      expect(data.type).toBe('CHECKING')

      // Restore for other tests
      await prisma.account.update({
        where: { id: SEED.accounts.girokonto },
        data: { name: 'Girokonto' },
      })
    })

    it('updates multiple fields at once', async () => {
      const req = createRequest('PUT', `/api/accounts/${SEED.accounts.girokonto}`, {
        name: 'Hauptkonto',
        color: '#ff5500',
        bank: 'Sparkasse',
      })
      const ctx = createParams({ id: SEED.accounts.girokonto })
      const res = await PUT(req, ctx)
      const data = await res.json()

      expect(data.name).toBe('Hauptkonto')
      expect(data.color).toBe('#ff5500')
      expect(data.bank).toBe('Sparkasse')

      // Restore
      await prisma.account.update({
        where: { id: SEED.accounts.girokonto },
        data: { name: 'Girokonto', color: '#3b82f6', bank: null },
      })
    })

    it('allows setting iban to null', async () => {
      // First set an IBAN
      await prisma.account.update({
        where: { id: SEED.accounts.girokonto },
        data: { iban: 'DE123' },
      })

      const req = createRequest('PUT', `/api/accounts/${SEED.accounts.girokonto}`, {
        iban: null,
      })
      const ctx = createParams({ id: SEED.accounts.girokonto })
      const res = await PUT(req, ctx)
      const data = await res.json()

      expect(data.iban).toBeNull()
    })

    it('returns 400 for empty name', async () => {
      const req = createRequest('PUT', `/api/accounts/${SEED.accounts.girokonto}`, {
        name: '',
      })
      const ctx = createParams({ id: SEED.accounts.girokonto })
      const res = await PUT(req, ctx)

      expect(res.status).toBe(400)
    })
  })

  // ──────────────────────────────────────────────
  // DELETE /api/accounts/[id] — soft delete
  // ──────────────────────────────────────────────

  describe('DELETE /api/accounts/[id]', () => {
    it('soft-deletes an account (sets isActive=false)', async () => {
      const req = createRequest('DELETE', `/api/accounts/${SEED.accounts.sparkonto}`)
      const ctx = createParams({ id: SEED.accounts.sparkonto })
      const res = await DELETE(req, ctx)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)

      // Verify it's soft-deleted
      const account = await prisma.account.findUnique({ where: { id: SEED.accounts.sparkonto } })
      expect(account?.isActive).toBe(false)
    })

    it('soft-deleted account no longer appears in GET list', async () => {
      await prisma.account.update({
        where: { id: SEED.accounts.sparkonto },
        data: { isActive: false },
      })

      const req = createRequest('GET', '/api/accounts')
      const res = await GET(req)
      const data = await res.json()

      const names = data.map((a: { name: string }) => a.name)
      expect(names).not.toContain('Sparkonto')
    })

    it('soft-deleted account is still accessible via GET /[id]', async () => {
      await prisma.account.update({
        where: { id: SEED.accounts.sparkonto },
        data: { isActive: false },
      })

      const req = createRequest('GET', `/api/accounts/${SEED.accounts.sparkonto}`)
      const ctx = createParams({ id: SEED.accounts.sparkonto })
      const res = await GET_BY_ID(req, ctx)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.name).toBe('Sparkonto')
      expect(data.isActive).toBe(false)
    })
  })
})
```

### Step 2.2 — Run and verify

```bash
cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp"
npx vitest run tests/api/accounts.test.ts
# Expected: all tests pass
```

### Acceptance criteria
- [ ] All 15 test cases pass
- [ ] Seed data is correctly restored between tests
- [ ] No leftover data leaks between describe blocks

---

## Task 3: settings.test.ts

**File:** `tests/api/settings.test.ts`
**Routes under test:**
- `src/app/api/settings/route.ts` — GET (key-value pairs), PUT (upsert in transaction)

### Step 3.1 — Create settings.test.ts

```ts
// /Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp/tests/api/settings.test.ts
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { GET, PUT } from '@/app/api/settings/route'
import { createRequest } from './helpers'
import { seedDatabase } from './seed'

describe('Settings API', () => {
  beforeAll(async () => {
    await seedDatabase()
  })

  afterEach(async () => {
    // Restore seed settings
    await prisma.appSetting.deleteMany()
    await prisma.appSetting.createMany({
      data: [
        { key: 'currency', value: 'EUR' },
        { key: 'locale', value: 'de-DE' },
      ],
    })
  })

  // ──────────────────────────────────────────────
  // GET /api/settings
  // ──────────────────────────────────────────────

  describe('GET /api/settings', () => {
    it('returns all settings as key-value object', async () => {
      const req = createRequest('GET', '/api/settings')
      const res = await GET(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.currency).toBe('EUR')
      expect(data.locale).toBe('de-DE')
    })

    it('returns empty object when no settings exist', async () => {
      await prisma.appSetting.deleteMany()

      const req = createRequest('GET', '/api/settings')
      const res = await GET(req)
      const data = await res.json()

      expect(data).toEqual({})
    })
  })

  // ──────────────────────────────────────────────
  // PUT /api/settings — upsert
  // ──────────────────────────────────────────────

  describe('PUT /api/settings', () => {
    it('updates an existing setting', async () => {
      const req = createRequest('PUT', '/api/settings', {
        currency: 'USD',
      })
      const res = await PUT(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)

      // Verify the change persisted
      const setting = await prisma.appSetting.findUnique({ where: { key: 'currency' } })
      expect(setting?.value).toBe('USD')
    })

    it('creates a new setting (upsert behavior)', async () => {
      const req = createRequest('PUT', '/api/settings', {
        locale: 'en-US',
      })
      const res = await PUT(req)

      expect(res.status).toBe(200)

      const setting = await prisma.appSetting.findUnique({ where: { key: 'locale' } })
      expect(setting?.value).toBe('en-US')
    })

    it('updates multiple settings atomically', async () => {
      const req = createRequest('PUT', '/api/settings', {
        currency: 'CHF',
        locale: 'de-CH',
      })
      const res = await PUT(req)

      expect(res.status).toBe(200)

      const currency = await prisma.appSetting.findUnique({ where: { key: 'currency' } })
      const locale = await prisma.appSetting.findUnique({ where: { key: 'locale' } })
      expect(currency?.value).toBe('CHF')
      expect(locale?.value).toBe('de-CH')
    })

    it('returns 400 for unknown key', async () => {
      const req = createRequest('PUT', '/api/settings', {
        unknownKey: 'value',
      })
      const res = await PUT(req)

      expect(res.status).toBe(400)
    })

    it('returns 400 for value exceeding max length (32 chars)', async () => {
      const req = createRequest('PUT', '/api/settings', {
        currency: 'A'.repeat(33),
      })
      const res = await PUT(req)

      expect(res.status).toBe(400)
    })

    it('accepts empty body (no-op, still succeeds)', async () => {
      const req = createRequest('PUT', '/api/settings', {})
      const res = await PUT(req)

      expect(res.status).toBe(200)
    })
  })
})
```

### Step 3.2 — Run and verify

```bash
npx vitest run tests/api/settings.test.ts
```

### Acceptance criteria
- [ ] All 8 test cases pass
- [ ] Settings are correctly restored in afterEach
- [ ] Validation for unknown keys and max length works

---

## Task 4: categories.test.ts

**File:** `tests/api/categories.test.ts`
**Routes under test:**
- `src/app/api/categories/route.ts` — GET (grouped + ungrouped), POST (create)
- `src/app/api/categories/[id]/route.ts` — PUT (update), DELETE (soft delete)
- `src/app/api/category-groups/route.ts` — GET (with optional accountId filter), POST
- `src/app/api/category-groups/[id]/route.ts` — PUT, DELETE (cascades soft-delete to children)

### Step 4.1 — Create categories.test.ts

```ts
// /Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp/tests/api/categories.test.ts
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { GET as GET_CATEGORIES, POST as POST_CATEGORY } from '@/app/api/categories/route'
import { PUT as PUT_CATEGORY, DELETE as DELETE_CATEGORY } from '@/app/api/categories/[id]/route'
import { GET as GET_GROUPS, POST as POST_GROUP } from '@/app/api/category-groups/route'
import { PUT as PUT_GROUP, DELETE as DELETE_GROUP } from '@/app/api/category-groups/[id]/route'
import { createRequest, createParams, seedCategory, seedCategoryGroup } from './helpers'
import { seedDatabase, SEED } from './seed'

describe('Categories & Groups API', () => {
  beforeAll(async () => {
    await seedDatabase()
  })

  afterEach(async () => {
    // Clean up non-seed categories and groups, then restore seed data
    await prisma.category.deleteMany({
      where: {
        id: {
          notIn: [
            SEED.categories.miete,
            SEED.categories.lebensmittel,
            SEED.categories.gehalt,
            SEED.categories.sonstiges,
          ],
        },
      },
    })
    await prisma.categoryGroup.deleteMany({
      where: {
        id: {
          notIn: [
            SEED.groups.giroFixkosten,
            SEED.groups.giroVariable,
            SEED.groups.sparFixkosten,
            SEED.groups.sparVariable,
          ],
        },
      },
    })
    // Restore seed categories to active
    await prisma.category.updateMany({
      where: {
        id: {
          in: [
            SEED.categories.miete,
            SEED.categories.lebensmittel,
            SEED.categories.gehalt,
            SEED.categories.sonstiges,
          ],
        },
      },
      data: { isActive: true },
    })
  })

  // ══════════════════════════════════════════════
  // CATEGORIES
  // ══════════════════════════════════════════════

  // ──────────────────────────────────────────────
  // GET /api/categories — grouped + ungrouped
  // ──────────────────────────────────────────────

  describe('GET /api/categories', () => {
    it('returns groups with their active categories', async () => {
      const req = createRequest('GET', '/api/categories')
      const res = await GET_CATEGORIES(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.groups).toBeInstanceOf(Array)
      expect(data.groups.length).toBe(4) // 2 per account

      const giroFix = data.groups.find((g: { id: string }) => g.id === SEED.groups.giroFixkosten)
      expect(giroFix).toBeDefined()
      expect(giroFix.categories.length).toBe(2) // Miete + Gehalt
    })

    it('returns ungrouped categories separately', async () => {
      // Create an ungrouped category
      await seedCategory({ name: 'Ungrouped Cat', groupId: null })

      const req = createRequest('GET', '/api/categories')
      const res = await GET_CATEGORIES(req)
      const data = await res.json()

      expect(data.ungrouped).toBeInstanceOf(Array)
      expect(data.ungrouped.length).toBeGreaterThanOrEqual(1)
      expect(data.ungrouped.some((c: { name: string }) => c.name === 'Ungrouped Cat')).toBe(true)
    })

    it('excludes soft-deleted categories from groups', async () => {
      await prisma.category.update({
        where: { id: SEED.categories.miete },
        data: { isActive: false },
      })

      const req = createRequest('GET', '/api/categories')
      const res = await GET_CATEGORIES(req)
      const data = await res.json()

      const giroFix = data.groups.find((g: { id: string }) => g.id === SEED.groups.giroFixkosten)
      const names = giroFix.categories.map((c: { name: string }) => c.name)
      expect(names).not.toContain('Miete')
    })

    it('categories are ordered by sortOrder', async () => {
      const req = createRequest('GET', '/api/categories')
      const res = await GET_CATEGORIES(req)
      const data = await res.json()

      for (const group of data.groups) {
        const orders = group.categories.map((c: { sortOrder: number }) => c.sortOrder)
        expect(orders).toEqual([...orders].sort((a: number, b: number) => a - b))
      }
    })
  })

  // ──────────────────────────────────────────────
  // POST /api/categories — create category
  // ──────────────────────────────────────────────

  describe('POST /api/categories', () => {
    it('creates a category with required fields', async () => {
      const req = createRequest('POST', '/api/categories', {
        name: 'Neue Kategorie',
      })
      const res = await POST_CATEGORY(req)
      const data = await res.json()

      expect(res.status).toBe(201)
      expect(data.name).toBe('Neue Kategorie')
      expect(data.type).toBe('EXPENSE') // default
      expect(data.color).toBe('#6366f1') // default
      expect(data.isActive).toBe(true)
    })

    it('creates a category assigned to a group', async () => {
      const req = createRequest('POST', '/api/categories', {
        name: 'Versicherung',
        type: 'EXPENSE',
        groupId: SEED.groups.giroFixkosten,
      })
      const res = await POST_CATEGORY(req)
      const data = await res.json()

      expect(data.groupId).toBe(SEED.groups.giroFixkosten)
    })

    it('creates an INCOME category', async () => {
      const req = createRequest('POST', '/api/categories', {
        name: 'Bonus',
        type: 'INCOME',
      })
      const res = await POST_CATEGORY(req)
      const data = await res.json()

      expect(data.type).toBe('INCOME')
    })

    it('returns 400 for missing name', async () => {
      const req = createRequest('POST', '/api/categories', {
        type: 'EXPENSE',
      })
      const res = await POST_CATEGORY(req)

      expect(res.status).toBe(400)
    })

    it('returns 400 for empty name', async () => {
      const req = createRequest('POST', '/api/categories', {
        name: '',
      })
      const res = await POST_CATEGORY(req)

      expect(res.status).toBe(400)
    })

    it('returns 400 for invalid type', async () => {
      const req = createRequest('POST', '/api/categories', {
        name: 'Test',
        type: 'INVALID',
      })
      const res = await POST_CATEGORY(req)

      expect(res.status).toBe(400)
    })
  })

  // ──────────────────────────────────────────────
  // PUT /api/categories/[id] — update category
  // ──────────────────────────────────────────────

  describe('PUT /api/categories/[id]', () => {
    it('updates category name', async () => {
      const req = createRequest('PUT', `/api/categories/${SEED.categories.miete}`, {
        name: 'Warmmiete',
      })
      const ctx = createParams({ id: SEED.categories.miete })
      const res = await PUT_CATEGORY(req, ctx)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.name).toBe('Warmmiete')

      // Restore
      await prisma.category.update({ where: { id: SEED.categories.miete }, data: { name: 'Miete' } })
    })

    it('moves category to a different group', async () => {
      const req = createRequest('PUT', `/api/categories/${SEED.categories.miete}`, {
        groupId: SEED.groups.giroVariable,
      })
      const ctx = createParams({ id: SEED.categories.miete })
      const res = await PUT_CATEGORY(req, ctx)
      const data = await res.json()

      expect(data.groupId).toBe(SEED.groups.giroVariable)

      // Restore
      await prisma.category.update({
        where: { id: SEED.categories.miete },
        data: { groupId: SEED.groups.giroFixkosten },
      })
    })

    it('ungroups a category by setting groupId to null', async () => {
      const req = createRequest('PUT', `/api/categories/${SEED.categories.miete}`, {
        groupId: null,
      })
      const ctx = createParams({ id: SEED.categories.miete })
      const res = await PUT_CATEGORY(req, ctx)
      const data = await res.json()

      expect(data.groupId).toBeNull()

      // Restore
      await prisma.category.update({
        where: { id: SEED.categories.miete },
        data: { groupId: SEED.groups.giroFixkosten },
      })
    })

    it('updates rolloverEnabled flag', async () => {
      const req = createRequest('PUT', `/api/categories/${SEED.categories.miete}`, {
        rolloverEnabled: false,
      })
      const ctx = createParams({ id: SEED.categories.miete })
      const res = await PUT_CATEGORY(req, ctx)
      const data = await res.json()

      expect(data.rolloverEnabled).toBe(false)

      // Restore
      await prisma.category.update({
        where: { id: SEED.categories.miete },
        data: { rolloverEnabled: true },
      })
    })

    it('returns 400 for empty name', async () => {
      const req = createRequest('PUT', `/api/categories/${SEED.categories.miete}`, {
        name: '',
      })
      const ctx = createParams({ id: SEED.categories.miete })
      const res = await PUT_CATEGORY(req, ctx)

      expect(res.status).toBe(400)
    })
  })

  // ──────────────────────────────────────────────
  // DELETE /api/categories/[id] — soft delete
  // ──────────────────────────────────────────────

  describe('DELETE /api/categories/[id]', () => {
    it('soft-deletes a category', async () => {
      const req = createRequest('DELETE', `/api/categories/${SEED.categories.sonstiges}`)
      const ctx = createParams({ id: SEED.categories.sonstiges })
      const res = await DELETE_CATEGORY(req, ctx)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)

      const cat = await prisma.category.findUnique({ where: { id: SEED.categories.sonstiges } })
      expect(cat?.isActive).toBe(false)
    })
  })

  // ══════════════════════════════════════════════
  // CATEGORY GROUPS
  // ══════════════════════════════════════════════

  // ──────────────────────────────────────────────
  // GET /api/category-groups — list with optional filter
  // ──────────────────────────────────────────────

  describe('GET /api/category-groups', () => {
    it('returns all groups with categories', async () => {
      const req = createRequest('GET', '/api/category-groups')
      const res = await GET_GROUPS(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.length).toBe(4) // 2 per account
    })

    it('filters by accountId', async () => {
      const req = createRequest('GET', `/api/category-groups?accountId=${SEED.accounts.girokonto}`)
      const res = await GET_GROUPS(req)
      const data = await res.json()

      expect(data.length).toBe(2)
      expect(data.every((g: { accountId: string }) => g.accountId === SEED.accounts.girokonto)).toBe(true)
    })

    it('returns empty array for unknown accountId', async () => {
      const req = createRequest('GET', '/api/category-groups?accountId=non-existent')
      const res = await GET_GROUPS(req)
      const data = await res.json()

      expect(data).toEqual([])
    })

    it('groups are ordered by sortOrder', async () => {
      const req = createRequest('GET', '/api/category-groups')
      const res = await GET_GROUPS(req)
      const data = await res.json()

      const orders = data.map((g: { sortOrder: number }) => g.sortOrder)
      // Within each account the order should be ascending
      // (all groups are returned sorted by sortOrder)
      for (let i = 1; i < orders.length; i++) {
        expect(orders[i]).toBeGreaterThanOrEqual(orders[i - 1])
      }
    })
  })

  // ──────────────────────────────────────────────
  // POST /api/category-groups — create group
  // ──────────────────────────────────────────────

  describe('POST /api/category-groups', () => {
    it('creates a group with required fields', async () => {
      const req = createRequest('POST', '/api/category-groups', {
        name: 'Freizeit',
        accountId: SEED.accounts.girokonto,
      })
      const res = await POST_GROUP(req)
      const data = await res.json()

      expect(res.status).toBe(201)
      expect(data.name).toBe('Freizeit')
      expect(data.accountId).toBe(SEED.accounts.girokonto)
      expect(data.sortOrder).toBe(0) // default
    })

    it('creates a group with custom sortOrder', async () => {
      const req = createRequest('POST', '/api/category-groups', {
        name: 'Letzte Gruppe',
        accountId: SEED.accounts.girokonto,
        sortOrder: 99,
      })
      const res = await POST_GROUP(req)
      const data = await res.json()

      expect(data.sortOrder).toBe(99)
    })

    it('returns 400 for missing name', async () => {
      const req = createRequest('POST', '/api/category-groups', {
        accountId: SEED.accounts.girokonto,
      })
      const res = await POST_GROUP(req)

      expect(res.status).toBe(400)
    })

    it('returns 400 for missing accountId', async () => {
      const req = createRequest('POST', '/api/category-groups', {
        name: 'No Account',
      })
      const res = await POST_GROUP(req)

      expect(res.status).toBe(400)
    })

    it('returns 400 for empty name', async () => {
      const req = createRequest('POST', '/api/category-groups', {
        name: '',
        accountId: SEED.accounts.girokonto,
      })
      const res = await POST_GROUP(req)

      expect(res.status).toBe(400)
    })
  })

  // ──────────────────────────────────────────────
  // PUT /api/category-groups/[id] — update group
  // ──────────────────────────────────────────────

  describe('PUT /api/category-groups/[id]', () => {
    it('updates group name', async () => {
      const req = createRequest('PUT', `/api/category-groups/${SEED.groups.giroFixkosten}`, {
        name: 'Feste Kosten',
      })
      const ctx = createParams({ id: SEED.groups.giroFixkosten })
      const res = await PUT_GROUP(req, ctx)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.name).toBe('Feste Kosten')

      // Restore
      await prisma.categoryGroup.update({
        where: { id: SEED.groups.giroFixkosten },
        data: { name: 'Fixkosten' },
      })
    })

    it('updates sortOrder', async () => {
      const req = createRequest('PUT', `/api/category-groups/${SEED.groups.giroFixkosten}`, {
        name: 'Fixkosten',
        sortOrder: 5,
      })
      const ctx = createParams({ id: SEED.groups.giroFixkosten })
      const res = await PUT_GROUP(req, ctx)
      const data = await res.json()

      expect(data.sortOrder).toBe(5)

      // Restore
      await prisma.categoryGroup.update({
        where: { id: SEED.groups.giroFixkosten },
        data: { sortOrder: 0 },
      })
    })

    it('returns 400 for empty name', async () => {
      const req = createRequest('PUT', `/api/category-groups/${SEED.groups.giroFixkosten}`, {
        name: '',
      })
      const ctx = createParams({ id: SEED.groups.giroFixkosten })
      const res = await PUT_GROUP(req, ctx)

      expect(res.status).toBe(400)
    })
  })

  // ──────────────────────────────────────────────
  // DELETE /api/category-groups/[id] — hard delete + cascade soft-delete children
  // ──────────────────────────────────────────────

  describe('DELETE /api/category-groups/[id]', () => {
    it('deletes a group and soft-deletes its categories', async () => {
      // Create a disposable group with a category
      const group = await seedCategoryGroup(SEED.accounts.girokonto, { name: 'Disposal Group' })
      const cat = await prisma.category.create({
        data: { name: 'Disposal Cat', groupId: group.id },
      })

      const req = createRequest('DELETE', `/api/category-groups/${group.id}`)
      const ctx = createParams({ id: group.id })
      const res = await DELETE_GROUP(req, ctx)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)

      // Group is hard-deleted
      const deletedGroup = await prisma.categoryGroup.findUnique({ where: { id: group.id } })
      expect(deletedGroup).toBeNull()

      // Category is soft-deleted
      const deletedCat = await prisma.category.findUnique({ where: { id: cat.id } })
      expect(deletedCat?.isActive).toBe(false)
    })
  })
})
```

### Step 4.2 — Run and verify

```bash
npx vitest run tests/api/categories.test.ts
```

### Acceptance criteria
- [ ] All 23 test cases pass
- [ ] Category group filter by accountId works
- [ ] Cascade soft-delete on group deletion verified
- [ ] Ungrouped categories returned separately

---

## Task 5: rules.test.ts

**File:** `tests/api/rules.test.ts`
**Routes under test:**
- `src/app/api/rules/route.ts` — GET (ordered by priority desc), POST (with regex validation)
- `src/app/api/rules/[id]/route.ts` — PUT (with regex validation on update), DELETE (hard delete)

### Step 5.1 — Create rules.test.ts

```ts
// /Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp/tests/api/rules.test.ts
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { GET, POST } from '@/app/api/rules/route'
import { PUT, DELETE } from '@/app/api/rules/[id]/route'
import { createRequest, createParams, seedRule } from './helpers'
import { seedDatabase, SEED } from './seed'

describe('Rules API', () => {
  beforeAll(async () => {
    await seedDatabase()
  })

  afterEach(async () => {
    await prisma.categoryRule.deleteMany()
  })

  // ──────────────────────────────────────────────
  // GET /api/rules — list ordered by priority desc
  // ──────────────────────────────────────────────

  describe('GET /api/rules', () => {
    it('returns all rules ordered by priority desc, then name asc', async () => {
      await seedRule(SEED.categories.miete, { name: 'B Rule', priority: 1 })
      await seedRule(SEED.categories.gehalt, { name: 'A Rule', priority: 10 })
      await seedRule(SEED.categories.lebensmittel, { name: 'C Rule', priority: 1 })

      const req = createRequest('GET', '/api/rules')
      const res = await GET(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.length).toBe(3)
      // Highest priority first
      expect(data[0].name).toBe('A Rule')
      // Same priority: alphabetical
      expect(data[1].name).toBe('B Rule')
      expect(data[2].name).toBe('C Rule')
    })

    it('includes category info in response', async () => {
      await seedRule(SEED.categories.miete, { name: 'With Category' })

      const req = createRequest('GET', '/api/rules')
      const res = await GET(req)
      const data = await res.json()

      expect(data[0].category).toBeDefined()
      expect(data[0].category.id).toBe(SEED.categories.miete)
      expect(data[0].category.name).toBe('Miete')
    })

    it('returns empty array when no rules exist', async () => {
      const req = createRequest('GET', '/api/rules')
      const res = await GET(req)
      const data = await res.json()

      expect(data).toEqual([])
    })
  })

  // ──────────────────────────────────────────────
  // POST /api/rules — create rule
  // ──────────────────────────────────────────────

  describe('POST /api/rules', () => {
    it('creates a rule with CONTAINS operator', async () => {
      const req = createRequest('POST', '/api/rules', {
        name: 'Miete Regel',
        field: 'DESCRIPTION',
        operator: 'CONTAINS',
        value: 'Miete',
        categoryId: SEED.categories.miete,
        priority: 5,
      })
      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(201)
      expect(data.name).toBe('Miete Regel')
      expect(data.field).toBe('DESCRIPTION')
      expect(data.operator).toBe('CONTAINS')
      expect(data.value).toBe('Miete')
      expect(data.priority).toBe(5)
      expect(data.isActive).toBe(true)
      expect(data.category).toBeDefined()
    })

    it('creates a rule with REGEX operator (valid regex)', async () => {
      const req = createRequest('POST', '/api/rules', {
        name: 'REWE Regex',
        field: 'PAYEE',
        operator: 'REGEX',
        value: '^REWE\\s+\\d+',
        categoryId: SEED.categories.lebensmittel,
      })
      const res = await POST(req)

      expect(res.status).toBe(201)
    })

    it('returns 400 for invalid regex pattern', async () => {
      const req = createRequest('POST', '/api/rules', {
        name: 'Bad Regex',
        field: 'DESCRIPTION',
        operator: 'REGEX',
        value: '[invalid',
        categoryId: SEED.categories.miete,
      })
      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toContain('Ungültiges Regex-Pattern')
    })

    it('returns 400 for ReDoS-vulnerable regex', async () => {
      const req = createRequest('POST', '/api/rules', {
        name: 'ReDoS',
        field: 'DESCRIPTION',
        operator: 'REGEX',
        value: '(a+)+$',
        categoryId: SEED.categories.miete,
      })
      const res = await POST(req)

      expect(res.status).toBe(400)
    })

    it('creates rules with all operator types', async () => {
      const operators = ['CONTAINS', 'STARTS_WITH', 'ENDS_WITH', 'EQUALS', 'GREATER_THAN', 'LESS_THAN'] as const
      for (const op of operators) {
        const req = createRequest('POST', '/api/rules', {
          name: `Rule ${op}`,
          field: op === 'GREATER_THAN' || op === 'LESS_THAN' ? 'AMOUNT' : 'DESCRIPTION',
          operator: op,
          value: op === 'GREATER_THAN' || op === 'LESS_THAN' ? '100' : 'test',
          categoryId: SEED.categories.miete,
        })
        const res = await POST(req)
        expect(res.status).toBe(201)
      }
    })

    it('returns 400 for missing name', async () => {
      const req = createRequest('POST', '/api/rules', {
        field: 'DESCRIPTION',
        operator: 'CONTAINS',
        value: 'test',
        categoryId: SEED.categories.miete,
      })
      const res = await POST(req)

      expect(res.status).toBe(400)
    })

    it('returns 400 for missing field', async () => {
      const req = createRequest('POST', '/api/rules', {
        name: 'No Field',
        operator: 'CONTAINS',
        value: 'test',
        categoryId: SEED.categories.miete,
      })
      const res = await POST(req)

      expect(res.status).toBe(400)
    })

    it('returns 400 for invalid field value', async () => {
      const req = createRequest('POST', '/api/rules', {
        name: 'Bad Field',
        field: 'INVALID_FIELD',
        operator: 'CONTAINS',
        value: 'test',
        categoryId: SEED.categories.miete,
      })
      const res = await POST(req)

      expect(res.status).toBe(400)
    })

    it('returns 400 for empty value', async () => {
      const req = createRequest('POST', '/api/rules', {
        name: 'Empty Value',
        field: 'DESCRIPTION',
        operator: 'CONTAINS',
        value: '',
        categoryId: SEED.categories.miete,
      })
      const res = await POST(req)

      expect(res.status).toBe(400)
    })

    it('applies default priority of 0', async () => {
      const req = createRequest('POST', '/api/rules', {
        name: 'Default Priority',
        field: 'DESCRIPTION',
        operator: 'CONTAINS',
        value: 'test',
        categoryId: SEED.categories.miete,
      })
      const res = await POST(req)
      const data = await res.json()

      expect(data.priority).toBe(0)
    })
  })

  // ──────────────────────────────────────────────
  // PUT /api/rules/[id] — update rule
  // ──────────────────────────────────────────────

  describe('PUT /api/rules/[id]', () => {
    it('updates rule name', async () => {
      const rule = await seedRule(SEED.categories.miete, { name: 'Old Name' })

      const req = createRequest('PUT', `/api/rules/${rule.id}`, {
        name: 'New Name',
      })
      const ctx = createParams({ id: rule.id })
      const res = await PUT(req, ctx)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.name).toBe('New Name')
    })

    it('updates rule value with regex validation', async () => {
      const rule = await seedRule(SEED.categories.miete, {
        operator: 'REGEX',
        value: '^test',
      })

      const req = createRequest('PUT', `/api/rules/${rule.id}`, {
        value: '^updated\\d+',
      })
      const ctx = createParams({ id: rule.id })
      const res = await PUT(req, ctx)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.value).toBe('^updated\\d+')
    })

    it('returns 400 when updating REGEX rule with invalid pattern', async () => {
      const rule = await seedRule(SEED.categories.miete, {
        operator: 'REGEX',
        value: '^valid',
      })

      const req = createRequest('PUT', `/api/rules/${rule.id}`, {
        value: '[broken',
      })
      const ctx = createParams({ id: rule.id })
      const res = await PUT(req, ctx)

      expect(res.status).toBe(400)
    })

    it('changes operator to REGEX with valid pattern', async () => {
      const rule = await seedRule(SEED.categories.miete, {
        operator: 'CONTAINS',
        value: 'test',
      })

      const req = createRequest('PUT', `/api/rules/${rule.id}`, {
        operator: 'REGEX',
        value: '^test\\d+',
      })
      const ctx = createParams({ id: rule.id })
      const res = await PUT(req, ctx)

      expect(res.status).toBe(200)
    })

    it('updates priority', async () => {
      const rule = await seedRule(SEED.categories.miete, { priority: 0 })

      const req = createRequest('PUT', `/api/rules/${rule.id}`, {
        priority: 100,
      })
      const ctx = createParams({ id: rule.id })
      const res = await PUT(req, ctx)
      const data = await res.json()

      expect(data.priority).toBe(100)
    })

    it('deactivates a rule', async () => {
      const rule = await seedRule(SEED.categories.miete, { isActive: true })

      const req = createRequest('PUT', `/api/rules/${rule.id}`, {
        isActive: false,
      })
      const ctx = createParams({ id: rule.id })
      const res = await PUT(req, ctx)
      const data = await res.json()

      expect(data.isActive).toBe(false)
    })
  })

  // ──────────────────────────────────────────────
  // DELETE /api/rules/[id] — hard delete
  // ──────────────────────────────────────────────

  describe('DELETE /api/rules/[id]', () => {
    it('permanently deletes a rule', async () => {
      const rule = await seedRule(SEED.categories.miete, { name: 'To Delete' })

      const req = createRequest('DELETE', `/api/rules/${rule.id}`)
      const ctx = createParams({ id: rule.id })
      const res = await DELETE(req, ctx)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)

      const deleted = await prisma.categoryRule.findUnique({ where: { id: rule.id } })
      expect(deleted).toBeNull()
    })
  })
})
```

### Step 5.2 — Run and verify

```bash
npx vitest run tests/api/rules.test.ts
```

### Acceptance criteria
- [ ] All 19 test cases pass
- [ ] Priority ordering verified
- [ ] Regex validation tested for create and update
- [ ] ReDoS rejection tested
- [ ] All operator types tested

---

## Task 6: transactions.test.ts

**File:** `tests/api/transactions.test.ts`
**Routes under test:**
- `src/app/api/transactions/route.ts` — GET (filters, pagination, search), POST (with balance update)
- `src/app/api/transactions/[id]/route.ts` — PUT (with balance diff), DELETE (with balance rollback)

**Important:** Transaction POST/PUT/DELETE all update account balances via `balanceIncrement()`. Tests must verify balance changes. The transfer logic is complex and involves sub-accounts — we test only the basic (non-transfer) paths here.

### Step 6.1 — Create transactions.test.ts

```ts
// /Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp/tests/api/transactions.test.ts
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { GET, POST } from '@/app/api/transactions/route'
import { PUT, DELETE } from '@/app/api/transactions/[id]/route'
import { createRequest, createParams, seedTransaction } from './helpers'
import { seedDatabase, SEED } from './seed'

describe('Transactions API', () => {
  beforeAll(async () => {
    await seedDatabase()
  })

  beforeEach(async () => {
    // Reset balances to seed values before each test
    await prisma.account.update({
      where: { id: SEED.accounts.girokonto },
      data: { currentBalance: 1000 },
    })
    await prisma.account.update({
      where: { id: SEED.accounts.sparkonto },
      data: { currentBalance: 5000 },
    })
  })

  afterEach(async () => {
    // Clean up all transactions (including any paired transfers)
    // First unlink transfer pairs to avoid FK issues
    await prisma.transaction.updateMany({ data: { transferToId: null } })
    await prisma.transaction.deleteMany()
  })

  // ──────────────────────────────────────────────
  // GET /api/transactions — list with filters
  // ──────────────────────────────────────────────

  describe('GET /api/transactions', () => {
    it('returns all transactions with account and category includes', async () => {
      await seedTransaction(SEED.accounts.girokonto, {
        description: 'Mietzahlung',
        mainAmount: -800,
        mainType: 'EXPENSE',
        categoryId: SEED.categories.miete,
      })

      const req = createRequest('GET', '/api/transactions')
      const res = await GET(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.data.length).toBeGreaterThanOrEqual(1)
      expect(data.total).toBeGreaterThanOrEqual(1)
      expect(data.page).toBe(1)

      const tx = data.data.find((t: { description: string }) => t.description === 'Mietzahlung')
      expect(tx.account.name).toBe('Girokonto')
      expect(tx.category.name).toBe('Miete')
    })

    it('filters by accountId', async () => {
      await seedTransaction(SEED.accounts.girokonto, { description: 'Giro TX' })
      await seedTransaction(SEED.accounts.sparkonto, { description: 'Spar TX' })

      const req = createRequest('GET', `/api/transactions?accountId=${SEED.accounts.girokonto}`)
      const res = await GET(req)
      const data = await res.json()

      expect(data.data.every((t: { accountId: string }) => t.accountId === SEED.accounts.girokonto)).toBe(true)
    })

    it('filters by categoryId', async () => {
      await seedTransaction(SEED.accounts.girokonto, {
        description: 'With Category',
        categoryId: SEED.categories.miete,
      })
      await seedTransaction(SEED.accounts.girokonto, {
        description: 'Other Category',
        categoryId: SEED.categories.lebensmittel,
      })

      const req = createRequest('GET', `/api/transactions?categoryId=${SEED.categories.miete}`)
      const res = await GET(req)
      const data = await res.json()

      expect(data.data.every((t: { categoryId: string }) => t.categoryId === SEED.categories.miete)).toBe(true)
    })

    it('filters by date range (from/to)', async () => {
      await seedTransaction(SEED.accounts.girokonto, {
        description: 'Jan TX',
        date: new Date('2026-01-15'),
      })
      await seedTransaction(SEED.accounts.girokonto, {
        description: 'Mar TX',
        date: new Date('2026-03-15'),
      })
      await seedTransaction(SEED.accounts.girokonto, {
        description: 'Jun TX',
        date: new Date('2026-06-15'),
      })

      const req = createRequest('GET', '/api/transactions?from=2026-02-01&to=2026-04-30')
      const res = await GET(req)
      const data = await res.json()

      expect(data.data.length).toBe(1)
      expect(data.data[0].description).toBe('Mar TX')
    })

    it('searches by description', async () => {
      await seedTransaction(SEED.accounts.girokonto, { description: 'REWE Einkauf' })
      await seedTransaction(SEED.accounts.girokonto, { description: 'ALDI Einkauf' })

      const req = createRequest('GET', '/api/transactions?search=REWE')
      const res = await GET(req)
      const data = await res.json()

      expect(data.data.length).toBe(1)
      expect(data.data[0].description).toBe('REWE Einkauf')
    })

    it('searches by payee', async () => {
      await seedTransaction(SEED.accounts.girokonto, {
        description: 'Einkauf',
        payee: 'REWE GmbH',
      })
      await seedTransaction(SEED.accounts.girokonto, {
        description: 'Einkauf',
        payee: 'ALDI GmbH',
      })

      const req = createRequest('GET', '/api/transactions?search=REWE')
      const res = await GET(req)
      const data = await res.json()

      expect(data.data.length).toBeGreaterThanOrEqual(1)
      expect(data.data.some((t: { payee: string }) => t.payee === 'REWE GmbH')).toBe(true)
    })

    it('paginates results', async () => {
      // Create 5 transactions
      for (let i = 0; i < 5; i++) {
        await seedTransaction(SEED.accounts.girokonto, {
          description: `Page TX ${i}`,
          date: new Date(`2026-04-0${i + 1}`),
        })
      }

      const req = createRequest('GET', '/api/transactions?page=1&pageSize=2')
      const res = await GET(req)
      const data = await res.json()

      expect(data.data.length).toBe(2)
      expect(data.total).toBe(5)
      expect(data.page).toBe(1)
      expect(data.pageSize).toBe(2)
    })

    it('returns second page correctly', async () => {
      for (let i = 0; i < 5; i++) {
        await seedTransaction(SEED.accounts.girokonto, {
          description: `Page TX ${i}`,
          date: new Date(`2026-04-0${i + 1}`),
        })
      }

      const req = createRequest('GET', '/api/transactions?page=2&pageSize=2')
      const res = await GET(req)
      const data = await res.json()

      expect(data.data.length).toBe(2)
      expect(data.page).toBe(2)
    })

    it('returns all when pageSize=0', async () => {
      for (let i = 0; i < 3; i++) {
        await seedTransaction(SEED.accounts.girokonto, { description: `All TX ${i}` })
      }

      const req = createRequest('GET', '/api/transactions?pageSize=0')
      const res = await GET(req)
      const data = await res.json()

      expect(data.data.length).toBe(3)
    })

    it('transactions are ordered by date desc', async () => {
      await seedTransaction(SEED.accounts.girokonto, {
        description: 'Old',
        date: new Date('2026-01-01'),
      })
      await seedTransaction(SEED.accounts.girokonto, {
        description: 'New',
        date: new Date('2026-04-01'),
      })

      const req = createRequest('GET', '/api/transactions')
      const res = await GET(req)
      const data = await res.json()

      expect(data.data[0].description).toBe('New')
    })

    it('excludes transactions from inactive accounts', async () => {
      await seedTransaction(SEED.accounts.girokonto, { description: 'Active Acc TX' })

      // Soft-delete the Sparkonto and create a transaction on it
      await prisma.account.update({
        where: { id: SEED.accounts.sparkonto },
        data: { isActive: false },
      })
      await seedTransaction(SEED.accounts.sparkonto, { description: 'Inactive Acc TX' })

      const req = createRequest('GET', '/api/transactions')
      const res = await GET(req)
      const data = await res.json()

      const descriptions = data.data.map((t: { description: string }) => t.description)
      expect(descriptions).toContain('Active Acc TX')
      expect(descriptions).not.toContain('Inactive Acc TX')

      // Restore
      await prisma.account.update({
        where: { id: SEED.accounts.sparkonto },
        data: { isActive: true },
      })
    })
  })

  // ──────────────────────────────────────────────
  // POST /api/transactions — create with balance update
  // ──────────────────────────────────────────────

  describe('POST /api/transactions', () => {
    it('creates an expense transaction and decrements balance', async () => {
      const req = createRequest('POST', '/api/transactions', {
        date: '2026-04-01',
        mainAmount: -50.25,
        mainType: 'EXPENSE',
        description: 'Supermarkt',
        accountId: SEED.accounts.girokonto,
      })
      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(201)
      expect(data.mainAmount).toBe(-50.25)
      expect(data.mainType).toBe('EXPENSE')
      expect(data.description).toBe('Supermarkt')
      expect(data.status).toBe('PENDING')

      // Verify balance was updated: 1000 + (-50.25) = 949.75
      const account = await prisma.account.findUnique({ where: { id: SEED.accounts.girokonto } })
      expect(account?.currentBalance).toBe(949.75)
    })

    it('creates an income transaction and increments balance', async () => {
      const req = createRequest('POST', '/api/transactions', {
        date: '2026-04-01',
        mainAmount: 3000,
        mainType: 'INCOME',
        description: 'Gehalt April',
        accountId: SEED.accounts.girokonto,
        categoryId: SEED.categories.gehalt,
      })
      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(201)

      const account = await prisma.account.findUnique({ where: { id: SEED.accounts.girokonto } })
      expect(account?.currentBalance).toBe(4000) // 1000 + 3000
    })

    it('creates transaction with all optional fields', async () => {
      const req = createRequest('POST', '/api/transactions', {
        date: '2026-04-01',
        mainAmount: -100,
        mainType: 'EXPENSE',
        description: 'Vollständig',
        payee: 'Max Mustermann',
        notes: 'Testnotiz',
        accountId: SEED.accounts.girokonto,
        categoryId: SEED.categories.miete,
        status: 'CLEARED',
      })
      const res = await POST(req)
      const data = await res.json()

      expect(data.payee).toBe('Max Mustermann')
      expect(data.notes).toBe('Testnotiz')
      expect(data.categoryId).toBe(SEED.categories.miete)
      expect(data.status).toBe('CLEARED')
    })

    it('handles zero amount (no balance change)', async () => {
      const req = createRequest('POST', '/api/transactions', {
        date: '2026-04-01',
        mainAmount: 0,
        mainType: 'EXPENSE',
        description: 'Zero Amount',
        accountId: SEED.accounts.girokonto,
      })
      const res = await POST(req)

      expect(res.status).toBe(201)

      const account = await prisma.account.findUnique({ where: { id: SEED.accounts.girokonto } })
      expect(account?.currentBalance).toBe(1000)
    })

    it('handles null mainAmount (no balance change)', async () => {
      const req = createRequest('POST', '/api/transactions', {
        date: '2026-04-01',
        mainAmount: null,
        mainType: 'EXPENSE',
        description: 'Null Amount',
        accountId: SEED.accounts.girokonto,
      })
      const res = await POST(req)

      expect(res.status).toBe(201)

      const account = await prisma.account.findUnique({ where: { id: SEED.accounts.girokonto } })
      expect(account?.currentBalance).toBe(1000)
    })

    it('applies default status PENDING', async () => {
      const req = createRequest('POST', '/api/transactions', {
        date: '2026-04-01',
        mainAmount: -10,
        description: 'Default Status',
        accountId: SEED.accounts.girokonto,
      })
      const res = await POST(req)
      const data = await res.json()

      expect(data.status).toBe('PENDING')
    })

    it('returns 400 for missing description', async () => {
      const req = createRequest('POST', '/api/transactions', {
        date: '2026-04-01',
        mainAmount: -10,
        accountId: SEED.accounts.girokonto,
      })
      const res = await POST(req)

      expect(res.status).toBe(400)
    })

    it('returns 400 for empty description', async () => {
      const req = createRequest('POST', '/api/transactions', {
        date: '2026-04-01',
        mainAmount: -10,
        description: '',
        accountId: SEED.accounts.girokonto,
      })
      const res = await POST(req)

      expect(res.status).toBe(400)
    })

    it('returns 400 for missing accountId', async () => {
      const req = createRequest('POST', '/api/transactions', {
        date: '2026-04-01',
        mainAmount: -10,
        description: 'No Account',
      })
      const res = await POST(req)

      expect(res.status).toBe(400)
    })

    it('returns 400 for missing date', async () => {
      const req = createRequest('POST', '/api/transactions', {
        mainAmount: -10,
        description: 'No Date',
        accountId: SEED.accounts.girokonto,
      })
      const res = await POST(req)

      expect(res.status).toBe(400)
    })

    it('preserves floating-point precision via roundCents', async () => {
      const req = createRequest('POST', '/api/transactions', {
        date: '2026-04-01',
        mainAmount: -0.1,
        mainType: 'EXPENSE',
        description: 'Precision Test 1',
        accountId: SEED.accounts.girokonto,
      })
      await POST(req)

      const req2 = createRequest('POST', '/api/transactions', {
        date: '2026-04-01',
        mainAmount: -0.2,
        mainType: 'EXPENSE',
        description: 'Precision Test 2',
        accountId: SEED.accounts.girokonto,
      })
      await POST(req2)

      // 1000 + (-0.1) + (-0.2) = 999.70 (not 999.6999999...)
      const account = await prisma.account.findUnique({ where: { id: SEED.accounts.girokonto } })
      expect(account?.currentBalance).toBe(999.7)
    })
  })

  // ──────────────────────────────────────────────
  // PUT /api/transactions/[id] — update with balance diff
  // ──────────────────────────────────────────────

  describe('PUT /api/transactions/[id]', () => {
    it('updates description without changing balance', async () => {
      const tx = await seedTransaction(SEED.accounts.girokonto, {
        mainAmount: -50,
        description: 'Original',
      })

      const req = createRequest('PUT', `/api/transactions/${tx.id}`, {
        description: 'Updated',
      })
      const ctx = createParams({ id: tx.id })
      const res = await PUT(req, ctx)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.description).toBe('Updated')

      // Balance should not change
      const account = await prisma.account.findUnique({ where: { id: SEED.accounts.girokonto } })
      expect(account?.currentBalance).toBe(1000) // seedTransaction doesn't update balance
    })

    it('updates mainAmount and adjusts account balance', async () => {
      // Create via API to get correct initial balance
      const createReq = createRequest('POST', '/api/transactions', {
        date: '2026-04-01',
        mainAmount: -100,
        mainType: 'EXPENSE',
        description: 'Initial Amount',
        accountId: SEED.accounts.girokonto,
      })
      const createRes = await POST(createReq)
      const created = await createRes.json()
      // Balance is now 900

      const req = createRequest('PUT', `/api/transactions/${created.id}`, {
        mainAmount: -150,
      })
      const ctx = createParams({ id: created.id })
      const res = await PUT(req, ctx)

      expect(res.status).toBe(200)

      // Balance diff: (-150) - (-100) = -50 more
      // 900 + (-50) = 850
      const account = await prisma.account.findUnique({ where: { id: SEED.accounts.girokonto } })
      expect(account?.currentBalance).toBe(850)
    })

    it('updates status', async () => {
      const tx = await seedTransaction(SEED.accounts.girokonto, {
        status: 'PENDING',
        description: 'Status Change',
      })

      const req = createRequest('PUT', `/api/transactions/${tx.id}`, {
        status: 'CLEARED',
      })
      const ctx = createParams({ id: tx.id })
      const res = await PUT(req, ctx)
      const data = await res.json()

      expect(data.status).toBe('CLEARED')
    })

    it('updates category', async () => {
      const tx = await seedTransaction(SEED.accounts.girokonto, {
        categoryId: SEED.categories.miete,
        description: 'Category Change',
      })

      const req = createRequest('PUT', `/api/transactions/${tx.id}`, {
        categoryId: SEED.categories.lebensmittel,
      })
      const ctx = createParams({ id: tx.id })
      const res = await PUT(req, ctx)
      const data = await res.json()

      expect(data.categoryId).toBe(SEED.categories.lebensmittel)
    })

    it('returns 404 for non-existent transaction', async () => {
      const req = createRequest('PUT', '/api/transactions/non-existent', {
        description: 'Ghost',
      })
      const ctx = createParams({ id: 'non-existent' })
      const res = await PUT(req, ctx)
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.error).toBe('Nicht gefunden')
    })

    it('allows setting payee to empty string', async () => {
      const tx = await seedTransaction(SEED.accounts.girokonto, {
        payee: 'Someone',
        description: 'Payee Clear',
      })

      const req = createRequest('PUT', `/api/transactions/${tx.id}`, {
        payee: '',
      })
      const ctx = createParams({ id: tx.id })
      const res = await PUT(req, ctx)
      const data = await res.json()

      expect(data.payee).toBe('')
    })
  })

  // ──────────────────────────────────────────────
  // DELETE /api/transactions/[id] — delete with balance rollback
  // ──────────────────────────────────────────────

  describe('DELETE /api/transactions/[id]', () => {
    it('deletes transaction and reverses balance impact', async () => {
      // Create via API to get correct balance
      const createReq = createRequest('POST', '/api/transactions', {
        date: '2026-04-01',
        mainAmount: -200,
        mainType: 'EXPENSE',
        description: 'To Delete',
        accountId: SEED.accounts.girokonto,
      })
      const createRes = await POST(createReq)
      const created = await createRes.json()
      // Balance: 1000 + (-200) = 800

      const req = createRequest('DELETE', `/api/transactions/${created.id}`)
      const ctx = createParams({ id: created.id })
      const res = await DELETE(req, ctx)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)

      // Balance should be restored: 800 - (-200) = 1000
      const account = await prisma.account.findUnique({ where: { id: SEED.accounts.girokonto } })
      expect(account?.currentBalance).toBe(1000)

      // Transaction should be gone
      const deleted = await prisma.transaction.findUnique({ where: { id: created.id } })
      expect(deleted).toBeNull()
    })

    it('returns 404 for non-existent transaction', async () => {
      const req = createRequest('DELETE', '/api/transactions/non-existent')
      const ctx = createParams({ id: 'non-existent' })
      const res = await DELETE(req, ctx)
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.error).toBe('Nicht gefunden')
    })

    it('correctly reverses balance for income transaction', async () => {
      const createReq = createRequest('POST', '/api/transactions', {
        date: '2026-04-01',
        mainAmount: 500,
        mainType: 'INCOME',
        description: 'Income to Delete',
        accountId: SEED.accounts.girokonto,
      })
      const createRes = await POST(createReq)
      const created = await createRes.json()
      // Balance: 1000 + 500 = 1500

      const req = createRequest('DELETE', `/api/transactions/${created.id}`)
      const ctx = createParams({ id: created.id })
      await DELETE(req, ctx)

      const account = await prisma.account.findUnique({ where: { id: SEED.accounts.girokonto } })
      expect(account?.currentBalance).toBe(1000)
    })

    it('handles deleting transaction with zero amount', async () => {
      const createReq = createRequest('POST', '/api/transactions', {
        date: '2026-04-01',
        mainAmount: 0,
        mainType: 'EXPENSE',
        description: 'Zero Delete',
        accountId: SEED.accounts.girokonto,
      })
      const createRes = await POST(createReq)
      const created = await createRes.json()

      const req = createRequest('DELETE', `/api/transactions/${created.id}`)
      const ctx = createParams({ id: created.id })
      await DELETE(req, ctx)

      const account = await prisma.account.findUnique({ where: { id: SEED.accounts.girokonto } })
      expect(account?.currentBalance).toBe(1000)
    })
  })
})
```

### Step 6.2 — Run and verify

```bash
npx vitest run tests/api/transactions.test.ts
```

### Acceptance criteria
- [ ] All 27 test cases pass
- [ ] Balance updates verified for create, update, and delete
- [ ] Filtering by accountId, categoryId, date range, and search works
- [ ] Pagination returns correct page/total/pageSize
- [ ] Floating-point precision handled correctly
- [ ] 404 errors for non-existent transactions
- [ ] Inactive accounts excluded from listing

---

## Task 7: Update CI Workflow

**File:** `.github/workflows/ci.yml` (modify)

### Step 7.1 — Add api-integration job

```yaml
# /Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp/.github/workflows/ci.yml
name: CI

on:
  push:
    branches: ['**']
  pull_request:
    branches: [main]

jobs:
  lint-and-unit:
    name: Lint & Unit Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx prisma generate
      - run: npm run lint
      - run: npm run test:unit

  api-integration:
    name: API Integration Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx prisma generate
      # Create dev.db with schema so globalSetup can copy it
      - name: Create schema DB
        run: |
          sqlite3 prisma/dev.db < <(
            sqlite3 prisma/dev.db ".schema" 2>/dev/null || true
          )
      # If dev.db doesn't exist in CI, we need to bootstrap it from migrations
      - name: Bootstrap dev.db from schema
        run: |
          if [ ! -f prisma/dev.db ]; then
            echo "Creating dev.db from prisma/schema.prisma..."
            # Use prisma db push to create tables from schema (works with libSQL adapter)
            npx prisma db push --skip-generate 2>/dev/null || true
          fi
      - run: npm run test:api

  # E2E tests require a running app + database — will be configured in test strategy Part 2b
  # e2e:
  #   name: E2E Tests
  #   needs: [lint-and-unit, api-integration]
  #   runs-on: ubuntu-latest
  #   steps:
  #     - uses: actions/checkout@v4
  #     - uses: actions/setup-node@v4
  #       with:
  #         node-version: 22
  #         cache: npm
  #     - run: npm ci
  #     - run: npx prisma generate
  #     - run: npx playwright install --with-deps chromium
  #     - run: npm run build
  #     - run: npm run test:e2e
```

**CI Note:** The `dev.db` file is in `.gitignore` so it won't exist in CI. The `api-integration` job needs a `dev.db` with the schema so `globalSetup` can extract CREATE TABLE statements. Two approaches:

1. **Preferred:** Include a `scripts/create-schema-db.js` script (or reuse existing logic) that creates a DB from `schema.prisma`.
2. **Alternative:** Use `prisma db push` to create the schema directly.

The implementer should verify which approach works in CI and adjust accordingly. The key constraint is: `prisma/dev.db` must exist with the correct schema before `globalSetup` runs.

### Step 7.2 — Alternative: Create a CI-specific setup script

If `prisma db push` doesn't work with the libSQL adapter in CI, create a dedicated script:

```ts
// /Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp/scripts/create-test-schema.js
/**
 * Creates prisma/dev.db with the full schema for CI environments.
 * Uses the same approach as prepare-electron-db.js but creates dev.db.
 * Only needed when dev.db doesn't exist (i.e., in CI).
 */
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const devDbPath = path.join(root, 'prisma', 'dev.db')

if (fs.existsSync(devDbPath)) {
  console.log('prisma/dev.db already exists, skipping.')
  process.exit(0)
}

// In CI, we don't have dev.db. Use prisma db push to create schema.
console.log('Creating prisma/dev.db via prisma db push...')
execSync(
  `DATABASE_URL="file:${devDbPath}" npx prisma db push --skip-generate`,
  { stdio: 'inherit', cwd: root }
)
console.log('Created prisma/dev.db')
```

Then update CI step to:
```yaml
- name: Bootstrap dev.db
  run: node scripts/create-test-schema.js
```

### Acceptance criteria
- [ ] `api-integration` job runs in parallel with `lint-and-unit`
- [ ] Job installs deps, generates Prisma client, creates dev.db, runs `npm run test:api`
- [ ] All API tests pass in CI

---

## Task 8: Commit + PR

### Step 8.1 — Commit all new files

```bash
cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp"
git checkout main && git pull && git checkout -b feature/api-integration-tests

git add vitest.config.ts \
  tests/api/global-setup.ts \
  tests/api/global-teardown.ts \
  tests/api/helpers.ts \
  tests/api/seed.ts \
  tests/api/accounts.test.ts \
  tests/api/settings.test.ts \
  tests/api/categories.test.ts \
  tests/api/rules.test.ts \
  tests/api/transactions.test.ts \
  .github/workflows/ci.yml

git commit -m "feat: add API integration tests for core routes

- Test DB infrastructure: globalSetup creates test.db from dev.db schema
- accounts.test.ts: CRUD, sortOrder, soft-delete, validation (15 tests)
- settings.test.ts: get/upsert, validation (8 tests)
- categories.test.ts: categories + groups CRUD, cascading delete (23 tests)
- rules.test.ts: CRUD, priority order, regex validation (19 tests)
- transactions.test.ts: CRUD, filters, pagination, balance updates (27 tests)
- CI: api-integration job runs in parallel with lint-and-unit"

git push -u origin feature/api-integration-tests
```

### Step 8.2 — Create Draft PR

```bash
gh pr create --draft \
  --title "feat: API integration tests (Part 2a)" \
  --body "## Summary
- 5 test files covering 11 API route modules (~92 test cases)
- Test DB infrastructure using sqlite3 CLI (same pattern as Electron DB setup)
- Seed data: 2 accounts, 4 category groups, 4 categories, 1 CSV profile, app settings
- CI workflow updated with parallel api-integration job

## Test plan
- [ ] All API tests pass locally: \`npm run test:api\`
- [ ] Unit tests still pass: \`npm run test:unit\`
- [ ] CI passes on GitHub
- [ ] Test DB is created and cleaned up correctly

🤖 Generated with Claude Code"
```

### Acceptance criteria
- [ ] All files committed and pushed
- [ ] Draft PR created
- [ ] CI passes

---

## Summary

| Task | File | Test cases | Key coverage |
|------|------|-----------|-------------|
| 1 | Infrastructure (4 files) | — | DB setup, seed, helpers, cleanup |
| 2 | accounts.test.ts | 15 | CRUD, sortOrder, soft-delete, validation |
| 3 | settings.test.ts | 8 | Get/upsert, unknown keys, max length |
| 4 | categories.test.ts | 23 | Categories + groups CRUD, filter, cascade |
| 5 | rules.test.ts | 19 | CRUD, priority order, regex validation, ReDoS |
| 6 | transactions.test.ts | 27 | CRUD, filters, pagination, balance updates |
| 7 | CI update | — | Parallel api-integration job |
| 8 | Commit + PR | — | — |
| **Total** | **10 files** | **~92** | **11 route modules** |

### Design decisions

1. **Direct handler invocation** (not HTTP): Faster, no port conflicts, tests the actual code path. The `withHandler` wrapper still processes errors identically.

2. **sqlite3 CLI for DB setup** (not better-sqlite3): Avoids native module conflicts. The project already uses this pattern for Electron builds.

3. **Fixed seed IDs**: Using deterministic string IDs (e.g., `'seed-acc-girokonto'`) instead of auto-generated CUIDs. This makes test assertions cleaner and avoids needing to capture create return values.

4. **cleanAll() delete order**: Children before parents to avoid FK constraint violations. The order is carefully defined to match the Prisma schema relationships.

5. **Balance testing**: Transaction tests that need accurate balance tracking create transactions via the POST route handler (not the `seedTransaction` helper) so the balance update logic runs.

6. **Transfer tests excluded**: The transfer logic is complex (sub-accounts, paired transactions). Basic non-transfer CRUD is covered here. Transfer-specific tests can be added as a follow-up.

7. **No `filePool` / worker isolation**: All API tests share one test.db. Tests use `beforeAll` (re-seed) + `afterEach` (cleanup) to stay independent. This is simpler and fast enough for ~92 tests.
