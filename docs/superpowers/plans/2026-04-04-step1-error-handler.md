# Step 1: withHandler + Error Policy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce `withHandler` HOF and `DomainError`, then migrate all 38 API route handlers to use them — eliminating per-route `try/catch` boilerplate.

**Architecture:** Two new files in `src/lib/api/`. Every `export async function GET/POST/PUT/DELETE` becomes `export const X = withHandler(async (...) => { ... })`. ZodErrors → 400, DomainErrors → their status, unknown → 500. Pure refactor — no behaviour change. Branch: `chore/api-error-handler`, base: `main`.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Zod v4

---

## File Map

**New:**
- `src/lib/api/errors.ts` — `DomainError` class
- `src/lib/api/handler.ts` — `withHandler` HOF

**Modified (38 files — all route.ts under src/app/api/):**
```
accounts/route.ts                                  accounts/[id]/route.ts
accounts/reorder/route.ts                          accounts/[id]/category-groups/route.ts
accounts/[id]/reconcile/route.ts                   accounts/[id]/sub-accounts/route.ts
accounts/[id]/budget/[year]/[month]/route.ts       accounts/[id]/budget/[year]/[month]/rollover/route.ts
transactions/route.ts                              transactions/[id]/route.ts
savings/route.ts                                   savings/[id]/route.ts
savings/[id]/pay/route.ts                          savings/[id]/extend/route.ts
savings/[id]/entries/[entryId]/pay/route.ts
categories/route.ts                                categories/[id]/route.ts
categories/reorder/route.ts                        category-groups/route.ts
category-groups/[id]/route.ts                      category-groups/reorder/route.ts
budget/[year]/[month]/route.ts                     budget/[year]/[month]/rollover/route.ts
reports/category-spending/route.ts                 reports/monthly-summary/route.ts
loans/route.ts                                     loans/[id]/route.ts
loans/[id]/payments/[period]/route.ts              rules/route.ts
rules/[id]/route.ts                                sub-accounts/route.ts
sub-accounts/[id]/route.ts                         sub-accounts/[id]/groups/route.ts
sub-account-groups/route.ts                        sub-account-groups/[id]/route.ts
sub-account-groups/[id]/entries/route.ts           sub-account-entries/[id]/route.ts
import/route.ts
```

---

## Migration Rules (memorise — applies to every route file)

1. Add `import { withHandler } from '@/lib/api/handler'`
2. Add `import { DomainError } from '@/lib/api/errors'` **only if** the file has inline 404/400/409/422 returns to replace
3. `export async function GET(req: Request) {` → `export const GET = withHandler(async (req: Request) => {`; close with `})`
4. Routes with params: change `(_: Request, { params }: { params: Promise<{ id: string }> })` → `(_, ctx)` and inside the body add:
   `const { id } = await (ctx as { params: Promise<{ id: string }> }).params`
5. Delete the entire `try { ... } catch { ... }` wrapper — keep only the body
6. `return NextResponse.json({ error: '...' }, { status: 404 })` → `throw new DomainError('...', 404)`
7. `if (error instanceof z.ZodError) { return ... }` catch branch → delete entirely (withHandler handles it)
8. Remove `import { z } from 'zod'` **only if** no `z.object(...)` schema remains in the file

---

## Task 1: Create the two utility files

**Files:**
- Create: `src/lib/api/errors.ts`
- Create: `src/lib/api/handler.ts`

- [ ] **Step 1: Branch setup**

```bash
git checkout main && git pull
git checkout -b chore/api-error-handler
```

- [ ] **Step 2: Create `src/lib/api/errors.ts`**

```ts
export class DomainError extends Error {
  constructor(message: string, public readonly status: 400 | 404 | 409 | 422) {
    super(message)
    this.name = 'DomainError'
  }
}
```

- [ ] **Step 3: Create `src/lib/api/handler.ts`**

```ts
import { ZodError } from 'zod'
import { NextResponse } from 'next/server'
import { DomainError } from './errors'

// ctx typed as unknown — Next.js App Router passes { params: Promise<...> } which
// each handler resolves itself. Using unknown here avoids any without lying about the type.
type RouteHandler = (req: Request, ctx: unknown) => Promise<NextResponse>

export function withHandler(fn: RouteHandler): RouteHandler {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx)
    } catch (e) {
      if (e instanceof ZodError)
        return NextResponse.json({ error: e.issues }, { status: 400 })
      if (e instanceof DomainError)
        return NextResponse.json({ error: e.message }, { status: e.status })
      console.error(e)
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
  }
}
```

- [ ] **Step 4: TypeScript check**

Run: `npm run build 2>&1 | tail -20`
Expected: build completes, no errors in the two new files

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/errors.ts src/lib/api/handler.ts
git commit -m "feat: add withHandler HOF and DomainError"
```

---

## Task 2: Migrate accounts routes (8 files)

**Files:**
- Modify: `src/app/api/accounts/route.ts`
- Modify: `src/app/api/accounts/[id]/route.ts`
- Modify: `src/app/api/accounts/reorder/route.ts`
- Modify: `src/app/api/accounts/[id]/category-groups/route.ts`
- Modify: `src/app/api/accounts/[id]/reconcile/route.ts`
- Modify: `src/app/api/accounts/[id]/sub-accounts/route.ts`
- Modify: `src/app/api/accounts/[id]/budget/[year]/[month]/route.ts`
- Modify: `src/app/api/accounts/[id]/budget/[year]/[month]/rollover/route.ts`

- [ ] **Step 1: Rewrite `src/app/api/accounts/route.ts`**

The current file has an inline ZodError check in the POST catch block. After migration:

```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'

const accountSchema = z.object({
  name: z.string().min(1),
  iban: z.string().optional().nullable(),
  bank: z.string().optional().nullable(),
  type: z.enum(['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'CASH', 'INVESTMENT']).default('CHECKING'),
  color: z.string().default('#6366f1'),
  icon: z.string().optional().nullable(),
  currentBalance: z.number().default(0),
})

export const GET = withHandler(async () => {
  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    include: { _count: { select: { transactions: true } } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
  return NextResponse.json(accounts.map(a => ({ ...a })))
})

export const POST = withHandler(async (request: Request) => {
  const body = await request.json()
  const data = accountSchema.parse(body)
  const maxOrder = await prisma.account.aggregate({ _max: { sortOrder: true } })
  const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1
  const account = await prisma.account.create({ data: { ...data, sortOrder } })
  return NextResponse.json(account, { status: 201 })
})
```

- [ ] **Step 2: Rewrite `src/app/api/accounts/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'
import { DomainError } from '@/lib/api/errors'

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  iban: z.string().optional().nullable(),
  bank: z.string().optional().nullable(),
  type: z.enum(['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'CASH', 'INVESTMENT']).optional(),
  color: z.string().optional(),
  icon: z.string().optional().nullable(),
  currentBalance: z.number().optional(),
})

export const GET = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const account = await prisma.account.findUnique({
    where: { id },
    include: {
      transactions: { orderBy: { date: 'desc' }, take: 50, include: { category: true } },
    },
  })
  if (!account) throw new DomainError('Konto nicht gefunden', 404)
  return NextResponse.json(account)
})

export const PUT = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const body = await request.json()
  const data = updateSchema.parse(body)
  const account = await prisma.account.update({ where: { id }, data })
  return NextResponse.json(account)
})

export const DELETE = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  await prisma.account.update({ where: { id }, data: { isActive: false } })
  return NextResponse.json({ success: true })
})
```

- [ ] **Step 3: Apply migration rules to the remaining 6 accounts files**

Read each file and apply the migration rules from the top of this plan. Key notes:
- `accounts/[id]/budget/[year]/[month]/route.ts` has two params: use `ctx as { params: Promise<{ id: string; year: string; month: string }> }`
- `accounts/[id]/budget/[year]/[month]/rollover/route.ts` same params shape

- [ ] **Step 4: TypeScript check**

Run: `npm run build 2>&1 | tail -30`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/app/api/accounts/
git commit -m "chore: migrate accounts routes to withHandler"
```

---

## Task 3: Migrate transactions routes (2 files)

**Files:**
- Modify: `src/app/api/transactions/route.ts`
- Modify: `src/app/api/transactions/[id]/route.ts`

- [ ] **Step 1: Migrate `src/app/api/transactions/route.ts`**

The file has a large GET and POST. Add `import { withHandler } from '@/lib/api/handler'`. Change both handlers:

```ts
// Replace:
export async function GET(request: Request) {
  // ...
  try {
    // ... body ...
    return NextResponse.json(result)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Fehler' }, { status: 500 })
  }
}

// With:
export const GET = withHandler(async (request: Request) => {
  // ... body unchanged ...
  return NextResponse.json(result)
})
```

Same for POST — remove the try/catch wrapper and close with `})`.

- [ ] **Step 2: Migrate `src/app/api/transactions/[id]/route.ts`**

Add imports:
```ts
import { withHandler } from '@/lib/api/handler'
import { DomainError } from '@/lib/api/errors'
```

Apply rules to PUT and DELETE:
- `export async function PUT(request: Request, { params }: ...)` → `export const PUT = withHandler(async (request: Request, ctx) => {`
- `const { id } = await params` → `const { id } = await (ctx as { params: Promise<{ id: string }> }).params`
- `if (!existing) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })` → `if (!existing) throw new DomainError('Nicht gefunden', 404)`
- Remove both catch blocks (PUT and DELETE each have one)
- Same for DELETE handler

- [ ] **Step 3: TypeScript check**

Run: `npm run build 2>&1 | tail -30`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/app/api/transactions/
git commit -m "chore: migrate transactions routes to withHandler"
```

---

## Task 4: Migrate savings routes (5 files)

**Files:**
- Modify: `src/app/api/savings/route.ts`
- Modify: `src/app/api/savings/[id]/route.ts`
- Modify: `src/app/api/savings/[id]/pay/route.ts`
- Modify: `src/app/api/savings/[id]/extend/route.ts`
- Modify: `src/app/api/savings/[id]/entries/[entryId]/pay/route.ts`

- [ ] **Step 1: Migrate `src/app/api/savings/route.ts`**

Add `import { withHandler } from '@/lib/api/handler'`. Apply rules to GET and POST — no 404/DomainError patterns, so no DomainError import needed.

- [ ] **Step 2: Migrate `src/app/api/savings/[id]/route.ts`**

Add both imports. Three handlers (GET, PUT, DELETE). Key replacements:
- GET: `if (!config) return NextResponse.json({ error: 'Not found' }, { status: 404 })` → `if (!config) throw new DomainError('Not found', 404)`
- PUT: same pattern for config not found
- DELETE: no 404 pattern (update will throw Prisma error if not found — OK for now)

- [ ] **Step 3: Migrate `src/app/api/savings/[id]/pay/route.ts`**

```ts
import { withHandler } from '@/lib/api/handler'
import { DomainError } from '@/lib/api/errors'
```

```ts
export const POST = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  // ... body unchanged ...
  if (!config) throw new DomainError('Not found', 404)
  // ... rest unchanged ...
})
```

- [ ] **Step 4: Migrate `src/app/api/savings/[id]/extend/route.ts`**

```ts
export const POST = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  // ...
  if (!config) throw new DomainError('Not found', 404)
  if (config.termMonths !== null) throw new DomainError('Festlaufzeit-Konten können nicht verlängert werden', 400)
  // ... rest unchanged ...
})
```

- [ ] **Step 5: Migrate `src/app/api/savings/[id]/entries/[entryId]/pay/route.ts`**

Two params — `{ id: string; entryId: string }`:

```ts
export const DELETE = withHandler(async (_, ctx) => {
  const { id, entryId } = await (ctx as { params: Promise<{ id: string; entryId: string }> }).params
  // ...
  if (!entry || entry.savingsConfig.accountId !== id) throw new DomainError('Not found', 404)
  if (!entry.paidAt) throw new DomainError('Not paid', 400)
  // ... rest unchanged ...
})
```

- [ ] **Step 6: TypeScript check**

Run: `npm run build 2>&1 | tail -30`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/app/api/savings/
git commit -m "chore: migrate savings routes to withHandler"
```

---

## Task 5: Migrate remaining 23 routes

**Files (read each, apply migration rules):**
```
src/app/api/categories/route.ts
src/app/api/categories/[id]/route.ts
src/app/api/categories/reorder/route.ts
src/app/api/category-groups/route.ts
src/app/api/category-groups/[id]/route.ts
src/app/api/category-groups/reorder/route.ts
src/app/api/budget/[year]/[month]/route.ts          ← params: { year, month }
src/app/api/budget/[year]/[month]/rollover/route.ts  ← params: { year, month }
src/app/api/reports/category-spending/route.ts
src/app/api/reports/monthly-summary/route.ts
src/app/api/loans/route.ts
src/app/api/loans/[id]/route.ts
src/app/api/loans/[id]/payments/[period]/route.ts   ← params: { id, period }
src/app/api/rules/route.ts
src/app/api/rules/[id]/route.ts
src/app/api/sub-accounts/route.ts
src/app/api/sub-accounts/[id]/route.ts
src/app/api/sub-accounts/[id]/groups/route.ts
src/app/api/sub-account-groups/route.ts
src/app/api/sub-account-groups/[id]/route.ts
src/app/api/sub-account-groups/[id]/entries/route.ts
src/app/api/sub-account-entries/[id]/route.ts
src/app/api/import/route.ts
```

- [ ] **Step 1: Migrate categories + category-groups routes (6 files)**

Apply the migration rules from the top of this plan to all 6 files.

- [ ] **Step 2: Migrate budget routes (2 files)**

For these files, the params destructuring uses `{ year: string; month: string }`:
```ts
export const GET = withHandler(async (_, ctx) => {
  const { year: yearStr, month: monthStr } = await (ctx as { params: Promise<{ year: string; month: string }> }).params
  // ...
})

export const PUT = withHandler(async (request: Request, ctx) => {
  const { year: yearStr, month: monthStr } = await (ctx as { params: Promise<{ year: string; month: string }> }).params
  // ...
})
```

- [ ] **Step 3: Migrate reports routes (2 files)**

These are GET-only, no params (query string only). Straightforward wrap + remove try/catch.

- [ ] **Step 4: Migrate loans + rules routes (5 files)**

For `loans/[id]/payments/[period]/route.ts`, params are `{ id: string; period: string }`.

- [ ] **Step 5: Migrate sub-account + import routes (8 files)**

For `sub-account-groups/[id]/entries/route.ts` check whether it has a nested param structure and use the correct type cast.

- [ ] **Step 6: TypeScript check**

Run: `npm run build 2>&1 | tail -30`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/app/api/
git commit -m "chore: migrate all remaining routes to withHandler"
```

---

## Task 6: Verify with Playwright tests

- [ ] **Step 1: Ensure dev server is running**

In a separate terminal: `npm run dev`

- [ ] **Step 2: Run Playwright savings tests**

Run: `npx playwright test tests/savings/ --reporter=list`
Expected: all tests pass

- [ ] **Step 3: Fix any failures**

If tests fail, check whether the failing route was accidentally broken during migration (wrong params cast, missing import, etc.). Fix and re-run.

- [ ] **Step 4: Push and open draft PR**

```bash
git push -u origin chore/api-error-handler
gh pr create --draft --title "chore: add withHandler HOF and migrate all API routes" --body "$(cat <<'EOF'
## Summary
- Adds `DomainError` class and `withHandler` HOF in `src/lib/api/`
- Migrates all 38 API route handlers: removes per-route try/catch, ZodErrors → 400, DomainErrors → their status
- Pure refactor — no behaviour changes

## Test plan
- [ ] `npm run build` passes
- [ ] Playwright savings tests pass
EOF
)"
```
