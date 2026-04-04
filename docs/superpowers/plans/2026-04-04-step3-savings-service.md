# Step 3: Savings Service Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract all business logic from the Savings API routes into `src/lib/services/savingsService.ts`, leaving routes as thin orchestration wrappers.

**Architecture:** One new file (`savingsService.ts`) with a plain object API. No HTTP imports — only Prisma, DomainError, and schedule utilities. Routes shrink to: parse input → call service → return JSON. The lazy-extend side effect stays in `getSavings()` in this step (CQRS is completed in Step 4, not here). Branch: `chore/savings-service`, base: `chore/shared-schemas`.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Prisma v7, Zod v4

---

## File Map

**New:**
- `src/lib/services/savingsService.ts` — all savings business logic

**Modified:**
- `src/app/api/savings/route.ts` — GET and POST become one-liners delegating to service
- `src/app/api/savings/[id]/route.ts` — GET, PUT, DELETE delegate to service
- `src/app/api/savings/[id]/pay/route.ts` — POST delegates to service
- `src/app/api/savings/[id]/extend/route.ts` — POST delegates to service
- `src/app/api/savings/[id]/entries/[entryId]/pay/route.ts` — DELETE delegates to service

---

## Service Rules (refer to these throughout)

- **No Next.js imports**: `savingsService.ts` must not import from `next/server` or `next/*`
- **Throw DomainError** for all domain errors (not-found, invalid state): `throw new DomainError('Not found', 404)`
- **prisma.$transaction()** is used internally for: `createSavings`, `payEntries`, `unpayEntry`, `updateSavings` (when rate changes)
- **Schedule logic stays in `src/lib/savings/schedule.ts`**: the service calls `generateSavingsSchedule()` and `addMonths()` from there — no schedule math in the service file
- **File size**: if `savingsService.ts` grows beyond ~450 lines, split out `savingsPaymentService.ts` for `payEntries`, `unpayEntry`, `extendSchedule`

---

## Task 1: Scaffold `savingsService.ts` with the public interface

**Files:**
- Create: `src/lib/services/savingsService.ts`

- [ ] **Step 1: Branch setup**

```bash
git checkout chore/shared-schemas
git pull
git checkout -b chore/savings-service
```

- [ ] **Step 2: Create `src/lib/services/savingsService.ts` with stubs**

```ts
import { prisma } from '@/lib/prisma'
import { DomainError } from '@/lib/api/errors'
import { generateSavingsSchedule, addMonths } from '@/lib/savings/schedule'
import type { SavingsCreateInput, SavingsUpdateInput, SavingsPayInput } from '@/lib/schemas/savings'
import type { Account, SavingsConfig } from '@prisma/client'

// ─── Return-type helpers ──────────────────────────────────────────────────────

export interface SavingsListItem {
  id: string
  accountId: string
  interestRate: number
  interestFrequency: string
  contributionAmount: number
  contributionFrequency: string | null
  initialBalance: number
  accountNumber: string | null
  termMonths: number | null
  linkedAccountId: string | null
  categoryId: string | null
  notes: string | null
  createdAt: Date
  account: { id: string; name: string; color: string; type: string; currentBalance: number }
  stats: {
    totalInterestPaid: number
    totalContributionsPaid: number
    nextDueDate: Date | null
    totalEntries: number
    paidEntries: number
  }
}

// SavingsData = SavingsConfig + account + linkedAccount + entries + stats
export type SavingsData = Awaited<ReturnType<typeof savingsService.getSavings>>

// ─── Service ─────────────────────────────────────────────────────────────────

export const savingsService = {
  async listSavings(): Promise<SavingsListItem[]> {
    throw new Error('not implemented')
  },

  async getSavings(accountId: string): Promise<unknown> {
    throw new Error('not implemented')
  },

  async createSavings(input: SavingsCreateInput): Promise<{ account: Account; config: SavingsConfig }> {
    throw new Error('not implemented')
  },

  async updateSavings(accountId: string, input: SavingsUpdateInput): Promise<void> {
    throw new Error('not implemented')
  },

  async deleteSavings(accountId: string): Promise<void> {
    throw new Error('not implemented')
  },

  async payEntries(accountId: string, input: SavingsPayInput): Promise<{ paid: number }> {
    throw new Error('not implemented')
  },

  async unpayEntry(accountId: string, entryId: string): Promise<void> {
    throw new Error('not implemented')
  },

  async extendSchedule(accountId: string, months: number): Promise<{ added: number }> {
    throw new Error('not implemented')
  },
}
```

- [ ] **Step 3: TypeScript check**

Run: `npm run build 2>&1 | tail -20`
Expected: build completes (stubs are valid TypeScript)

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/savingsService.ts
git commit -m "feat: scaffold savingsService with public interface stubs"
```

---

## Task 2: Implement `listSavings`

**Files:**
- Modify: `src/lib/services/savingsService.ts`

- [ ] **Step 1: Migrate listSavings from `savings/route.ts` GET handler**

Replace the `listSavings` stub with the body of the current `GET` handler in `src/app/api/savings/route.ts` (the query + stats computation):

```ts
async listSavings(): Promise<SavingsListItem[]> {
  const configs = await prisma.savingsConfig.findMany({
    where: { account: { isActive: true } },
    include: {
      account: { select: { id: true, name: true, color: true, type: true, currentBalance: true } },
      entries: { orderBy: [{ dueDate: 'asc' }, { entryType: 'asc' }] },
    },
    orderBy: { createdAt: 'asc' },
  })

  return configs.map(cfg => {
    const paidEntries = cfg.entries.filter(e => e.paidAt !== null)
    const totalInterest = paidEntries
      .filter(e => e.entryType === 'INTEREST')
      .reduce((s, e) => s + e.scheduledAmount, 0)
    const totalContributions = paidEntries
      .filter(e => e.entryType === 'CONTRIBUTION')
      .reduce((s, e) => s + e.scheduledAmount, 0)
    const nextUnpaidContrib = cfg.entries.find(
      e => e.entryType === 'CONTRIBUTION' && e.paidAt === null
    )

    return {
      ...cfg,
      entries: undefined,
      stats: {
        totalInterestPaid: Math.round(totalInterest * 100) / 100,
        totalContributionsPaid: Math.round(totalContributions * 100) / 100,
        nextDueDate: nextUnpaidContrib?.dueDate ?? null,
        totalEntries: cfg.entries.length,
        paidEntries: paidEntries.length,
      },
    }
  })
},
```

- [ ] **Step 2: Slim `src/app/api/savings/route.ts` GET handler**

```ts
export const GET = withHandler(async () => {
  const list = await savingsService.listSavings()
  return NextResponse.json(list)
})
```

(Keep the POST handler unchanged for now.)

- [ ] **Step 3: TypeScript check**

Run: `npm run build 2>&1 | tail -20`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/savingsService.ts src/app/api/savings/route.ts
git commit -m "chore: migrate listSavings to service"
```

---

## Task 3: Implement `createSavings`

**Files:**
- Modify: `src/lib/services/savingsService.ts`
- Modify: `src/app/api/savings/route.ts`

- [ ] **Step 1: Migrate createSavings**

The current `POST` handler in `savings/route.ts` has all the creation logic (account → config → schedule → initialization). Move the entire body of the try block into `createSavings`, preserving all logic including `computeScheduleMonths`.

Keep `computeScheduleMonths` as a **private** helper at the top of `savingsService.ts` (above the `savingsService` object):

```ts
function computeScheduleMonths(startDate: Date, termMonths: number | null): number {
  if (termMonths !== null) return termMonths
  const horizon = addMonths(new Date(), 24)
  const diffMs = Math.max(0, horizon.getTime() - startDate.getTime())
  const months = Math.ceil(diffMs / (30.44 * 24 * 60 * 60 * 1000))
  return Math.max(months, 24)
}
```

```ts
async createSavings(input: SavingsCreateInput): Promise<{ account: Account; config: SavingsConfig }> {
  const startDate = new Date(input.startDate)
  const initialBalance = input.initialBalance ?? 0
  const contributionAmount = input.savingsType === 'SPARPLAN' ? (input.contributionAmount ?? 0) : 0
  const contributionFrequency = input.savingsType === 'SPARPLAN'
    ? (input.contributionFrequency ?? null)
    : null
  const scheduleMonths = computeScheduleMonths(startDate, input.termMonths ?? null)

  return prisma.$transaction(async (tx) => {
    const account = await tx.account.create({
      data: {
        name: input.name,
        type: input.savingsType,
        color: input.color ?? '#10b981',
        currentBalance: initialBalance,
        isActive: true,
      },
    })

    const config = await tx.savingsConfig.create({
      data: {
        accountId: account.id,
        initialBalance,
        accountNumber: input.accountNumber ?? null,
        contributionAmount,
        contributionFrequency: contributionFrequency ?? null,
        interestRate: input.interestRate,
        interestFrequency: input.interestFrequency,
        startDate,
        termMonths: input.termMonths ?? null,
        linkedAccountId: input.linkedAccountId ?? null,
        categoryId: input.categoryId ?? null,
        notes: input.notes ?? null,
      },
    })

    const schedule = generateSavingsSchedule({
      savingsType: input.savingsType,
      initialBalance,
      contributionAmount,
      contributionFrequency: contributionFrequency ?? null,
      interestRate: input.interestRate,
      interestFrequency: input.interestFrequency,
      startDate,
      termMonths: scheduleMonths,
    })

    await tx.savingsEntry.createMany({
      data: schedule.map(row => ({
        savingsConfigId: config.id,
        entryType: row.entryType,
        periodNumber: row.periodNumber,
        dueDate: row.dueDate,
        scheduledAmount: row.scheduledAmount,
        scheduledBalance: row.scheduledBalance,
      })),
    })

    const today = new Date()
    today.setHours(23, 59, 59, 999)
    const initCutoff = input.initializedUntil
      ? (() => { const d = new Date(input.initializedUntil!); d.setHours(23, 59, 59, 999); return d })()
      : today

    const pastRows = schedule.filter(row => row.dueDate <= initCutoff)

    if (pastRows.length > 0) {
      await tx.savingsEntry.updateMany({
        where: { savingsConfigId: config.id, dueDate: { lte: initCutoff } },
        data: { paidAt: new Date() },
      })
      const lastRow = [...pastRows].sort((a, b) =>
        a.dueDate.getTime() - b.dueDate.getTime() ||
        (a.entryType === 'INTEREST' ? -1 : 1)
      ).at(-1)!
      await tx.account.update({
        where: { id: account.id },
        data: { currentBalance: lastRow.scheduledBalance },
      })
    }

    return { account, config }
  })
},
```

- [ ] **Step 2: Slim `src/app/api/savings/route.ts` POST handler**

```ts
export const POST = withHandler(async (request: Request) => {
  const input = SavingsCreateSchema.parse(await request.json())
  const result = await savingsService.createSavings(input)
  return NextResponse.json(result, { status: 201 })
})
```

- [ ] **Step 3: TypeScript check**

Run: `npm run build 2>&1 | tail -20`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/savingsService.ts src/app/api/savings/route.ts
git commit -m "chore: migrate createSavings to service"
```

---

## Task 4: Implement `getSavings` (with lazy-extend)

**Files:**
- Modify: `src/lib/services/savingsService.ts`
- Modify: `src/app/api/savings/[id]/route.ts`

- [ ] **Step 1: Migrate getSavings**

Move the entire GET body from `savings/[id]/route.ts` into `getSavings`. This includes the lazy-extend block (it stays here intentionally — CQRS is Step 4). Throw `DomainError` instead of returning 404:

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

  // Lazy-extend: for unlimited plans, ensure entries cover today + 24 months
  if (config.termMonths === null) {
    const horizon = addMonths(new Date(), 24)
    const lastEntry = config.entries[config.entries.length - 1]

    if (!lastEntry || lastEntry.dueDate < horizon) {
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

      if (monthsNeeded > 0) {
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

        if (extension.length > 0) {
          await prisma.savingsEntry.createMany({
            data: extension.map(row => ({
              savingsConfigId: config.id,
              entryType: row.entryType,
              periodNumber: row.periodNumber + (row.entryType === 'INTEREST' ? maxInterestPeriod : maxContribPeriod),
              dueDate: row.dueDate,
              scheduledAmount: row.scheduledAmount,
              scheduledBalance: row.scheduledBalance,
            })),
          })

          const updated = await prisma.savingsConfig.findUnique({
            where: { accountId },
            include: {
              account: { select: { id: true, name: true, color: true, type: true, currentBalance: true } },
              linkedAccount: { select: { id: true, name: true } },
              entries: { orderBy: [{ dueDate: 'asc' }, { entryType: 'asc' }] },
            },
          })
          if (updated) Object.assign(config, updated)
        }
      }
    }
  }

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

- [ ] **Step 2: Slim `src/app/api/savings/[id]/route.ts` GET handler**

```ts
export const GET = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const data = await savingsService.getSavings(id)
  return NextResponse.json(data)
})
```

- [ ] **Step 3: TypeScript check**

Run: `npm run build 2>&1 | tail -20`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/savingsService.ts src/app/api/savings/[id]/route.ts
git commit -m "chore: migrate getSavings to service (lazy-extend stays)"
```

---

## Task 5: Implement `updateSavings` and `deleteSavings`

**Files:**
- Modify: `src/lib/services/savingsService.ts`
- Modify: `src/app/api/savings/[id]/route.ts`

- [ ] **Step 1: Migrate updateSavings**

Move the entire PUT body from `savings/[id]/route.ts` into `updateSavings`. Replace the `if (!config)` 404 return with `throw new DomainError('Not found', 404)`:

```ts
async updateSavings(accountId: string, input: SavingsUpdateInput): Promise<void> {
  const config = await prisma.savingsConfig.findUnique({
    where: { accountId },
    include: {
      account: { select: { type: true } },
      entries: true,
    },
  })
  if (!config) throw new DomainError('Not found', 404)

  const interestRateChanged =
    input.interestRate !== undefined &&
    Math.abs(input.interestRate - config.interestRate) > 1e-9

  await prisma.$transaction(async (tx) => {
    if (input.name !== undefined || input.color !== undefined) {
      await tx.account.update({
        where: { id: accountId },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.color !== undefined && { color: input.color }),
        },
      })
    }

    await tx.savingsConfig.update({
      where: { accountId },
      data: {
        ...(input.accountNumber !== undefined && { accountNumber: input.accountNumber }),
        ...(input.linkedAccountId !== undefined && { linkedAccountId: input.linkedAccountId }),
        ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
        ...(input.notes !== undefined && { notes: input.notes }),
        ...(input.interestRate !== undefined && { interestRate: input.interestRate }),
      },
    })

    if (!interestRateChanged) return

    const newRate = input.interestRate!

    const lastPaidInterest = config.entries
      .filter(e => e.entryType === 'INTEREST' && e.paidAt !== null)
      .sort((a, b) => b.periodNumber - a.periodNumber)[0]

    await tx.savingsEntry.deleteMany({
      where: { savingsConfigId: config.id, entryType: 'INTEREST', paidAt: null },
    })

    const allPaidSorted = config.entries
      .filter(e => e.paidAt !== null)
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || (a.entryType === 'INTEREST' ? -1 : 1))
    const balanceAfterPaid = allPaidSorted.length > 0
      ? allPaidSorted[allPaidSorted.length - 1].scheduledBalance
      : config.initialBalance

    const firstUnpaidContrib = config.entries
      .filter(e => e.entryType === 'CONTRIBUTION' && e.paidAt === null)
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0]
    const rebuildFrom = firstUnpaidContrib?.dueDate ?? lastPaidInterest?.dueDate ?? config.startDate

    const unpaidContribs = config.entries.filter(e => e.entryType === 'CONTRIBUTION' && e.paidAt === null)
    const lastEntry = config.entries[config.entries.length - 1]
    const remainingMonths = config.termMonths !== null
      ? Math.max(Math.round((lastEntry?.dueDate.getTime() ?? rebuildFrom.getTime()) - rebuildFrom.getTime()) / (30.44 * 24 * 60 * 60 * 1000), 0)
      : unpaidContribs.length > 0
        ? Math.round((unpaidContribs[unpaidContribs.length - 1].dueDate.getTime() - rebuildFrom.getTime()) / (30.44 * 24 * 60 * 60 * 1000)) + 1
        : 0

    if (remainingMonths > 0) {
      const newSchedule = generateSavingsSchedule({
        savingsType: (config.account?.type ?? 'SPARPLAN') as 'SPARPLAN' | 'FESTGELD',
        initialBalance: balanceAfterPaid,
        contributionAmount: config.contributionAmount,
        contributionFrequency: config.contributionFrequency as 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY' | null,
        interestRate: newRate,
        interestFrequency: config.interestFrequency as 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY',
        startDate: rebuildFrom,
        termMonths: remainingMonths + 1,
      })

      const interestOnly = newSchedule.filter(r => r.entryType === 'INTEREST')
      let interestCounter = (lastPaidInterest?.periodNumber ?? 0)

      await tx.savingsEntry.createMany({
        data: interestOnly.map(row => ({
          savingsConfigId: config.id,
          entryType: 'INTEREST' as const,
          periodNumber: ++interestCounter,
          dueDate: row.dueDate,
          scheduledAmount: row.scheduledAmount,
          scheduledBalance: row.scheduledBalance,
        })),
      })

      const allUnpaid = [
        ...interestOnly.map(r => ({ ...r, id: null as string | null })),
        ...unpaidContribs.map(r => ({ entryType: 'CONTRIBUTION' as const, dueDate: r.dueDate, scheduledAmount: r.scheduledAmount, id: r.id })),
      ].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || (a.entryType === 'INTEREST' ? -1 : 1))

      let runningBalance = balanceAfterPaid
      for (const entry of allUnpaid) {
        runningBalance = Math.round((runningBalance + entry.scheduledAmount) * 100) / 100
        if (entry.entryType === 'CONTRIBUTION' && entry.id) {
          await tx.savingsEntry.update({
            where: { id: entry.id },
            data: { scheduledBalance: runningBalance },
          })
        }
      }
    }
  })
},
```

- [ ] **Step 2: Migrate deleteSavings**

```ts
async deleteSavings(accountId: string): Promise<void> {
  await prisma.account.update({ where: { id: accountId }, data: { isActive: false } })
},
```

- [ ] **Step 3: Slim `src/app/api/savings/[id]/route.ts` PUT + DELETE**

```ts
export const PUT = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const input = SavingsUpdateSchema.parse(await request.json())
  await savingsService.updateSavings(id, input)
  return NextResponse.json({ success: true })
})

export const DELETE = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  await savingsService.deleteSavings(id)
  return NextResponse.json({ success: true })
})
```

- [ ] **Step 4: TypeScript check**

Run: `npm run build 2>&1 | tail -20`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/savingsService.ts src/app/api/savings/[id]/route.ts
git commit -m "chore: migrate updateSavings + deleteSavings to service"
```

---

## Task 6: Implement `payEntries` and `unpayEntry`

**Files:**
- Modify: `src/lib/services/savingsService.ts`
- Modify: `src/app/api/savings/[id]/pay/route.ts`
- Modify: `src/app/api/savings/[id]/entries/[entryId]/pay/route.ts`

- [ ] **Step 1: Migrate payEntries from `savings/[id]/pay/route.ts`**

```ts
async payEntries(accountId: string, input: SavingsPayInput): Promise<{ paid: number }> {
  const cutoff = new Date(input.paidUntil)
  cutoff.setHours(23, 59, 59, 999)

  const config = await prisma.savingsConfig.findUnique({
    where: { accountId },
    include: {
      account: true,
      linkedAccount: true,
      entries: {
        where: { paidAt: null, dueDate: { lte: cutoff } },
        orderBy: [{ dueDate: 'asc' }, { entryType: 'asc' }],
      },
    },
  })
  if (!config) throw new DomainError('Not found', 404)

  const unpaidDue = config.entries

  await prisma.$transaction(async (tx) => {
    for (const entry of unpaidDue) {
      const savingsTx = await tx.transaction.create({
        data: {
          accountId: config.accountId,
          type: 'INCOME',
          amount: entry.scheduledAmount,
          description: entry.entryType === 'INTEREST' ? 'Zinsgutschrift' : 'Sparrate',
          date: entry.dueDate,
          status: 'CLEARED',
        },
      })

      await tx.account.update({
        where: { id: config.accountId },
        data: { currentBalance: { increment: entry.scheduledAmount } },
      })

      let giroTxId: string | null = null

      if (entry.entryType === 'CONTRIBUTION' && config.linkedAccountId) {
        const giroTx = await tx.transaction.create({
          data: {
            accountId: config.linkedAccountId,
            type: 'EXPENSE',
            amount: -entry.scheduledAmount,
            description: `Sparrate: ${config.account.name}`,
            date: entry.dueDate,
            categoryId: config.categoryId ?? null,
            status: 'CLEARED',
          },
        })
        await tx.account.update({
          where: { id: config.linkedAccountId },
          data: { currentBalance: { increment: -entry.scheduledAmount } },
        })
        giroTxId = giroTx.id
      }

      await tx.savingsEntry.update({
        where: { id: entry.id },
        data: {
          paidAt: new Date(),
          transactionId: savingsTx.id,
          ...(giroTxId && { giroTransactionId: giroTxId }),
        },
      })
    }
  })

  return { paid: unpaidDue.length }
},
```

- [ ] **Step 2: Migrate unpayEntry from `savings/[id]/entries/[entryId]/pay/route.ts`**

```ts
async unpayEntry(accountId: string, entryId: string): Promise<void> {
  const entry = await prisma.savingsEntry.findUnique({
    where: { id: entryId },
    include: { savingsConfig: { include: { account: true } } },
  })
  if (!entry || entry.savingsConfig.accountId !== accountId) throw new DomainError('Not found', 404)
  if (!entry.paidAt) throw new DomainError('Not paid', 400)

  await prisma.$transaction(async (tx) => {
    if (entry.transactionId) {
      await tx.transaction.delete({ where: { id: entry.transactionId } })
      await tx.account.update({
        where: { id: entry.savingsConfig.accountId },
        data: { currentBalance: { increment: -entry.scheduledAmount } },
      })
    }

    if (entry.giroTransactionId) {
      const giroTx = await tx.transaction.findUnique({ where: { id: entry.giroTransactionId } })
      if (giroTx) {
        await tx.transaction.delete({ where: { id: giroTx.id } })
        await tx.account.update({
          where: { id: giroTx.accountId },
          data: { currentBalance: { increment: entry.scheduledAmount } },
        })
      }
    }

    await tx.savingsEntry.update({
      where: { id: entryId },
      data: { paidAt: null, transactionId: null, giroTransactionId: null },
    })
  })
},
```

- [ ] **Step 3: Slim `savings/[id]/pay/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { withHandler } from '@/lib/api/handler'
import { savingsService } from '@/lib/services/savingsService'
import { SavingsPaySchema } from '@/lib/schemas/savings'

export const POST = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const input = SavingsPaySchema.parse(await request.json())
  const result = await savingsService.payEntries(id, input)
  return NextResponse.json(result)
})
```

- [ ] **Step 4: Slim `savings/[id]/entries/[entryId]/pay/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { withHandler } from '@/lib/api/handler'
import { savingsService } from '@/lib/services/savingsService'

export const DELETE = withHandler(async (_, ctx) => {
  const { id, entryId } = await (ctx as { params: Promise<{ id: string; entryId: string }> }).params
  await savingsService.unpayEntry(id, entryId)
  return NextResponse.json({ success: true })
})
```

- [ ] **Step 5: TypeScript check**

Run: `npm run build 2>&1 | tail -20`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/savingsService.ts \
        src/app/api/savings/[id]/pay/route.ts \
        "src/app/api/savings/[id]/entries/[entryId]/pay/route.ts"
git commit -m "chore: migrate payEntries + unpayEntry to service"
```

---

## Task 7: Implement `extendSchedule`

**Files:**
- Modify: `src/lib/services/savingsService.ts`
- Modify: `src/app/api/savings/[id]/extend/route.ts`

- [ ] **Step 1: Migrate extendSchedule**

Move the logic from the current `savings/[id]/extend/route.ts` POST body into the service:

```ts
async extendSchedule(accountId: string, months: number): Promise<{ added: number }> {
  const config = await prisma.savingsConfig.findUnique({
    where: { accountId },
    include: {
      account: { select: { type: true } },
      entries: { orderBy: [{ dueDate: 'asc' }, { entryType: 'asc' }] },
    },
  })
  if (!config) throw new DomainError('Not found', 404)
  if (config.termMonths !== null) throw new DomainError('Festlaufzeit-Konten können nicht verlängert werden', 400)

  const lastEntry = config.entries[config.entries.length - 1]
  const interestPeriodMonths =
    config.interestFrequency === 'MONTHLY' ? 1
    : config.interestFrequency === 'QUARTERLY' ? 3
    : 12

  const extendFrom = lastEntry
    ? addMonths(lastEntry.dueDate, interestPeriodMonths)
    : config.startDate

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
    termMonths: months,
  })

  if (extension.length === 0) return { added: 0 }

  const result = await prisma.savingsEntry.createMany({
    data: extension.map(row => ({
      savingsConfigId: config.id,
      entryType: row.entryType,
      periodNumber: row.periodNumber + (row.entryType === 'INTEREST' ? maxInterestPeriod : maxContribPeriod),
      dueDate: row.dueDate,
      scheduledAmount: row.scheduledAmount,
      scheduledBalance: row.scheduledBalance,
    })),
  })

  return { added: result.count }
},
```

- [ ] **Step 2: Slim `savings/[id]/extend/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'
import { savingsService } from '@/lib/services/savingsService'

const ExtendSchema = z.object({
  months: z.number().int().min(1).max(360).default(24),
})

export const POST = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const { months } = ExtendSchema.parse(await request.json().catch(() => ({})))
  const result = await savingsService.extendSchedule(id, months)
  return NextResponse.json(result)
})
```

- [ ] **Step 3: TypeScript check**

Run: `npm run build 2>&1 | tail -20`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/savingsService.ts src/app/api/savings/[id]/extend/route.ts
git commit -m "chore: migrate extendSchedule to service"
```

---

## Task 8: Verify with Playwright tests

- [ ] **Step 1: Verify dev server starts**

Run: `npm run dev &` (or check it's already running)

- [ ] **Step 2: Run Playwright savings tests**

Run: `npx playwright test tests/savings/ --reporter=list`
Expected: all tests pass

- [ ] **Step 3: Full build check**

Run: `npm run build 2>&1 | tail -20`
Expected: no errors

- [ ] **Step 4: Push and open draft PR**

```bash
git push -u origin chore/savings-service
gh pr create --draft --title "chore: introduce savingsService — slim API routes to orchestration" --body "$(cat <<'EOF'
## Summary
- New `src/lib/services/savingsService.ts` with full savings domain logic
- All six savings route files slimmed to parse-then-delegate pattern
- No HTTP imports in the service; all domain errors via DomainError
- Lazy-extend stays in getSavings() for now (CQRS moved to next PR)

## Test plan
- [ ] `npm run build` passes
- [ ] All Playwright savings tests pass
EOF
)"
```
