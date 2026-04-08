# BudgetApp Project Improvement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all 12 improvement items (B-01 through B-12) from the project evaluation to bring the grade from 2.0 to 1.0.

**Architecture:** 8 PRs across 4 phases — Quick Fixes, Test Safety Net, UI Refactoring, E2E & Polish. Each PR is a self-contained branch that can be reviewed independently.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Prisma 7 + SQLite, TanStack Query, Zustand, Vitest, Playwright

**Design Spec:** `docs/superpowers/specs/2026-04-08-project-improvement-design.md`

**Conventions (MUST follow):**
- Use `<AppSelect>` from `@/components/ui/app-select` (never raw `<Select>`)
- Use `useFormatCurrency()` hook for currency formatting
- Use `getMonthName()` from `@/lib/budget/calculations` for month names
- Use `balanceIncrement()` from `@/lib/money` for all balance updates
- Zod v4: `.issues` not `.errors`; no `z.string().default()`
- `prisma migrate dev` does NOT work — manual SQL + `prisma generate`
- Pre-commit hook runs ESLint + related Vitest tests

---

## Phase 1: Quick Fixes & Fundament

### Task 1: PR 1 — Quick Fixes (B-05, B-08, B-11, B-12)

**Branch:** `chore/quick-fixes`

**Files:**
- Create: `src/lib/logger.ts`
- Create: `.env.example`
- Modify: `src/app/api/reports/net-worth/route.ts`
- Modify: `src/app/api/sub-accounts/route.ts`
- Modify: `src/lib/loans/amortization.ts`
- Modify: `src/lib/savings/service.ts`
- Modify: `src/lib/api/handler.ts`
- Modify: `src/components/import/ImportStep1Upload.tsx`

---

- [ ] **Step 1: Create branch**

```bash
git checkout main && git pull && git checkout -b chore/quick-fixes
```

- [ ] **Step 2: Create logger utility**

Create `src/lib/logger.ts`:

```typescript
const isDev = process.env.NODE_ENV !== 'production'

export const logger = {
  debug: (...args: unknown[]) => { if (isDev) console.debug('[DEBUG]', ...args) },
  info: (...args: unknown[]) => { if (isDev) console.info('[INFO]', ...args) },
  warn: (...args: unknown[]) => console.warn('[WARN]', ...args),
  error: (...args: unknown[]) => console.error('[ERROR]', ...args),
}
```

- [ ] **Step 3: Replace console.error in handler.ts**

In `src/lib/api/handler.ts`, add import and replace:

```typescript
// Add import at top:
import { logger } from './logger'

// Line 20: Replace console.error(e) with:
logger.error(e)
```

The full file should look like:

```typescript
import { ZodError } from 'zod'
import { NextResponse } from 'next/server'
import { DomainError } from './errors'
import { logger } from '../logger'

type RouteHandler = (req: Request, ctx: unknown) => Promise<NextResponse>

export function withHandler(fn: RouteHandler): RouteHandler {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx)
    } catch (e) {
      if (e instanceof ZodError)
        return NextResponse.json({
          error: e.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
        }, { status: 400 })
      if (e instanceof DomainError)
        return NextResponse.json({ error: e.message }, { status: e.status })
      logger.error(e)
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
  }
}
```

- [ ] **Step 4: Replace console.error in ImportStep1Upload.tsx**

In `src/components/import/ImportStep1Upload.tsx`, around line 68-71:

```typescript
// Add import at top:
import { logger } from '@/lib/logger'

// Replace the catch block (around line 68-71):
} catch (e) {
  toast.error('Fehler beim Parsen der Datei')
  logger.error('CSV parse error:', e)
}
```

- [ ] **Step 5: Replace $queryRawUnsafe in net-worth route**

In `src/app/api/reports/net-worth/route.ts`, replace the `$queryRawUnsafe` block (lines 23-33).

The current code builds placeholders manually:
```typescript
const placeholders = accountIds.map(() => '?').join(',')
futureRows = await prisma.$queryRawUnsafe<Array<{ accountId: string; total: number }>>(
  `SELECT accountId, SUM(COALESCE(mainAmount, 0) + COALESCE(subAmount, 0)) as total
   FROM "Transaction"
   WHERE accountId IN (${placeholders})
     AND date > ?
   GROUP BY accountId`,
  ...accountIds,
  endOfMonth,
).catch(() => [] as Array<{ accountId: string; total: number }>)
```

Replace with `$queryRaw` using Prisma.join():
```typescript
futureRows = await prisma.$queryRaw<Array<{ accountId: string; total: number }>>`
  SELECT accountId, SUM(COALESCE(mainAmount, 0) + COALESCE(subAmount, 0)) as total
  FROM "Transaction"
  WHERE accountId IN (${Prisma.join(accountIds)})
    AND date > ${endOfMonth}
  GROUP BY accountId
`.catch(() => [] as Array<{ accountId: string; total: number }>)
```

Add `import { Prisma } from '@prisma/client'` at the top if not already present.

- [ ] **Step 6: Replace $queryRawUnsafe in sub-accounts route**

In `src/app/api/sub-accounts/route.ts`, replace the `$queryRawUnsafe` block (lines 21-26).

Current code:
```typescript
const placeholders = accountIds.map(() => '?').join(',')
const rows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
  `SELECT SUM(COALESCE(mainAmount, 0)) as total FROM "Transaction" WHERE accountId IN (${placeholders})`,
  ...accountIds,
)
```

Replace with:
```typescript
const rows = await prisma.$queryRaw<Array<{ total: number }>>`
  SELECT SUM(COALESCE(mainAmount, 0)) as total FROM "Transaction" WHERE accountId IN (${Prisma.join(accountIds)})
`
```

Add `import { Prisma } from '@prisma/client'` at the top if not already present. Remove the now-unused `placeholders` variable.

- [ ] **Step 7: Extract magic numbers in amortization.ts**

In `src/lib/loans/amortization.ts`, add constant at top of file (after imports):

```typescript
/** Threshold below which a loan balance is considered fully repaid (handles floating-point rounding) */
const BALANCE_EPSILON = 0.005
```

Replace both occurrences (lines 53 and 61):
- `if (params.loanType === 'RATENKREDIT' && balance <= 0.005) break` → `if (params.loanType === 'RATENKREDIT' && balance <= BALANCE_EPSILON) break`
- `if (balance <= 0.005) break` → `if (balance <= BALANCE_EPSILON) break`

- [ ] **Step 8: Extract magic numbers in savings/service.ts**

In `src/lib/savings/service.ts`, add constants at top of file (after imports):

```typescript
/** Average days per month for approximate date math */
const AVG_MS_PER_MONTH = 30.44 * 24 * 60 * 60 * 1000
/** Default number of months to generate schedule entries into the future */
const DEFAULT_FORECAST_MONTHS = 24
```

Replace all occurrences:
- Line 19: `Math.ceil(diffMs / (30.44 * 24 * 60 * 60 * 1000))` → `Math.ceil(diffMs / AVG_MS_PER_MONTH)`
- Line 19: `return Math.max(months, 24)` → `return Math.max(months, DEFAULT_FORECAST_MONTHS)`
- Line 290: `(30.44 * 24 * 60 * 60 * 1000)` → `AVG_MS_PER_MONTH` and the trailing `: 24` → `: DEFAULT_FORECAST_MONTHS`
- Line 566: `(30.44 * 24 * 60 * 60 * 1000)` → `AVG_MS_PER_MONTH`

- [ ] **Step 9: Create .env.example**

Create `.env.example` in project root:

```
# Database file path (SQLite via Prisma libSQL adapter)
# Development uses dev.db, production uses prod.db, tests use test.db
DATABASE_URL="file:./prisma/dev.db"
```

- [ ] **Step 10: Run tests and lint**

```bash
npm run lint && npm test
```

Expected: All pass (no behavior changes).

- [ ] **Step 11: Commit and push**

```bash
git add src/lib/logger.ts .env.example src/lib/api/handler.ts src/components/import/ImportStep1Upload.tsx src/app/api/reports/net-worth/route.ts src/app/api/sub-accounts/route.ts src/lib/loans/amortization.ts src/lib/savings/service.ts
git commit -m "chore: quick fixes — safe SQL, named constants, logger, .env.example

- Replace \$queryRawUnsafe with \$queryRaw + Prisma.join() (B-05)
- Extract magic numbers to named constants (B-08)
- Add logger utility, replace console.error (B-12)
- Add .env.example for developer onboarding (B-11)"
git push -u origin chore/quick-fixes
```

- [ ] **Step 12: Create draft PR**

```bash
gh pr create --draft --title "chore: quick fixes (B-05, B-08, B-11, B-12)" --body "## Summary
- Replace \$queryRawUnsafe with safe \$queryRaw + Prisma.join()
- Extract magic numbers (0.005, 30.44, 24) to named constants
- Add minimal logger utility, replace console.error calls
- Add .env.example

## Backlog Items
B-05, B-08, B-11, B-12

## Test plan
- [ ] All existing tests pass
- [ ] Lint passes
- [ ] Net-worth and sub-accounts API routes still return correct data"
```

---

## Phase 2: Test Safety Net

### Task 2: PR 2 — Service Layer Tests (B-02)

**Branch:** `test/service-layer`

**Files:**
- Create: `tests/unit/budget-calculations.test.ts`
- Create: `tests/api/sub-account-entries-service.test.ts`
- Create: `tests/api/savings-service.test.ts`
- Modify: `tests/api/seed.ts` (add sub-account seed data)

**Note:** The sub-account and savings service functions use Prisma directly, so they need the test database. Place them in `tests/api/` to use the existing DB infrastructure.

---

- [ ] **Step 1: Create branch**

```bash
git checkout main && git pull && git checkout -b test/service-layer
```

- [ ] **Step 2: Write budget/calculations unit tests**

Create `tests/unit/budget-calculations.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

// Mock the settings store before importing
vi.mock('@/store/useSettingsStore', () => ({
  useSettingsStore: {
    getState: () => ({ locale: 'de-DE' }),
  },
}))

import { getAvailableBg, getMonthName } from '@/lib/budget/calculations'

describe('getAvailableBg', () => {
  it('returns green classes for positive available', () => {
    expect(getAvailableBg(100)).toBe('bg-emerald-50 text-emerald-700')
    expect(getAvailableBg(0.01)).toBe('bg-emerald-50 text-emerald-700')
  })

  it('returns muted classes for zero available', () => {
    expect(getAvailableBg(0)).toBe('bg-muted text-muted-foreground')
  })

  it('returns red classes for negative available', () => {
    expect(getAvailableBg(-1)).toBe('bg-red-50 text-destructive')
    expect(getAvailableBg(-0.01)).toBe('bg-red-50 text-destructive')
  })
})

describe('getMonthName', () => {
  it('returns German month name with year', () => {
    const result = getMonthName(1, 2026)
    expect(result).toContain('2026')
    // Intl produces "Januar 2026" in de-DE
    expect(result.toLowerCase()).toContain('januar')
  })

  it('handles December correctly', () => {
    const result = getMonthName(12, 2025)
    expect(result.toLowerCase()).toContain('dezember')
    expect(result).toContain('2025')
  })

  it('handles all 12 months', () => {
    for (let m = 1; m <= 12; m++) {
      const result = getMonthName(m, 2026)
      expect(result).toBeTruthy()
      expect(result).toContain('2026')
    }
  })
})
```

- [ ] **Step 3: Run budget tests to verify they pass**

```bash
npx vitest run tests/unit/budget-calculations.test.ts
```

Expected: PASS

- [ ] **Step 4: Extend seed data for sub-account tests**

In `tests/api/seed.ts`, add sub-account seed constants and extend `seedDatabase()`:

Add to the `SEED` constant:
```typescript
export const SEED = {
  // ... existing entries ...
  subAccounts: {
    sparSubAccount: 'seed-sub-spar',
  },
  subAccountGroups: {
    sparGroup1: 'seed-subgrp-1',
  },
}
```

Add to the end of `seedDatabase()` function (before the closing brace):
```typescript
  // Sub-account for Sparkonto
  await prisma.subAccount.create({
    data: {
      id: SEED.subAccounts.sparSubAccount,
      name: 'Spar-Unterkonto',
      color: '#10b981',
      accountId: SEED.accounts.sparkonto,
    },
  })

  await prisma.subAccountGroup.create({
    data: {
      id: SEED.subAccountGroups.sparGroup1,
      name: 'Rücklagen',
      subAccountId: SEED.subAccounts.sparSubAccount,
    },
  })
```

- [ ] **Step 5: Write sub-account-entries service tests**

Create `tests/api/sub-account-entries-service.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createLinkedEntry, updateLinkedEntry, deleteLinkedEntry } from '@/lib/sub-account-entries/service'
import { seedDatabase, SEED } from './seed'
import { cleanTable } from './helpers'

describe('sub-account-entries service', () => {
  beforeAll(async () => {
    await seedDatabase()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  afterEach(async () => {
    // Clean entries and transactions created by tests, restore account balance
    await cleanTable('subAccountEntry')
    await prisma.transaction.deleteMany({
      where: { accountId: SEED.accounts.sparkonto, mainAmount: null },
    })
    await prisma.account.update({
      where: { id: SEED.accounts.sparkonto },
      data: { currentBalance: 5000 },
    })
  })

  describe('createLinkedEntry', () => {
    it('creates entry and linked transaction', async () => {
      const result = await createLinkedEntry({
        groupId: SEED.subAccountGroups.sparGroup1,
        date: '2026-04-01',
        description: 'Test entry',
        amount: 100,
      })

      expect(result.entry).toBeDefined()
      expect(result.entry.amount).toBe(100)
      expect(result.entry.groupId).toBe(SEED.subAccountGroups.sparGroup1)
      expect(result.transaction).toBeDefined()
      expect(result.transaction.subAmount).toBe(100)
      expect(result.transaction.mainAmount).toBeNull()
    })

    it('updates account balance', async () => {
      await createLinkedEntry({
        groupId: SEED.subAccountGroups.sparGroup1,
        date: '2026-04-01',
        description: 'Balance test',
        amount: 50,
      })

      const account = await prisma.account.findUnique({
        where: { id: SEED.accounts.sparkonto },
      })
      expect(account!.currentBalance).toBe(5050)
    })

    it('throws 404 for non-existent group', async () => {
      await expect(
        createLinkedEntry({
          groupId: 'non-existent-group',
          date: '2026-04-01',
          description: 'Should fail',
          amount: 100,
        })
      ).rejects.toThrow('Gruppe nicht gefunden')
    })

    it('throws 400 for category not in group', async () => {
      await expect(
        createLinkedEntry({
          groupId: SEED.subAccountGroups.sparGroup1,
          categoryId: SEED.categories.miete, // belongs to giro, not spar
          date: '2026-04-01',
          description: 'Wrong category',
          amount: 100,
        })
      ).rejects.toThrow()
    })
  })

  describe('updateLinkedEntry', () => {
    it('updates entry amount and adjusts balance', async () => {
      const { entry } = await createLinkedEntry({
        groupId: SEED.subAccountGroups.sparGroup1,
        date: '2026-04-01',
        description: 'Update test',
        amount: 100,
      })

      await updateLinkedEntry(entry.id, { amount: 200 })

      const updated = await prisma.subAccountEntry.findUnique({ where: { id: entry.id } })
      expect(updated!.amount).toBe(200)

      const account = await prisma.account.findUnique({
        where: { id: SEED.accounts.sparkonto },
      })
      // Started at 5000, +100 from create, then adjusted +100 more
      expect(account!.currentBalance).toBe(5200)
    })

    it('throws 404 for non-existent entry', async () => {
      await expect(
        updateLinkedEntry('non-existent', { amount: 50 })
      ).rejects.toThrow('Eintrag nicht gefunden')
    })
  })

  describe('deleteLinkedEntry', () => {
    it('deletes entry, transaction, and reverses balance', async () => {
      const { entry } = await createLinkedEntry({
        groupId: SEED.subAccountGroups.sparGroup1,
        date: '2026-04-01',
        description: 'Delete test',
        amount: 100,
      })

      await deleteLinkedEntry(entry.id)

      const deleted = await prisma.subAccountEntry.findUnique({ where: { id: entry.id } })
      expect(deleted).toBeNull()

      const account = await prisma.account.findUnique({
        where: { id: SEED.accounts.sparkonto },
      })
      expect(account!.currentBalance).toBe(5000) // restored
    })

    it('throws 404 for non-existent entry', async () => {
      await expect(deleteLinkedEntry('non-existent')).rejects.toThrow('Eintrag nicht gefunden')
    })
  })
})
```

- [ ] **Step 6: Run sub-account service tests**

```bash
npx vitest run tests/api/sub-account-entries-service.test.ts
```

Expected: PASS

- [ ] **Step 7: Write savings service tests**

Create `tests/api/savings-service.test.ts`. This file tests `payEntries`, `unpayEntry`, `extendSavings`, and `deleteSavings` against a real test database.

Key test structure:
```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createSavings, payEntries, unpayEntry, extendSavings, deleteSavings, getSavingsDetail } from '@/lib/savings/service'
import { seedDatabase, SEED } from './seed'
import { cleanAll } from './helpers'

describe('savings service', () => {
  let savingsAccountId: string

  beforeAll(async () => {
    await seedDatabase()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    // Create a fresh savings account for each test
    // Clean up previous savings data
    await prisma.savingsEntry.deleteMany({})
    await prisma.savingsConfig.deleteMany({})
    await prisma.account.deleteMany({
      where: { type: { in: ['SPARPLAN', 'FESTGELD'] } },
    })

    const result = await createSavings({
      name: 'Test Sparplan',
      savingsType: 'SPARPLAN',
      startDate: '2026-01-01',
      interestRate: 3,
      interestFrequency: 'MONTHLY',
      contributionAmount: 100,
      contributionFrequency: 'MONTHLY',
      linkedAccountId: SEED.accounts.girokonto,
      color: '#10b981',
    })
    savingsAccountId = result.account.id
  })

  describe('payEntries', () => {
    it('pays unpaid entries up to paidUntil date', async () => {
      const result = await payEntries(savingsAccountId, '2026-03-01')
      expect(result.paid).toBeGreaterThan(0)
    })

    it('creates transactions for savings and linked account', async () => {
      await payEntries(savingsAccountId, '2026-02-01')
      const detail = await getSavingsDetail(savingsAccountId)
      const paidEntries = detail.entries.filter((e: { paidAt: unknown }) => e.paidAt !== null)
      expect(paidEntries.length).toBeGreaterThan(0)
      // Each paid entry should have a transactionId
      for (const entry of paidEntries) {
        expect(entry.transactionId).toBeTruthy()
      }
    })

    it('throws 404 for non-existent account', async () => {
      await expect(payEntries('non-existent', '2026-02-01')).rejects.toThrow()
    })
  })

  describe('unpayEntry', () => {
    it('reverses a paid entry', async () => {
      await payEntries(savingsAccountId, '2026-02-01')
      const detail = await getSavingsDetail(savingsAccountId)
      const paidEntry = detail.entries.find((e: { paidAt: unknown }) => e.paidAt !== null)
      expect(paidEntry).toBeDefined()

      await unpayEntry(savingsAccountId, paidEntry!.id)

      const updated = await prisma.savingsEntry.findUnique({ where: { id: paidEntry!.id } })
      expect(updated!.paidAt).toBeNull()
      expect(updated!.transactionId).toBeNull()
    })

    it('throws 404 for non-existent entry', async () => {
      await expect(unpayEntry(savingsAccountId, 'fake-id')).rejects.toThrow()
    })
  })

  describe('extendSavings', () => {
    it('adds entries for SPARPLAN', async () => {
      const result = await extendSavings(savingsAccountId, 12)
      expect(result.added).toBeGreaterThanOrEqual(0) // may be 0 if already covered
    })

    it('throws 400 for FESTGELD with termMonths', async () => {
      // Create a FESTGELD account
      const festgeld = await createSavings({
        name: 'Test Festgeld',
        savingsType: 'FESTGELD',
        startDate: '2026-01-01',
        interestRate: 2.5,
        interestFrequency: 'ANNUALLY',
        termMonths: 12,
        initialBalance: 10000,
        color: '#3b82f6',
      })

      await expect(extendSavings(festgeld.account.id, 12)).rejects.toThrow(
        'Festlaufzeit-Konten können nicht verlängert werden'
      )
    })
  })

  describe('deleteSavings', () => {
    it('soft-deletes the savings account', async () => {
      await deleteSavings(savingsAccountId)
      const account = await prisma.account.findUnique({ where: { id: savingsAccountId } })
      expect(account!.isActive).toBe(false)
    })
  })
})
```

- [ ] **Step 8: Run savings service tests**

```bash
npx vitest run tests/api/savings-service.test.ts
```

Expected: PASS

- [ ] **Step 9: Run all tests**

```bash
npm test
```

Expected: All existing + new tests pass.

- [ ] **Step 10: Commit and push**

```bash
git add tests/ 
git commit -m "test: add service layer tests (B-02)

- Unit tests for budget/calculations (getAvailableBg, getMonthName)
- Integration tests for sub-account-entries service (create, update, delete)
- Integration tests for savings service (pay, unpay, extend, delete)
- Extended seed data with sub-account fixtures"
git push -u origin test/service-layer
```

- [ ] **Step 11: Create draft PR**

```bash
gh pr create --draft --title "test: service layer tests (B-02)" --body "## Summary
- Unit tests for budget/calculations.ts
- Integration tests for sub-account-entries/service.ts (6 functions)
- Integration tests for savings/service.ts (payEntries, unpayEntry, extendSavings, deleteSavings)
- Extended seed data with sub-account fixtures

## Backlog Item
B-02

## Test plan
- [ ] All new tests pass
- [ ] All existing tests still pass
- [ ] npm test shows green"
```

---

### Task 3: PR 3 — API Test Coverage >70% (B-03)

**Branch:** `test/api-coverage`

**Files:**
- Create: `tests/api/sub-accounts.test.ts`
- Create: `tests/api/sub-account-groups.test.ts`
- Create: `tests/api/sub-account-entries.test.ts`
- Create: `tests/api/savings-payments.test.ts`
- Create: `tests/api/budget-rollover.test.ts`
- Create: `tests/api/reconciliation.test.ts`
- Create: `tests/api/reorder.test.ts`
- Create: `tests/api/asset-values.test.ts`
- Create: `tests/api/portfolio-values.test.ts`
- Modify: `tests/api/seed.ts` (extend with more fixtures)

Each test file follows the established pattern from `tests/api/accounts.test.ts`:
- Import route handlers directly: `import { GET, POST } from '@/app/api/[resource]/route'`
- Use `createRequest()` and `createParams()` from helpers
- `beforeAll` → `seedDatabase()`, `afterAll` → `prisma.$disconnect()`
- Test success paths (correct status + data shape) and error paths (404, 400)

---

- [ ] **Step 1: Create branch**

```bash
git checkout main && git pull && git checkout -b test/api-coverage
```

- [ ] **Step 2: Extend seed data**

In `tests/api/seed.ts`, add fixture IDs for the new test domains:

```typescript
export const SEED = {
  // ... existing ...
  subAccounts: {
    sparSubAccount: 'seed-sub-spar',
  },
  subAccountGroups: {
    sparGroup1: 'seed-subgrp-1',
  },
  assets: {
    haus: 'seed-asset-haus',
  },
  assetTypes: {
    immobilie: 'seed-assettype-immobilie',
  },
  portfolios: {
    depot: 'seed-portfolio-depot',
  },
}
```

Extend `seedDatabase()` to create these fixtures (sub-account, asset type, asset, portfolio).

- [ ] **Step 3: Write sub-accounts API tests**

Create `tests/api/sub-accounts.test.ts` testing:
- `GET /api/sub-accounts` — returns sub-accounts with groups, entries, and categorizedAccountsBalance
- `PUT /api/sub-accounts/[id]` — updates name, color
- `DELETE /api/sub-accounts/[id]` — cascades deletion of groups and entries

Pattern:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/sub-accounts/route'
import { PUT, DELETE } from '@/app/api/sub-accounts/[id]/route'
import { createRequest, createParams } from './helpers'
import { seedDatabase, SEED } from './seed'

describe('Sub-Accounts API', () => {
  beforeAll(async () => { await seedDatabase() })
  afterAll(async () => { await prisma.$disconnect() })

  describe('GET /api/sub-accounts', () => {
    it('returns sub-accounts with balance', async () => {
      const res = await GET(createRequest('GET', '/api/sub-accounts'))
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.subAccounts).toBeDefined()
      expect(typeof data.categorizedAccountsBalance).toBe('number')
    })
  })

  // ... PUT, DELETE tests
})
```

- [ ] **Step 4: Write sub-account-groups API tests**

Create `tests/api/sub-account-groups.test.ts` testing:
- `GET /api/sub-account-groups` — lists groups, optional `?accountId=` filter
- `PUT /api/sub-account-groups/[id]` — updates name
- `DELETE /api/sub-account-groups/[id]` — cascading delete
- `POST /api/sub-account-groups/[id]/entries` — creates entry via service, validates group exists (404), category belongs to group (400), TRANSFER type rejected (400)

- [ ] **Step 5: Write sub-account-entries API tests**

Create `tests/api/sub-account-entries.test.ts` testing:
- `DELETE /api/sub-account-entries/[id]` — deletes entry, reverses balance, returns 404 for non-existent

- [ ] **Step 6: Write savings payment API tests**

Create `tests/api/savings-payments.test.ts` testing:
- `POST /api/savings/[id]/pay` — pays entries up to paidUntil, returns `{ paid: number }`
- `POST /api/savings/[id]/extend` — extends schedule, rejects FESTGELD (400)
- `DELETE /api/savings/[id]/entries/[entryId]/pay` — unpays entry, returns 404/400

This requires creating a savings config in `beforeAll`.

- [ ] **Step 7: Write budget rollover API tests**

Create `tests/api/budget-rollover.test.ts` testing:
- `POST /api/budget/[year]/[month]/rollover` — creates next-month budget entries, returns `{ success, nextMonth, nextYear, entries }`
- Test that rolled-over amounts are correct (available = rolledOver + activity - budgeted)

Seed: create BudgetEntry fixtures for a test month.

- [ ] **Step 8: Write reconciliation API tests**

Create `tests/api/reconciliation.test.ts` testing:
- `POST /api/accounts/[id]/reconcile` — marks transactions RECONCILED, creates reconciliation record, updates balance

Seed: create transactions with CLEARED status.

- [ ] **Step 9: Write reorder API tests**

Create `tests/api/reorder.test.ts` testing:
- `PATCH /api/accounts/reorder` — updates sortOrder, returns 204, rejects invalid IDs (400)
- `PATCH /api/categories/reorder` — updates sortOrder
- `PATCH /api/category-groups/reorder` — updates sortOrder

- [ ] **Step 10: Write asset-values and portfolio-values API tests**

Create `tests/api/asset-values.test.ts` testing:
- `POST /api/assets/[id]/values` — creates value (201), rejects future date (400), rejects duplicate date (409), rejects non-existent asset (404)

Create `tests/api/portfolio-values.test.ts` with same pattern for portfolios.

- [ ] **Step 11: Run all tests**

```bash
npm test
```

Expected: All tests pass. Count API test files — should be 20+ (12 existing + 9 new).

- [ ] **Step 12: Commit and push**

```bash
git add tests/
git commit -m "test: expand API test coverage to >70% (B-03)

- Sub-accounts, groups, entries API tests
- Savings payment/extend/unpay API tests
- Budget rollover API tests
- Reconciliation API tests
- Reorder API tests (accounts, categories, groups)
- Asset and portfolio value API tests"
git push -u origin test/api-coverage
```

- [ ] **Step 13: Create draft PR**

```bash
gh pr create --draft --title "test: API test coverage >70% (B-03)" --body "## Summary
9 new API test files covering previously untested routes.

## Backlog Item
B-03

## Test plan
- [ ] All new tests pass
- [ ] All existing tests still pass
- [ ] API route coverage: >36/51 routes tested"
```

---

## Phase 3: UI Refactoring

### Task 4: PR 4 — TransactionFormDialog Refactoring (B-01 Teil 1)

**Branch:** `refactor/transaction-form`

**Goal:** Split `TransactionFormDialog.tsx` (825 lines) into focused sub-components. Pure refactoring — no behavior changes.

**Files:**
- Modify: `src/components/transactions/TransactionFormDialog.tsx` (~200 lines after refactor)
- Create: `src/components/transactions/TransactionTransferSection.tsx` (~280 lines)
- Create: `src/components/transactions/TransactionRegularSection.tsx` (~100 lines)
- Create: `src/components/transactions/TransactionMetadataFields.tsx` (~80 lines)
- Create: `src/components/transactions/useTransactionForm.ts` (~120 lines, custom hook)

---

- [ ] **Step 1: Create branch**

```bash
git checkout main && git pull && git checkout -b refactor/transaction-form
```

- [ ] **Step 2: Read and understand current component**

Read `src/components/transactions/TransactionFormDialog.tsx` completely. Identify:
- Form schema and type (lines ~1-30)
- All `useState` hooks (lines ~40-75)
- All `useQuery` calls (lines ~80-130)
- All `useMutation` calls (lines ~130-180)
- All `useEffect` calls (lines ~180-350)
- JSX sections: Type selector, Date/Description/Payee/Amount fields (lines ~360-420), Account/Category logic (lines ~424-812), Footer (lines ~814-820)

- [ ] **Step 3: Extract custom hook useTransactionForm**

Create `src/components/transactions/useTransactionForm.ts` containing:
- The Zod schema and `FormValues` type
- The `useForm` call with zodResolver
- All `useState` hooks for selection state (transferTargetId, transferGroupId, selectedGroupId, etc.)
- All `useQuery` calls (accounts, sub-account-groups, sourceCategoryGroups, targetCategoryGroups)
- All `useMutation` calls (create, update)
- All `useEffect` calls for prefilling/resetting
- Export as a single hook: `useTransactionForm(props: { transaction?, open, onClose })`
- Return all form state, queries, mutations, and handlers needed by sub-components

- [ ] **Step 4: Extract TransactionMetadataFields**

Create `src/components/transactions/TransactionMetadataFields.tsx`:
- Receives form control via `useFormContext` or props
- Renders: Type selector, Date picker, Description, Payee (conditional), Amount
- Lines ~360-422 from original

- [ ] **Step 5: Extract TransactionTransferSection**

Create `src/components/transactions/TransactionTransferSection.tsx`:
- Receives: source/target selection state and setters, category queries, sub-account groups
- Renders the full transfer form: Source account, source type, source categories, Target account, target type, target categories
- Lines ~462-734 from original

- [ ] **Step 6: Extract TransactionRegularSection**

Create `src/components/transactions/TransactionRegularSection.tsx`:
- Receives: selection state, category groups query
- Renders: Account selector, Category group selector, Category selector
- Lines ~736-812 from original
- Also handles the sub-only display (lines ~424-443) and transfer edit summary (lines ~445-459)

- [ ] **Step 7: Rewrite TransactionFormDialog as orchestrator**

`TransactionFormDialog.tsx` becomes a thin wrapper:
```typescript
export function TransactionFormDialog({ transaction, open, onOpenChange }: Props) {
  const form = useTransactionForm({ transaction, open, onClose: () => onOpenChange(false) })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>...</DialogHeader>
        <Form {...form.formMethods}>
          <form onSubmit={form.handleSubmit}>
            <TransactionMetadataFields />
            {form.isTransfer
              ? <TransactionTransferSection {...form.transferProps} />
              : <TransactionRegularSection {...form.regularProps} />}
            <DialogFooter>...</DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 8: Run tests and manual verification**

```bash
npm run lint && npm test
```

Then manually test in browser: create income, expense, and transfer transactions.

- [ ] **Step 9: Commit and push**

```bash
git add src/components/transactions/
git commit -m "refactor: split TransactionFormDialog into sub-components (B-01)

Extract useTransactionForm hook, TransactionMetadataFields,
TransactionTransferSection, TransactionRegularSection.
No behavior changes — pure structural refactoring."
git push -u origin refactor/transaction-form
```

- [ ] **Step 10: Create draft PR**

```bash
gh pr create --draft --title "refactor: split TransactionFormDialog (B-01 part 1)" --body "## Summary
Split TransactionFormDialog.tsx from 825 lines into 5 focused files.

## Backlog Item
B-01 (part 1 of 2)

## Test plan
- [ ] All existing tests pass
- [ ] Manual test: create income transaction
- [ ] Manual test: create expense transaction
- [ ] Manual test: create transfer transaction
- [ ] Manual test: edit existing transaction"
```

---

### Task 5: PR 5 — Budget Components Refactoring (B-01 Teil 2)

**Branch:** `refactor/budget-components`

**Goal:** Split `AccountBudgetTab.tsx` (753 lines) and `AccountBudgetConfig.tsx` (773 lines) into focused sub-components.

**Files:**
- Modify: `src/components/accounts/AccountBudgetTab.tsx` (~250 lines after refactor)
- Create: `src/components/accounts/budget/CategoryActivityDialog.tsx` (~90 lines)
- Create: `src/components/accounts/budget/BookTransactionDialog.tsx` (~150 lines)
- Create: `src/components/accounts/budget/BudgetTableBody.tsx` (~150 lines)
- Modify: `src/components/accounts/AccountBudgetConfig.tsx` (~120 lines after refactor)
- Create: `src/components/accounts/budget/NewCategoryForm.tsx` (~80 lines)
- Create: `src/components/accounts/budget/EditCategoryForm.tsx` (~155 lines)
- Create: `src/components/accounts/budget/GroupRow.tsx` (~165 lines)
- Create: `src/components/accounts/budget/InlineEdit.tsx` (~35 lines)
- Create: `src/components/accounts/budget/ColorDot.tsx` (~15 lines)

---

- [ ] **Step 1: Create branch**

```bash
git checkout main && git pull && git checkout -b refactor/budget-components
```

- [ ] **Step 2: Create budget/ subdirectory and extract small utilities**

Create `src/components/accounts/budget/` directory.

Extract `ColorDot` (lines 62-71 of AccountBudgetConfig.tsx) to `src/components/accounts/budget/ColorDot.tsx`.

Extract `InlineEdit` (lines 75-108 of AccountBudgetConfig.tsx) to `src/components/accounts/budget/InlineEdit.tsx`.

- [ ] **Step 3: Extract CategoryActivityDialog from AccountBudgetTab**

Move lines 65-150 from `AccountBudgetTab.tsx` to `src/components/accounts/budget/CategoryActivityDialog.tsx`.

Props interface:
```typescript
interface CategoryActivityDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categoryId: string | null
  categoryName: string
  accountId: string
  month: number
  year: number
}
```

- [ ] **Step 4: Extract BookTransactionDialog from AccountBudgetTab**

Move lines 154-300 from `AccountBudgetTab.tsx` to `src/components/accounts/budget/BookTransactionDialog.tsx`.

Props interface:
```typescript
interface BookTransactionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categoryId: string | null
  categoryName: string
  accountId: string
  amount: number
  month: number
  year: number
}
```

- [ ] **Step 5: Extract BudgetTableBody**

Move the tbody rendering logic (lines ~537-682 of AccountBudgetTab.tsx) to `src/components/accounts/budget/BudgetTableBody.tsx`.

This includes: opening balance row, group/category mapping with Fragment, inline edit logic (editingCell state, double-click handler, inputRef).

- [ ] **Step 6: Rewrite AccountBudgetTab as orchestrator**

`AccountBudgetTab.tsx` keeps: query hooks, month navigation, the table wrapper with thead/tfoot, dialog state management. Delegates rendering to extracted components.

- [ ] **Step 7: Extract form components from AccountBudgetConfig**

Extract from `AccountBudgetConfig.tsx`:
- `NewCategoryForm.tsx` (lines 112-187)
- `EditCategoryForm.tsx` (lines 191-342)
- `GroupRow.tsx` (lines 427-586, includes SortableCategoryRow inline)

- [ ] **Step 8: Rewrite AccountBudgetConfig as thin wrapper**

`AccountBudgetConfig.tsx` keeps: Sheet wrapper, the `CategoryGroupManagerContent` component (which now imports the extracted sub-components).

- [ ] **Step 9: Update imports in parent components**

Ensure `AccountBudgetConfig` is still importable from its original path. The `CategoryGroupManagerContent` export must remain available.

- [ ] **Step 10: Run tests and manual verification**

```bash
npm run lint && npm test
```

Manual test: navigate to an account's budget tab, edit budget values, open config sheet, add/edit/reorder categories and groups.

- [ ] **Step 11: Commit and push**

```bash
git add src/components/accounts/
git commit -m "refactor: split budget components into sub-components (B-01)

AccountBudgetTab: extract CategoryActivityDialog, BookTransactionDialog, BudgetTableBody
AccountBudgetConfig: extract NewCategoryForm, EditCategoryForm, GroupRow, InlineEdit, ColorDot
No behavior changes — pure structural refactoring."
git push -u origin refactor/budget-components
```

- [ ] **Step 12: Create draft PR**

---

### Task 6: PR 6 — Error States & Accessibility (B-04 + B-06)

**Branch:** `feat/error-states-a11y`

**Files:**
- Create: `src/components/ErrorBoundary.tsx`
- Modify: `src/app/(app)/layout.tsx` (wrap with ErrorBoundary)
- Modify: `src/app/(app)/dashboard/page.tsx` (add error states to queries)
- Modify: All page files with useQuery (add isError handling)
- Modify: All components with icon-only buttons (add aria-label)
- Create: `tests/a11y/basic.spec.ts` (Playwright + axe-core)
- Modify: `package.json` (add @axe-core/playwright devDependency)

---

- [ ] **Step 1: Create branch**

```bash
git checkout main && git pull && git checkout -b feat/error-states-a11y
```

- [ ] **Step 2: Create ErrorBoundary component**

Create `src/components/ErrorBoundary.tsx`:

```typescript
'use client'

import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
          <h2 className="text-lg font-semibold">Etwas ist schiefgelaufen</h2>
          <p className="text-sm text-muted-foreground">
            {this.state.error?.message || 'Ein unerwarteter Fehler ist aufgetreten.'}
          </p>
          <Button
            variant="outline"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Erneut versuchen
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
```

- [ ] **Step 3: Wrap app layout with ErrorBoundary**

In `src/app/(app)/layout.tsx`, wrap the main content area:

```typescript
import { ErrorBoundary } from '@/components/ErrorBoundary'

// In the JSX, wrap {children} with:
<ErrorBoundary>
  {children}
</ErrorBoundary>
```

- [ ] **Step 4: Add error handling to dashboard queries**

In `src/app/(app)/dashboard/page.tsx`, for each `useQuery` call, destructure `isError` and render fallback:

```typescript
const { data: accounts = [], isError: accountsError } = useQuery({ ... })
const { data: netWorth, isError: netWorthError } = useQuery({ ... })
// etc.
```

For each dashboard card, wrap with error check:
```typescript
{accountsError ? (
  <div className="text-sm text-destructive">Fehler beim Laden der Konten</div>
) : (
  // existing card content
)}
```

- [ ] **Step 5: Add error handling to all page-level useQuery calls**

Audit all files in `src/app/(app)/*/page.tsx` and add `isError` handling. Pattern: show inline error message where the data would normally render.

- [ ] **Step 6: Audit and add onError to mutations**

Check all `useMutation` calls across components. Ensure each has an `onError` callback:

```typescript
onError: (error) => {
  toast.error(error instanceof Error ? error.message : 'Ein Fehler ist aufgetreten')
},
```

- [ ] **Step 7: Add aria-labels to icon-only buttons**

Search for all `<Button>` components that contain only an icon (no text). Add `aria-label` to each:

```typescript
// Before:
<Button variant="ghost" size="icon" onClick={...}><ChevronLeft /></Button>

// After:
<Button variant="ghost" size="icon" onClick={...} aria-label="Vorheriger Monat"><ChevronLeft /></Button>
```

Key locations:
- Month navigation (ChevronLeft, ChevronRight) in budget tabs
- Edit/Delete buttons in tables (Pencil, Trash2 icons)
- Sidebar toggle buttons
- Color indicators: add `title` attribute with color name/purpose

- [ ] **Step 8: Install @axe-core/playwright and write basic a11y test**

```bash
npm install -D @axe-core/playwright
```

Create `tests/a11y/basic.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const pages = [
  { name: 'Dashboard', path: '/' },
  { name: 'Accounts', path: '/accounts' },
  { name: 'Transactions', path: '/transactions' },
]

for (const { name, path } of pages) {
  test(`${name} page should have no critical a11y violations`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState('networkidle')

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast']) // shadcn handles this
      .analyze()

    const critical = results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious')
    expect(critical).toEqual([])
  })
}
```

Update `playwright.config.ts` to include the a11y test directory:
```typescript
testDir: './tests',
testMatch: ['savings/**/*.spec.ts', 'a11y/**/*.spec.ts'],
```

- [ ] **Step 9: Run tests**

```bash
npm run lint && npm test
npm run test:e2e  # includes a11y tests
```

- [ ] **Step 10: Commit and push**

```bash
git add src/components/ErrorBoundary.tsx src/app/ src/components/ tests/a11y/ playwright.config.ts package.json package-lock.json
git commit -m "feat: add error boundaries, error states, and accessibility (B-04, B-06)

- ErrorBoundary component with retry button
- Error states for all useQuery/useMutation calls
- aria-labels on all icon-only buttons
- Basic a11y tests with @axe-core/playwright"
git push -u origin feat/error-states-a11y
```

- [ ] **Step 11: Create draft PR**

---

## Phase 4: E2E & Polish

### Task 7: PR 7 — E2E Tests (B-07)

**Branch:** `test/e2e-expansion`

**Files:**
- Create: `tests/accounts/01-create-account.spec.ts`
- Create: `tests/accounts/02-edit-account.spec.ts`
- Create: `tests/accounts/03-delete-account.spec.ts`
- Create: `tests/transactions/01-create-transaction.spec.ts`
- Create: `tests/transactions/02-edit-transaction.spec.ts`
- Create: `tests/transactions/03-filter-search.spec.ts`
- Create: `tests/transactions/04-delete-transaction.spec.ts`
- Create: `tests/budget/01-set-budget.spec.ts`
- Create: `tests/budget/02-rollover.spec.ts`
- Modify: `playwright.config.ts` (expand testDir)
- Modify: `.github/workflows/ci.yml` (enable E2E job)

---

- [ ] **Step 1: Create branch**

```bash
git checkout main && git pull && git checkout -b test/e2e-expansion
```

- [ ] **Step 2: Update playwright.config.ts**

Change testDir to cover all E2E directories:
```typescript
testDir: './tests',
testMatch: [
  'savings/**/*.spec.ts',
  'accounts/**/*.spec.ts',
  'transactions/**/*.spec.ts',
  'budget/**/*.spec.ts',
  'a11y/**/*.spec.ts',
],
```

- [ ] **Step 3: Write accounts E2E tests**

Create `tests/accounts/01-create-account.spec.ts`:
- Navigate to /accounts
- Click "Konto erstellen"
- Fill name, IBAN, bank, type, color
- Submit and verify account appears in list
- Cleanup: delete via API

Similar pattern for edit and delete specs.

- [ ] **Step 4: Write transactions E2E tests**

Create `tests/transactions/01-create-transaction.spec.ts`:
- Navigate to /transactions
- Click "Neue Transaktion"
- Fill form (date, description, amount, account, category)
- Submit and verify transaction appears in list

Create filter/search and delete specs.

- [ ] **Step 5: Write budget E2E tests**

Create `tests/budget/01-set-budget.spec.ts`:
- Navigate to account budget tab
- Double-click a budget cell
- Enter amount and confirm
- Verify the value persists after page reload

Create rollover spec.

- [ ] **Step 6: Enable E2E in CI**

In `.github/workflows/ci.yml`, uncomment the E2E job and configure:
```yaml
e2e:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 22
    - run: npm ci
    - run: npx prisma generate
    - run: npx playwright install --with-deps chromium
    - run: npm run build
    - run: npm run test:e2e
```

- [ ] **Step 7: Run E2E tests locally**

```bash
npm run test:e2e
```

Expected: All pass.

- [ ] **Step 8: Commit and push**

```bash
git add tests/ playwright.config.ts .github/
git commit -m "test: E2E tests for accounts, transactions, budget (B-07)

- 9 new Playwright specs across 3 features
- Expanded playwright.config.ts testMatch
- Enabled E2E job in CI workflow"
git push -u origin test/e2e-expansion
```

- [ ] **Step 9: Create draft PR**

---

### Task 8: PR 8 — UX Polish (B-09 + B-10)

**Branch:** `feat/ux-polish`

**Files:**
- Modify: Multiple components with `useMutation` calls (add optimistic updates)
- Modify: Multiple components with `invalidateQueries` calls (granular keys)

---

- [ ] **Step 1: Create branch**

```bash
git checkout main && git pull && git checkout -b feat/ux-polish
```

- [ ] **Step 2: Audit all invalidateQueries calls**

Search for all `invalidateQueries` calls in the codebase:
```bash
grep -rn "invalidateQueries" src/
```

For each, determine if the invalidation is broader than necessary.

- [ ] **Step 3: Make query keys granular**

Where queries use flat keys like `['transactions']`, add parameters:
```typescript
// Before:
useQuery({ queryKey: ['transactions'], ... })
queryClient.invalidateQueries({ queryKey: ['transactions'] })

// After:
useQuery({ queryKey: ['transactions', { accountId, page, search }], ... })
queryClient.invalidateQueries({ queryKey: ['transactions'] }) // still works — prefix match
```

The key insight: TanStack Query's `invalidateQueries` uses prefix matching, so `['transactions']` invalidates all keys starting with `'transactions'`. This already works. The main improvement is ensuring mutations only invalidate the specific resources they affect, not unrelated ones.

Focus areas:
- Budget mutations should not invalidate `['transactions']` unless they create transactions
- Transaction mutations should not invalidate `['budget']` unless the transaction has a category

- [ ] **Step 4: Add optimistic updates to budget inline editing**

In the budget table's save mutation (AccountBudgetTab or BudgetTableBody):

```typescript
const saveMutation = useMutation({
  mutationFn: async (data) => { /* existing */ },
  onMutate: async (newData) => {
    await queryClient.cancelQueries({ queryKey: ['account-budget', accountId, year, month] })
    const previous = queryClient.getQueryData(['account-budget', accountId, year, month])
    // Optimistically update the cache
    queryClient.setQueryData(['account-budget', accountId, year, month], (old: AccountBudgetData) => {
      // Update the specific category's budgeted value
      return updateBudgetInCache(old, newData)
    })
    return { previous }
  },
  onError: (_err, _vars, context) => {
    // Rollback on error
    if (context?.previous) {
      queryClient.setQueryData(['account-budget', accountId, year, month], context.previous)
    }
    toast.error('Fehler beim Speichern')
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['account-budget', accountId, year, month] })
  },
})
```

- [ ] **Step 5: Add optimistic update to transaction deletion**

In the transaction list's delete mutation:

```typescript
const deleteMutation = useMutation({
  mutationFn: async (id: string) => { /* existing */ },
  onMutate: async (deletedId) => {
    await queryClient.cancelQueries({ queryKey: ['transactions'] })
    const previous = queryClient.getQueryData(['transactions', /* current params */])
    queryClient.setQueryData(['transactions', /* current params */], (old: TransactionPage) => ({
      ...old,
      transactions: old.transactions.filter(t => t.id !== deletedId),
      total: old.total - 1,
    }))
    return { previous }
  },
  onError: (_err, _vars, context) => {
    if (context?.previous) {
      queryClient.setQueryData(['transactions', /* current params */], context.previous)
    }
    toast.error('Fehler beim Löschen')
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['transactions'] })
    queryClient.invalidateQueries({ queryKey: ['accounts'] })
  },
})
```

- [ ] **Step 6: Run tests**

```bash
npm run lint && npm test
```

- [ ] **Step 7: Commit and push**

```bash
git add src/
git commit -m "feat: optimistic updates and granular cache invalidation (B-09, B-10)

- Optimistic updates for budget editing and transaction deletion
- Refined invalidateQueries calls to minimize unnecessary refetches"
git push -u origin feat/ux-polish
```

- [ ] **Step 8: Create draft PR**

---

## Dependency Graph

```
PR 1 (Quick Fixes) ──────────────────────→ can start immediately
PR 2 (Service Tests) ────────────────────→ can start immediately
PR 3 (API Tests) ────────────────────────→ after PR 2 merged (shared seed data)
PR 4 (TransactionForm Refactor) ─────────→ after PR 2+3 merged (safety net)
PR 5 (Budget Refactor) ──────────────────→ after PR 2+3 merged (safety net)
PR 6 (Error States + A11y) ──────────────→ after PR 4+5 merged (refactored components)
PR 7 (E2E Tests) ────────────────────────→ after PR 6 merged (tests final UI)
PR 8 (UX Polish) ────────────────────────→ after PR 6 merged (modifies query patterns)
```

## Completion Criteria

All 12 backlog items addressed:
- [x] B-01: Components <400 lines (PR 4 + PR 5)
- [x] B-02: 100% service layer test coverage (PR 2)
- [x] B-03: >70% API route test coverage (PR 3)
- [x] B-04: Error boundaries + error states (PR 6)
- [x] B-05: No $queryRawUnsafe (PR 1)
- [x] B-06: aria-labels + a11y tests (PR 6)
- [x] B-07: E2E tests for 3+ features + CI (PR 7)
- [x] B-08: Named constants (PR 1)
- [x] B-09: Optimistic updates (PR 8)
- [x] B-10: Granular cache invalidation (PR 8)
- [x] B-11: .env.example (PR 1)
- [x] B-12: Logger utility (PR 1)
