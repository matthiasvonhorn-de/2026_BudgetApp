# Backend Architecture Improvements — Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilise the backend for further feature development through five sequential, independently shippable improvements.

**Architecture:** Five PRs applied in order. Each PR leaves the codebase in a better state than before and does not break existing functionality. No service layer is introduced for domains other than Savings.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Prisma v7 + libSQL, Zod v4, shadcn/ui, TanStack Query, Electron 41

---

## Scope

The following changes are **in scope**:

1. `withHandler` HOF + centralised `DomainError` (all API routes)
2. Shared Zod schemas for Savings, Transactions, Accounts
3. `savingsService.ts` — service layer for the Savings domain only
4. Read-only `GET /api/savings/[id]`; idempotent `POST /api/savings/[id]/extend`
5. Replace `README.md` with project documentation

The following are **out of scope** (YAGNI):

- Service layers for any domain other than Savings
- Repository / data-access layer (Prisma is the abstraction)
- Unit tests for the service layer (Playwright E2E tests remain the testing strategy)
- Full elimination of `any` across UI components

---

## Step 1 — `withHandler` + Error-Policy

### Problem

Every route file contains its own `try/catch` that always returns HTTP 500, regardless of the error type. ZodError and domain errors are indistinguishable from unexpected crashes. Some routes already return 400 for validation errors via manual checks — after migration these are handled uniformly by `withHandler`.

### Design

**`src/lib/api/errors.ts`**

```ts
export class DomainError extends Error {
  constructor(message: string, public readonly status: 400 | 404 | 409 | 422) {
    super(message)
    this.name = 'DomainError'
  }
}
```

**`src/lib/api/handler.ts`**

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

### Migration

- All `export async function GET/POST/PUT/DELETE` handlers in `src/app/api/**` are wrapped with `withHandler`.
- The `try/catch` inside each handler is removed; errors are thrown instead of caught locally.
- Validation uses `Schema.parse(body)` (not `safeParse`) — ZodError propagates to `withHandler` automatically.
- Existing `if (!config) return NextResponse.json({ error: 'Not found' }, { status: 404 })` patterns are replaced with `throw new DomainError('Not found', 404)`.

### Files affected

- New: `src/lib/api/errors.ts`, `src/lib/api/handler.ts`
- Modified: all `src/app/api/**/route.ts` files (~30 files)

---

## Step 2 — Shared Zod Schemas

### Problem

Zod validation schemas are defined inline in route files. TypeScript interfaces are re-defined in the frontend (form components, test helpers). When the API changes, the frontend type must be updated manually.

### Design

```
src/lib/schemas/
  savings.ts       ← SavingsCreateSchema, SavingsUpdateSchema, SavingsPaySchema + inferred types
  transactions.ts  ← TransactionCreateSchema, TransactionUpdateSchema + inferred types
  accounts.ts      ← AccountCreateSchema, AccountUpdateSchema + inferred types
```

Each file exports:
1. The Zod schema (used in routes for `.parse()`)
2. The inferred TypeScript type (used everywhere else)

```ts
// src/lib/schemas/savings.ts
export const SavingsCreateSchema = z.object({ ... })
export type SavingsCreateInput = z.infer<typeof SavingsCreateSchema>
```

### Migration

- Inline `z.object(...)` definitions in the three affected route families are replaced with imports from `src/lib/schemas/`.
- `SavingsCreatePayload` in `tests/savings/helpers.ts` is replaced with `SavingsCreateInput` from `src/lib/schemas/savings.ts`.
- `SavingsForm` interface in `SavingsFormDialog.tsx` remains a UI-local type (it represents string-typed form state, not API payload — the distinction is intentional and correct).

### Scope constraint

Only Savings, Transactions, and Accounts schemas are extracted. All other route schemas (categories, rules, loans, etc.) remain inline.

---

## Step 3 — Savings Service Layer

### Problem

`src/app/api/savings/route.ts` and `src/app/api/savings/[id]/route.ts` together contain ~450 lines mixing HTTP concerns, business logic, and database access.

### Design

**`src/lib/services/savingsService.ts`**

Public interface:

```ts
createSavings(input: SavingsCreateInput): Promise<{ account: Account; config: SavingsConfig }>
getSavings(accountId: string): Promise<SavingsData>        // includes lazy-extend until Step 4
listSavings(): Promise<SavingsListItem[]>
updateSavings(accountId: string, input: SavingsUpdateInput): Promise<void>
deleteSavings(accountId: string): Promise<void>
payEntries(accountId: string, paidUntil: string): Promise<{ paid: number }>
unpayEntry(accountId: string, entryId: string): Promise<void>
extendSchedule(accountId: string): Promise<{ extended: boolean; added: number }>
```

**Important:** `getSavings()` in Step 3 still contains the lazy-extend logic migrated from the current GET handler. CQRS (read-only GET) is completed in Step 4, not here. This is intentional — Step 3 is a pure structural move, not a behaviour change.

### Rules

- **Prisma transactions**: `createSavings`, `payEntries`, `unpayEntry`, `updateSavings` (rate change) all use `prisma.$transaction()` internally. Routes never open their own transaction.
- **No Next.js imports**: The service has no dependency on `next/server` or any HTTP primitive. It throws `DomainError` for all fachliche errors.
- **Schedule logic stays in `src/lib/savings/schedule.ts`**: The service calls `generateSavingsSchedule()` and `addMonths()` from there. No schedule logic moves into the service.
- **File size**: If `savingsService.ts` exceeds ~400–500 lines, split by responsibility (e.g. `savingsPaymentService.ts` for pay/unpay/extend).

### Route shape after migration

```ts
// src/app/api/savings/[id]/route.ts
export const GET = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const data = await savingsService.getSavings(id)
  return NextResponse.json(data)
})

export const PUT = withHandler(async (req, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const input = SavingsUpdateSchema.parse(await req.json())
  await savingsService.updateSavings(id, input)
  return NextResponse.json({ success: true })
})
```

---

## Step 4 — Read-only GET + Idempotent Extend

### Problem

`GET /api/savings/[id]` currently performs a lazy-extend side effect (adds DB rows). Side effects in GET violate HTTP semantics and make GET non-cacheable.

### Design

**`GET /api/savings/[id]`** — pure read, delegates to `savingsService.getSavings()`. Lazy-extend logic is removed from `getSavings()`.

**`POST /api/savings/[id]/extend`** — the server decides whether extension is needed. The existing endpoint at this path is updated to use the service:

```ts
// savingsService.extendSchedule(accountId) — full logic:
if (config.termMonths !== null) return { extended: false, added: 0 }
const horizon = addMonths(new Date(), 24)
if (lastEntry && lastEntry.dueDate >= horizon) return { extended: false, added: 0 }

// Replicates existing extend semantics exactly:
// - extendFrom = addMonths(lastEntry.dueDate, interestPeriodMonths)
// - monthsNeeded = ceil((horizon - extendFrom) / 30.44d) + interestPeriodMonths
// - periodNumber offset: continues from max existing INTEREST / CONTRIBUTION period numbers
const result = await prisma.savingsEntry.createMany({ data: newRows, skipDuplicates: true })
return { extended: result.count > 0, added: result.count }
// Note: result.count reflects actually inserted rows, not newRows.length,
// which may differ when skipDuplicates skips existing entries.
```

**Idempotency**: `skipDuplicates: true` handles concurrent/duplicate calls. The horizon check provides an early exit so no rows are generated unnecessarily.

**UI change**: In `src/app/(app)/savings/[id]/page.tsx`, after the `useQuery` for savings data resolves, a one-shot `useMutation` posts to `/extend`. The result is not shown to the user; it triggers a query invalidation only if `extended: true`.

---

## Step 5 — Project Documentation

### Problem

`README.md` contains the default Next.js boilerplate. There is no human-readable overview of what the app is, how it works, or how to operate it.

### Design

Replace `README.md` with a project-specific document covering:

1. **Overview** — what the app is, who uses it, key features
2. **Stack** — Next.js 16, Electron 41, Prisma v7 + libSQL, TanStack Query, shadcn/ui, Playwright — one line per technology explaining the why
3. **Architecture** — request flow (Route → Service → Prisma), error handling (withHandler + DomainError), schema sharing
4. **Operations** — `npm run dev`, `npm run electron:dev`, manual DB migrations (`sqlite3` + `prisma generate`), running Playwright tests
5. **Conventions** — branch naming (`feature/`, `fix/`, `chore/`), commit style, PR workflow (distilled from CLAUDE.md)

`CLAUDE.md` is left unchanged (Claude-specific guidance, not general project docs).

---

## Delivery Order

| PR | Branch | Content |
|----|--------|---------|
| 1 | `chore/api-error-handler` | `withHandler` + `DomainError` + migrate all routes |
| 2 | `chore/shared-schemas` | `src/lib/schemas/` + update routes + test helpers |
| 3 | `chore/savings-service` | `savingsService.ts` + slim routes (lazy-extend stays) |
| 4 | `chore/savings-extend-idempotent` | Read-only GET + idempotent POST /extend + UI change |
| 5 | `docs/readme` | Replace README.md |

Each PR is based on the previous merged branch. No PR depends on a later one.
