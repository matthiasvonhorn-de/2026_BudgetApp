# Step 2: Shared Zod Schemas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract inline Zod schemas from the Savings, Transactions, and Accounts route files into shared schema files so TypeScript types are derived once and reused everywhere.

**Architecture:** Three new files under `src/lib/schemas/`. Each exports a Zod schema and the `z.infer<>` type. Routes import the schema for `.parse()`. Frontend code and tests import the type. The `SavingsCreatePayload` interface in `tests/savings/helpers.ts` is replaced with the canonical `SavingsCreateInput`. Branch: `chore/shared-schemas`, base: `chore/api-error-handler`.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Zod v4

---

## File Map

**New:**
- `src/lib/schemas/savings.ts` — `SavingsCreateSchema`, `SavingsUpdateSchema`, `SavingsPaySchema` + inferred types
- `src/lib/schemas/accounts.ts` — `AccountCreateSchema`, `AccountUpdateSchema` + inferred types
- `src/lib/schemas/transactions.ts` — `TransactionCreateSchema`, `TransactionUpdateSchema` + inferred types

**Modified:**
- `src/app/api/savings/route.ts` — import `SavingsCreateSchema` from `@/lib/schemas/savings`
- `src/app/api/savings/[id]/route.ts` — import `SavingsUpdateSchema`
- `src/app/api/savings/[id]/pay/route.ts` — import `SavingsPaySchema`
- `src/app/api/accounts/route.ts` — import `AccountCreateSchema`
- `src/app/api/accounts/[id]/route.ts` — import `AccountUpdateSchema`
- `src/app/api/transactions/route.ts` — import `TransactionCreateSchema`
- `src/app/api/transactions/[id]/route.ts` — import `TransactionUpdateSchema`
- `tests/savings/helpers.ts` — replace `SavingsCreatePayload` with `SavingsCreateInput`

---

## Task 1: Create `src/lib/schemas/savings.ts`

**Files:**
- Create: `src/lib/schemas/savings.ts`

- [ ] **Step 1: Branch setup**

```bash
git checkout chore/api-error-handler  # base on previous step
git pull
git checkout -b chore/shared-schemas
```

- [ ] **Step 2: Write the file**

```ts
import { z } from 'zod'

export const SavingsCreateSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
  savingsType: z.enum(['SPARPLAN', 'FESTGELD']),
  initialBalance: z.number().min(0).optional(),
  accountNumber: z.string().nullable().optional(),
  contributionAmount: z.number().min(0).optional(),
  contributionFrequency: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUALLY']).nullable().optional(),
  interestRate: z.number().min(0),
  interestFrequency: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUALLY']),
  startDate: z.string(),
  termMonths: z.number().int().positive().nullable().optional(),
  linkedAccountId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  initializedUntil: z.string().nullable().optional(),
})
export type SavingsCreateInput = z.infer<typeof SavingsCreateSchema>

export const SavingsUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  accountNumber: z.string().nullable().optional(),
  linkedAccountId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  interestRate: z.number().min(0).optional(),
})
export type SavingsUpdateInput = z.infer<typeof SavingsUpdateSchema>

export const SavingsPaySchema = z.object({
  paidUntil: z.string(), // ISO date string "YYYY-MM-DD"
})
export type SavingsPayInput = z.infer<typeof SavingsPaySchema>
```

- [ ] **Step 3: TypeScript check**

Run: `npm run build 2>&1 | tail -20`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/schemas/savings.ts
git commit -m "feat: add shared Zod schemas for Savings domain"
```

---

## Task 2: Create `src/lib/schemas/accounts.ts`

**Files:**
- Create: `src/lib/schemas/accounts.ts`

- [ ] **Step 1: Write the file**

The source of truth is the current inline schemas in `accounts/route.ts` and `accounts/[id]/route.ts`.

```ts
import { z } from 'zod'

export const AccountCreateSchema = z.object({
  name: z.string().min(1),
  iban: z.string().optional().nullable(),
  bank: z.string().optional().nullable(),
  type: z.enum(['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'CASH', 'INVESTMENT']).default('CHECKING'),
  color: z.string().default('#6366f1'),
  icon: z.string().optional().nullable(),
  currentBalance: z.number().default(0),
})
export type AccountCreateInput = z.infer<typeof AccountCreateSchema>

export const AccountUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  iban: z.string().optional().nullable(),
  bank: z.string().optional().nullable(),
  type: z.enum(['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'CASH', 'INVESTMENT']).optional(),
  color: z.string().optional(),
  icon: z.string().optional().nullable(),
  currentBalance: z.number().optional(),
})
export type AccountUpdateInput = z.infer<typeof AccountUpdateSchema>
```

- [ ] **Step 2: TypeScript check**

Run: `npm run build 2>&1 | tail -20`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/schemas/accounts.ts
git commit -m "feat: add shared Zod schemas for Accounts domain"
```

---

## Task 3: Create `src/lib/schemas/transactions.ts`

**Files:**
- Create: `src/lib/schemas/transactions.ts`

- [ ] **Step 1: Write the file**

Source of truth: `transactions/route.ts` (create schema) and `transactions/[id]/route.ts` (update schema).

```ts
import { z } from 'zod'

export const TransactionCreateSchema = z.object({
  date: z.string(),
  amount: z.number(),
  description: z.string().min(1),
  payee: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  accountId: z.string(),
  categoryId: z.string().optional().nullable(),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).default('EXPENSE'),
  status: z.enum(['PENDING', 'CLEARED', 'RECONCILED']).default('PENDING'),
  skipSubAccountEntry: z.boolean().optional().default(false),
  skipPairedTransfer: z.boolean().optional().default(false),
})
export type TransactionCreateInput = z.infer<typeof TransactionCreateSchema>

export const TransactionUpdateSchema = z.object({
  date: z.string().optional(),
  amount: z.number().optional(),
  description: z.string().min(1).optional(),
  payee: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  status: z.enum(['PENDING', 'CLEARED', 'RECONCILED']).optional(),
})
export type TransactionUpdateInput = z.infer<typeof TransactionUpdateSchema>
```

- [ ] **Step 2: TypeScript check**

Run: `npm run build 2>&1 | tail -20`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/schemas/transactions.ts
git commit -m "feat: add shared Zod schemas for Transactions domain"
```

---

## Task 4: Wire savings routes to shared schemas

**Files:**
- Modify: `src/app/api/savings/route.ts`
- Modify: `src/app/api/savings/[id]/route.ts`
- Modify: `src/app/api/savings/[id]/pay/route.ts`

- [ ] **Step 1: Update `src/app/api/savings/route.ts`**

Remove the inline `CreateSchema` definition. Replace with import:

```ts
// Remove this block entirely:
const CreateSchema = z.object({ ... })

// Add at top of file:
import { SavingsCreateSchema } from '@/lib/schemas/savings'
```

Replace all `CreateSchema.parse(body)` with `SavingsCreateSchema.parse(body)`.

If `z` is no longer used for anything else in the file (only was used for the schema), remove `import { z } from 'zod'`. (Keep it if `z` is used elsewhere, e.g. in `computeScheduleMonths` — check the file.)

- [ ] **Step 2: Update `src/app/api/savings/[id]/route.ts`**

```ts
// Remove inline UpdateSchema definition
// Add import:
import { SavingsUpdateSchema } from '@/lib/schemas/savings'
```

Replace `UpdateSchema.parse(body)` → `SavingsUpdateSchema.parse(body)`.

- [ ] **Step 3: Update `src/app/api/savings/[id]/pay/route.ts`**

```ts
// Remove inline PaySchema definition
// Add import:
import { SavingsPaySchema } from '@/lib/schemas/savings'
```

Replace `PaySchema.parse(body)` → `SavingsPaySchema.parse(body)`.

- [ ] **Step 4: TypeScript check**

Run: `npm run build 2>&1 | tail -30`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/app/api/savings/
git commit -m "chore: use shared SavingsCreateSchema/UpdateSchema/PaySchema in routes"
```

---

## Task 5: Wire accounts routes to shared schemas

**Files:**
- Modify: `src/app/api/accounts/route.ts`
- Modify: `src/app/api/accounts/[id]/route.ts`

- [ ] **Step 1: Update `src/app/api/accounts/route.ts`**

```ts
// Remove inline accountSchema definition
// Add import:
import { AccountCreateSchema } from '@/lib/schemas/accounts'
```

Replace `accountSchema.parse(body)` → `AccountCreateSchema.parse(body)`.
Remove `import { z } from 'zod'` if only used for the schema.

- [ ] **Step 2: Update `src/app/api/accounts/[id]/route.ts`**

```ts
// Remove inline updateSchema definition
// Add import:
import { AccountUpdateSchema } from '@/lib/schemas/accounts'
```

Replace `updateSchema.parse(body)` → `AccountUpdateSchema.parse(body)`.

- [ ] **Step 3: TypeScript check**

Run: `npm run build 2>&1 | tail -30`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/app/api/accounts/
git commit -m "chore: use shared AccountCreateSchema/UpdateSchema in routes"
```

---

## Task 6: Wire transactions routes to shared schemas

**Files:**
- Modify: `src/app/api/transactions/route.ts`
- Modify: `src/app/api/transactions/[id]/route.ts`

- [ ] **Step 1: Update `src/app/api/transactions/route.ts`**

```ts
// Remove inline transactionSchema definition
// Add import:
import { TransactionCreateSchema } from '@/lib/schemas/transactions'
```

Replace `transactionSchema.parse(body)` → `TransactionCreateSchema.parse(body)`.

- [ ] **Step 2: Update `src/app/api/transactions/[id]/route.ts`**

```ts
// Remove inline updateSchema definition
// Add import:
import { TransactionUpdateSchema } from '@/lib/schemas/transactions'
```

Replace `updateSchema.parse(body)` → `TransactionUpdateSchema.parse(body)`.

- [ ] **Step 3: TypeScript check**

Run: `npm run build 2>&1 | tail -30`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/app/api/transactions/
git commit -m "chore: use shared TransactionCreateSchema/UpdateSchema in routes"
```

---

## Task 7: Update test helpers

**Files:**
- Modify: `tests/savings/helpers.ts`

- [ ] **Step 1: Replace `SavingsCreatePayload` with `SavingsCreateInput`**

In `tests/savings/helpers.ts`:

```ts
// Remove the SavingsCreatePayload interface definition (lines 5-21)
// Add import at top:
import type { SavingsCreateInput } from '@/lib/schemas/savings'
```

Change the function signature:
```ts
// Before:
export async function apiCreateSavings(payload: SavingsCreatePayload): Promise<string> {

// After:
export async function apiCreateSavings(payload: SavingsCreateInput): Promise<string> {
```

- [ ] **Step 2: TypeScript check**

Run: `npm run build 2>&1 | tail -20`
Expected: no errors

Confirm the test spec files still compile — they import `SavingsCreatePayload` only indirectly via `apiCreateSavings`, so they don't need updating.

- [ ] **Step 3: Verify Playwright tests still compile**

Run: `npx playwright test tests/savings/ --reporter=list --dry-run`
Expected: test discovery succeeds

- [ ] **Step 4: Commit**

```bash
git add tests/savings/helpers.ts
git commit -m "chore: replace SavingsCreatePayload with canonical SavingsCreateInput from schema"
```

---

## Task 8: Verify and push

- [ ] **Step 1: Full build check**

Run: `npm run build 2>&1 | tail -20`
Expected: build completes without errors

- [ ] **Step 2: Run Playwright savings tests**

Run: `npx playwright test tests/savings/ --reporter=list`
Expected: all tests pass

- [ ] **Step 3: Push and open draft PR**

```bash
git push -u origin chore/shared-schemas
gh pr create --draft --title "chore: extract shared Zod schemas for Savings, Accounts, Transactions" --body "$(cat <<'EOF'
## Summary
- New `src/lib/schemas/` directory with three schema files (savings, accounts, transactions)
- Each file exports the Zod schema + `z.infer<>` type
- Routes import the schema for `.parse()`; test helpers import the type
- Replaces `SavingsCreatePayload` interface in tests/savings/helpers.ts with `SavingsCreateInput`

## Test plan
- [ ] `npm run build` passes
- [ ] Playwright savings tests pass
EOF
)"
```
