# Step 4: Read-only GET + Idempotent Extend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the lazy-extend side effect from `GET /api/savings/[id]` and replace it with an idempotent `POST /api/savings/[id]/extend` that the UI calls once after data loads.

**Architecture:** `savingsService.getSavings()` becomes pure read. `savingsService.extendSchedule()` gains a horizon check + `skipDuplicates: true` so it is idempotent. The UI savings detail page fires a one-shot `useMutation` to `/extend` after the main `useQuery` resolves; if the server reports `extended: true`, the query is invalidated to reload the schedule. Branch: `chore/savings-extend-idempotent`, base: `chore/savings-service`.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Prisma v7, TanStack Query

---

## File Map

**Modified:**
- `src/lib/services/savingsService.ts`
  - `getSavings()` — remove lazy-extend block entirely
  - `extendSchedule()` — replace with idempotent, horizon-based version
- `src/app/api/savings/[id]/extend/route.ts` — update to call the new service method (no `months` param; server decides)
- `src/app/(app)/savings/[id]/page.tsx` — add one-shot `useMutation` to `/extend` after query resolves

---

## Idempotent Extend Design

The new `extendSchedule` logic:

```
if (config.termMonths !== null) return { extended: false, added: 0 }

horizon = today + 24 months
if (lastEntry exists AND lastEntry.dueDate >= horizon) return { extended: false, added: 0 }

extendFrom = lastEntry ? addMonths(lastEntry.dueDate, interestPeriodMonths) : config.startDate
monthsNeeded = ceil((horizon - extendFrom) / 30.44 days) + interestPeriodMonths
generate schedule from extendFrom for monthsNeeded months
insert with skipDuplicates: true
return { extended: result.count > 0, added: result.count }
```

Key points:
- `skipDuplicates: true` makes concurrent calls safe
- `result.count` (not `newRows.length`) reflects actually inserted rows — they may differ when duplicates are skipped
- The response now returns `{ extended: boolean, added: number }` instead of `{ added: number }`
- The route no longer accepts a `months` parameter — the server decides based on the horizon

---

## Task 1: Rewrite `savingsService.extendSchedule` as idempotent

**Files:**
- Modify: `src/lib/services/savingsService.ts`

- [ ] **Step 1: Branch setup**

```bash
git checkout chore/savings-service
git pull
git checkout -b chore/savings-extend-idempotent
```

- [ ] **Step 2: Replace `extendSchedule` in the service**

Find the current `extendSchedule` method and replace it entirely:

```ts
async extendSchedule(accountId: string): Promise<{ extended: boolean; added: number }> {
  const config = await prisma.savingsConfig.findUnique({
    where: { accountId },
    include: {
      account: { select: { type: true } },
      entries: { orderBy: [{ dueDate: 'asc' }, { entryType: 'asc' }] },
    },
  })
  if (!config) throw new DomainError('Not found', 404)

  // Fixed-term plans are never extended
  if (config.termMonths !== null) return { extended: false, added: 0 }

  const horizon = addMonths(new Date(), 24)
  const lastEntry = config.entries[config.entries.length - 1]

  // Already covers the horizon — nothing to do
  if (lastEntry && lastEntry.dueDate >= horizon) return { extended: false, added: 0 }

  const interestPeriodMonths =
    config.interestFrequency === 'MONTHLY' ? 1
    : config.interestFrequency === 'QUARTERLY' ? 3
    : 12

  const extendFrom = lastEntry
    ? addMonths(lastEntry.dueDate, interestPeriodMonths)
    : config.startDate

  const monthsNeeded = Math.ceil(
    (horizon.getTime() - extendFrom.getTime()) / (30.44 * 24 * 60 * 60 * 1000)
  ) + interestPeriodMonths

  const maxInterestPeriod = config.entries
    .filter(e => e.entryType === 'INTEREST')
    .reduce((m, e) => Math.max(m, e.periodNumber), 0)
  const maxContribPeriod = config.entries
    .filter(e => e.entryType === 'CONTRIBUTION')
    .reduce((m, e) => Math.max(m, e.periodNumber), 0)

  const extension = generateSavingsSchedule({
    savingsType: config.account.type as 'SPARPLAN' | 'FESTGELD',
    initialBalance: lastEntry?.scheduledBalance ?? config.initialBalance,
    contributionAmount: config.contributionAmount,
    contributionFrequency: config.contributionFrequency as 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY' | null,
    interestRate: config.interestRate,
    interestFrequency: config.interestFrequency as 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY',
    startDate: extendFrom,
    termMonths: monthsNeeded,
  })

  if (extension.length === 0) return { extended: false, added: 0 }

  // skipDuplicates: true makes concurrent or repeated calls safe
  const result = await prisma.savingsEntry.createMany({
    data: extension.map(row => ({
      savingsConfigId: config.id,
      entryType: row.entryType,
      periodNumber: row.periodNumber + (row.entryType === 'INTEREST' ? maxInterestPeriod : maxContribPeriod),
      dueDate: row.dueDate,
      scheduledAmount: row.scheduledAmount,
      scheduledBalance: row.scheduledBalance,
    })),
    skipDuplicates: true,
  })

  // result.count reflects actually inserted rows (not extension.length — differs when duplicates skipped)
  return { extended: result.count > 0, added: result.count }
},
```

Note: The method signature changes from `extendSchedule(accountId: string, months: number)` to `extendSchedule(accountId: string)`.

- [ ] **Step 3: TypeScript check**

Run: `npm run build 2>&1 | tail -20`
Expected: no errors (the old route still passes `months` — will be fixed next)

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/savingsService.ts
git commit -m "refactor: make extendSchedule idempotent with horizon check + skipDuplicates"
```

---

## Task 2: Remove lazy-extend from `getSavings`

**Files:**
- Modify: `src/lib/services/savingsService.ts`

- [ ] **Step 1: Remove the lazy-extend block from `getSavings`**

Find the comment `// Lazy-extend: for unlimited plans, ensure entries cover today + 24 months` and delete the entire `if (config.termMonths === null) { ... }` block (approximately 40 lines). The method should go straight from the `if (!config) throw` to the stats computation:

```ts
async getSavings(accountId: string) {
  const config = await prisma.savingsConfig.findUnique({
    where: { accountId },
    include: {
      account: { select: { id: true, name: true, color: true, type: true, currentBalance: true } },
      linkedAccount: { select: { id: true, name: true } },
      entries: { orderBy: [{ dueDate: 'asc' }, { entryType: 'asc' }] },
    },
  })
  if (!config) throw new DomainError('Not found', 404)

  // No lazy-extend here — pure read.
  // The client calls POST /extend after GET resolves; see savings/[id]/page.tsx.

  const paidEntries = config.entries.filter(e => e.paidAt !== null)
  const totalInterest = paidEntries
    .filter(e => e.entryType === 'INTEREST')
    .reduce((s, e) => s + e.scheduledAmount, 0)
  const totalContributions = paidEntries
    .filter(e => e.entryType === 'CONTRIBUTION')
    .reduce((s, e) => s + e.scheduledAmount, 0)
  const nextUnpaidContrib = config.entries.find(
    e => e.entryType === 'CONTRIBUTION' && e.paidAt === null
  )
  const lastEntry = config.entries[config.entries.length - 1]

  return {
    ...config,
    stats: {
      totalInterestPaid: Math.round(totalInterest * 100) / 100,
      totalContributionsPaid: Math.round(totalContributions * 100) / 100,
      nextDueDate: nextUnpaidContrib?.dueDate ?? null,
      lastScheduledDate: lastEntry?.dueDate ?? null,
      totalEntries: config.entries.length,
      paidEntries: paidEntries.length,
    },
  }
},
```

Also remove the `addMonths` import from the service if it is no longer used after removing the lazy-extend block. Check the rest of the file first — `addMonths` is used in `extendSchedule`, so it should stay.

- [ ] **Step 2: TypeScript check**

Run: `npm run build 2>&1 | tail -20`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/services/savingsService.ts
git commit -m "refactor: remove lazy-extend side effect from getSavings — pure read"
```

---

## Task 3: Update the extend route

**Files:**
- Modify: `src/app/api/savings/[id]/extend/route.ts`

The route currently passes a `months` parameter to `extendSchedule`. The new service method takes no `months` — the server decides. Replace the entire file:

- [ ] **Step 1: Rewrite `src/app/api/savings/[id]/extend/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { withHandler } from '@/lib/api/handler'
import { savingsService } from '@/lib/services/savingsService'

// POST body is empty — the server decides whether extension is needed
// based on a 24-month horizon check. Idempotent: safe to call multiple times.
export const POST = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const result = await savingsService.extendSchedule(id)
  return NextResponse.json(result)
})
```

- [ ] **Step 2: TypeScript check**

Run: `npm run build 2>&1 | tail -20`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/savings/[id]/extend/route.ts
git commit -m "chore: update extend route — no months param, server decides via horizon check"
```

---

## Task 4: Update the savings detail page

**Files:**
- Modify: `src/app/(app)/savings/[id]/page.tsx`

After the `useQuery` for savings data resolves successfully, fire a one-shot `useMutation` to `POST /api/savings/[id]/extend`. If the server reports `extended: true`, invalidate the savings query to reload the schedule.

- [ ] **Step 1: Add `useMutation` for extend**

In `src/app/(app)/savings/[id]/page.tsx`, after the existing `unPayMutation` definition, add:

```ts
const extendMutation = useMutation({
  mutationFn: () =>
    fetch(`/api/savings/${id}/extend`, { method: 'POST' }).then(r => r.json()),
  onSuccess: (res: { extended: boolean; added: number }) => {
    if (res.extended) {
      qc.invalidateQueries({ queryKey: ['savings', id] })
    }
  },
})
```

- [ ] **Step 2: Fire extend once after data loads**

Add a `useEffect` that fires the mutation when data first becomes available. Place it after the mutation definitions, before the early returns:

```ts
const extendFiredRef = React.useRef(false)

React.useEffect(() => {
  if (data && !data.error && !extendFiredRef.current) {
    extendFiredRef.current = true
    extendMutation.mutate()
  }
}, [data])
```

Add `React` to the import line (it may already be imported via `'use client'` — check whether the file currently uses `React.useRef` or just destructured hooks like `{ useState }`). If only destructured imports are used, add the effect using the destructured form:

```ts
import { useState, useEffect, useRef } from 'react'
// ...
const extendFiredRef = useRef(false)

useEffect(() => {
  if (data && !data.error && !extendFiredRef.current) {
    extendFiredRef.current = true
    extendMutation.mutate()
  }
}, [data])
```

The `extendFiredRef` prevents firing the mutation on every re-render. It is reset on navigation away (component unmounts) — which is correct, since a new page load should check for extension again.

- [ ] **Step 3: TypeScript check**

Run: `npm run build 2>&1 | tail -20`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/savings/[id]/page.tsx"
git commit -m "feat: fire one-shot POST /extend after savings data loads — CQRS"
```

---

## Task 5: Verify with Playwright tests

- [ ] **Step 1: Start dev server**

Run: `npm run dev` (in a separate terminal if not already running)

- [ ] **Step 2: Run Playwright savings tests**

Run: `npx playwright test tests/savings/ --reporter=list`
Expected: all tests pass

Pay special attention to:
- Tests that navigate to `/savings/[id]` — the extend mutation fires silently; it should not break page load
- Test 5.6 (initializedUntil marking) — GET must return entries without triggering extend
- Test 5.7 (no Gegenbuchung on giro) — extend must not create transactions

- [ ] **Step 3: Manual smoke test**

1. Open `http://localhost:3000/savings/[any-unlimited-plan-id]`
2. Open browser DevTools → Network
3. Confirm a `POST /api/savings/[id]/extend` request fires once after the GET
4. Confirm the entries table shows entries through today + 24 months

- [ ] **Step 4: Push and open draft PR**

```bash
git push -u origin chore/savings-extend-idempotent
gh pr create --draft --title "chore: read-only GET + idempotent POST /extend" --body "$(cat <<'EOF'
## Summary
- `getSavings()` is now a pure read — no side effects
- `extendSchedule()` is idempotent: horizon check + skipDuplicates:true
- `POST /api/savings/[id]/extend` takes no body; server decides if extension is needed
- Savings detail page fires one-shot extend mutation after data loads; invalidates query if entries were added

## Test plan
- [ ] `npm run build` passes
- [ ] All Playwright savings tests pass
- [ ] Manual: POST /extend fires once on page load; entries cover today + 24 months
EOF
)"
```
