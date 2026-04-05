# Linked Sub-Account Entries & Transactions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every sub-account entry always has a linked transaction, and vice versa. Add single-row and batch-edit to the transaction list.

**Architecture:** New shared service layer (`src/lib/sub-account-entries/service.ts`) encapsulates all create/update/delete logic for entry+transaction pairs. API routes become thin wrappers. Transaction page gets edit button per row (opens dialog) and header edit button (inline batch-edit).

**Tech Stack:** Next.js 14 App Router, Prisma v7 + libSQL, TanStack Query, react-hook-form, Zod v4, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-04-05-linked-entries-transactions-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/sub-account-entries/service.ts` | Create | Shared service: create/update/delete linked entry+transaction pairs |
| `src/app/api/sub-account-groups/[id]/entries/route.ts` | Modify | Thin wrapper → `createLinkedEntry()` |
| `src/app/api/sub-account-entries/[id]/route.ts` | Modify | Thin wrapper → `deleteLinkedEntry()` |
| `src/app/api/transactions/route.ts` | Modify | Extract entry logic → `createEntryFromTransaction()` |
| `src/app/api/transactions/[id]/route.ts` | Modify | Extract sync logic → `updateEntryFromTransaction()`, `deleteEntryFromTransaction()` |
| `src/app/api/sub-accounts/route.ts` | Modify | Fix correctedBalance filter |
| `src/components/accounts/SubAccountsSection.tsx` | Modify | Pass `categoryId`, hide add-entry for TRANSFER groups, invalidate `transactions`+`accounts` |
| `src/components/transactions/TransactionFormDialog.tsx` | Modify | Add edit mode (prefill + PUT) |
| `src/app/(app)/transactions/page.tsx` | Modify | Row edit button + batch inline edit mode |
| `src/types/api.ts` | Modify | Add `accountId` to Transaction type for edit |
| `prisma/migrations/20260405_backfill_entry_transactions.sql` | Create | Migration: backfill transactions for orphaned entries |

---

## Task 1: Create Shared Service Layer — `createLinkedEntry`

**Files:**
- Create: `src/lib/sub-account-entries/service.ts`

- [ ] **Step 1: Create service file with `createLinkedEntry`**

```typescript
// src/lib/sub-account-entries/service.ts
import { prisma } from '@/lib/prisma'
import { DomainError } from '@/lib/api/errors'

interface CreateLinkedEntryInput {
  groupId: string
  categoryId: string
  date: string
  description: string
  amount: number
  fromBudget?: boolean
}

export async function createLinkedEntry(input: CreateLinkedEntryInput) {
  const { groupId, categoryId, date, description, amount, fromBudget = false } = input

  return prisma.$transaction(async (tx) => {
    // Load group with parent account
    const group = await tx.subAccountGroup.findUnique({
      where: { id: groupId },
      include: { subAccount: true },
    })
    if (!group) throw new DomainError('Gruppe nicht gefunden', 404)

    // Validate category belongs to this group and is not TRANSFER
    const category = await tx.category.findUnique({
      where: { id: categoryId },
      select: { subAccountGroupId: true, subAccountLinkType: true },
    })
    if (!category || category.subAccountGroupId !== groupId) {
      throw new DomainError('Kategorie gehört nicht zu dieser Gruppe', 400)
    }
    if (category.subAccountLinkType === 'TRANSFER') {
      throw new DomainError('TRANSFER-Einträge müssen über den Transaktions-Dialog erstellt werden', 400)
    }

    const accountId = group.subAccount.accountId
    const transactionAmount = -amount // inverted sign convention

    // Create entry
    const entry = await tx.subAccountEntry.create({
      data: {
        date: new Date(date),
        description,
        amount,
        fromBudget,
        groupId,
      },
    })

    // Create linked transaction
    const transaction = await tx.transaction.create({
      data: {
        date: new Date(date),
        amount: transactionAmount,
        description,
        accountId,
        categoryId,
        type: transactionAmount > 0 ? 'INCOME' : 'EXPENSE',
        status: 'PENDING',
        subAccountEntryId: entry.id,
      },
    })

    // Update account balance
    await tx.account.update({
      where: { id: accountId },
      data: { currentBalance: { increment: transactionAmount } },
    })

    return { entry, transaction }
  })
}
```

- [ ] **Step 2: Verify build**

Run: `cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp" && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to service.ts

- [ ] **Step 3: Commit**

```bash
git add src/lib/sub-account-entries/service.ts
git commit -m "feat: add createLinkedEntry to shared service layer"
```

---

## Task 2: Add `updateLinkedEntry` to Service Layer

**Files:**
- Modify: `src/lib/sub-account-entries/service.ts`

- [ ] **Step 1: Add `updateLinkedEntry` function**

Append to `src/lib/sub-account-entries/service.ts`:

```typescript
interface UpdateLinkedEntryInput {
  date?: string
  description?: string
  amount?: number
}

export async function updateLinkedEntry(entryId: string, input: UpdateLinkedEntryInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.subAccountEntry.findUnique({
      where: { id: entryId },
      include: {
        transaction: true,
        group: { include: { subAccount: true } },
      },
    })
    if (!existing) throw new DomainError('Eintrag nicht gefunden', 404)
    if (!existing.transaction) throw new DomainError('Eintrag hat keine verknüpfte Transaktion', 400)

    const oldTransactionAmount = existing.transaction.amount
    const newEntryAmount = input.amount ?? existing.amount
    const newTransactionAmount = -newEntryAmount
    const newDate = input.date ? new Date(input.date) : existing.date
    const newDescription = input.description ?? existing.description

    // Update entry
    const entry = await tx.subAccountEntry.update({
      where: { id: entryId },
      data: {
        ...(input.date && { date: newDate }),
        ...(input.description !== undefined && { description: newDescription }),
        ...(input.amount !== undefined && { amount: newEntryAmount }),
      },
    })

    // Update linked transaction
    const transaction = await tx.transaction.update({
      where: { id: existing.transaction.id },
      data: {
        date: newDate,
        description: newDescription,
        amount: newTransactionAmount,
        type: newTransactionAmount > 0 ? 'INCOME' : 'EXPENSE',
      },
    })

    // Update account balance if amount changed
    if (input.amount !== undefined && newTransactionAmount !== oldTransactionAmount) {
      await tx.account.update({
        where: { id: existing.group.subAccount.accountId },
        data: { currentBalance: { increment: newTransactionAmount - oldTransactionAmount } },
      })
    }

    return { entry, transaction }
  })
}
```

- [ ] **Step 2: Verify build**

Run: `cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp" && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/sub-account-entries/service.ts
git commit -m "feat: add updateLinkedEntry to shared service layer"
```

---

## Task 3: Add `deleteLinkedEntry` to Service Layer

**Files:**
- Modify: `src/lib/sub-account-entries/service.ts`

- [ ] **Step 1: Add `deleteLinkedEntry` function**

Append to `src/lib/sub-account-entries/service.ts`:

```typescript
export async function deleteLinkedEntry(entryId: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.subAccountEntry.findUnique({
      where: { id: entryId },
      include: {
        transaction: true,
        group: { include: { subAccount: true } },
      },
    })
    if (!existing) throw new DomainError('Eintrag nicht gefunden', 404)

    const accountId = existing.group.subAccount.accountId

    // Reverse account balance (using transaction amount, not entry amount)
    if (existing.transaction) {
      await tx.account.update({
        where: { id: accountId },
        data: { currentBalance: { increment: -existing.transaction.amount } },
      })
      // Delete transaction first (holds FK to entry)
      await tx.transaction.delete({ where: { id: existing.transaction.id } })
    }

    // Delete entry
    await tx.subAccountEntry.delete({ where: { id: entryId } })
  })
}
```

- [ ] **Step 2: Verify build**

Run: `cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp" && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/sub-account-entries/service.ts
git commit -m "feat: add deleteLinkedEntry to shared service layer"
```

---

## Task 4: Add Transaction-Side Service Functions

**Files:**
- Modify: `src/lib/sub-account-entries/service.ts`

These functions extract the existing inline logic from the transaction API routes. They handle the transaction→entry direction (including TRANSFER pair logic).

- [ ] **Step 1: Add `createEntryFromTransaction`**

Append to `src/lib/sub-account-entries/service.ts`:

```typescript
import type { PrismaClient } from '@prisma/client'

// Type for Prisma interactive transaction client
type TxClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

interface CreateEntryFromTransactionInput {
  transactionId: string
  transactionAmount: number
  date: Date
  description: string
  status: string
  categoryId: string | null
  linkedGroupId: string
  linkType: string
  skipPairedTransfer?: boolean
}

/**
 * Called within an existing prisma.$transaction from the transaction POST handler.
 * Creates a SubAccountEntry linked to the transaction, and optionally a paired TRANSFER.
 */
export async function createEntryFromTransaction(tx: TxClient, input: CreateEntryFromTransactionInput) {
  const { transactionId, transactionAmount, date, description, status, categoryId, linkedGroupId, linkType, skipPairedTransfer } = input

  const entryAmount = -transactionAmount
  const entry = await tx.subAccountEntry.create({
    data: {
      date,
      description,
      amount: entryAmount,
      fromBudget: true,
      groupId: linkedGroupId,
    },
  })

  await tx.transaction.update({
    where: { id: transactionId },
    data: { subAccountEntryId: entry.id },
  })

  let pairedTransactionId: string | null = null

  if (linkType === 'TRANSFER' && !skipPairedTransfer) {
    const group = await tx.subAccountGroup.findUnique({
      where: { id: linkedGroupId },
      include: { subAccount: true },
    })
    if (group) {
      const targetAccountId = group.subAccount.accountId
      const pairedAmount = -transactionAmount

      const paired = await tx.transaction.create({
        data: {
          date,
          amount: pairedAmount,
          description,
          accountId: targetAccountId,
          categoryId,
          type: 'TRANSFER',
          status,
        },
      })

      await tx.account.update({
        where: { id: targetAccountId },
        data: { currentBalance: { increment: pairedAmount } },
      })

      await tx.transaction.update({
        where: { id: transactionId },
        data: { transferToId: paired.id },
      })

      pairedTransactionId = paired.id
    }
  }

  return { entry, pairedTransactionId }
}
```

- [ ] **Step 2: Add `updateEntryFromTransaction`**

Append to `src/lib/sub-account-entries/service.ts`:

```typescript
interface UpdateEntryFromTransactionInput {
  newAmount: number
  oldAmount: number
  date: Date
  description: string
  newCategoryId: string | null
  existingSubAccountEntryId: string | null
  existingTransferId: string | null
  existingStatus: string
  transactionId: string
}

/**
 * Called within an existing prisma.$transaction from the transaction PUT handler.
 * Syncs the linked SubAccountEntry and optional TRANSFER pair.
 */
export async function updateEntryFromTransaction(tx: TxClient, input: UpdateEntryFromTransactionInput) {
  const { newAmount, oldAmount, date, description, newCategoryId, existingSubAccountEntryId, existingTransferId, existingStatus, transactionId } = input

  // Resolve new category's sub-account group
  let newSubGroupId: string | null = null
  let newLinkType = 'BOOKING'
  if (newCategoryId) {
    const cat = await tx.category.findUnique({
      where: { id: newCategoryId },
      select: { subAccountGroupId: true, subAccountLinkType: true },
    })
    newSubGroupId = cat?.subAccountGroupId ?? null
    newLinkType = cat?.subAccountLinkType ?? 'BOOKING'
  }

  const hadEntry = !!existingSubAccountEntryId

  // Sync sub-account entry
  if (hadEntry && newSubGroupId) {
    await tx.subAccountEntry.update({
      where: { id: existingSubAccountEntryId! },
      data: { date, description, amount: -newAmount, groupId: newSubGroupId },
    })
  } else if (hadEntry && !newSubGroupId) {
    await tx.transaction.update({ where: { id: transactionId }, data: { subAccountEntryId: null } })
    await tx.subAccountEntry.delete({ where: { id: existingSubAccountEntryId! } })
  } else if (!hadEntry && newSubGroupId) {
    const entry = await tx.subAccountEntry.create({
      data: { date, description, amount: -newAmount, fromBudget: true, groupId: newSubGroupId },
    })
    await tx.transaction.update({ where: { id: transactionId }, data: { subAccountEntryId: entry.id } })
  }

  // Sync paired TRANSFER transaction
  if (existingTransferId) {
    const paired = await tx.transaction.findUnique({ where: { id: existingTransferId } })
    if (paired) {
      const pairedDiff = -(newAmount - oldAmount)
      if (newAmount !== oldAmount) {
        await tx.account.update({
          where: { id: paired.accountId },
          data: { currentBalance: { increment: pairedDiff } },
        })
      }
      await tx.transaction.update({
        where: { id: existingTransferId },
        data: {
          date,
          description,
          amount: -newAmount,
        },
      })
    }
  } else if (!existingTransferId && newSubGroupId && newLinkType === 'TRANSFER') {
    const group = await tx.subAccountGroup.findUnique({
      where: { id: newSubGroupId },
      include: { subAccount: true },
    })
    if (group) {
      const targetAccountId = group.subAccount.accountId
      const paired = await tx.transaction.create({
        data: {
          date,
          amount: -newAmount,
          description,
          accountId: targetAccountId,
          categoryId: newCategoryId,
          type: 'TRANSFER',
          status: existingStatus,
        },
      })
      await tx.account.update({
        where: { id: targetAccountId },
        data: { currentBalance: { increment: -newAmount } },
      })
      await tx.transaction.update({ where: { id: transactionId }, data: { transferToId: paired.id } })
    }
  }
}
```

- [ ] **Step 3: Add `deleteEntryFromTransaction`**

Append to `src/lib/sub-account-entries/service.ts`:

```typescript
/**
 * Called within an existing prisma.$transaction from the transaction DELETE handler.
 * Deletes the linked SubAccountEntry if present.
 */
export async function deleteEntryFromTransaction(tx: TxClient, subAccountEntryId: string | null) {
  if (!subAccountEntryId) return
  // Unlink first (FK constraint), then delete
  await tx.transaction.updateMany({
    where: { subAccountEntryId },
    data: { subAccountEntryId: null },
  })
  await tx.subAccountEntry.delete({ where: { id: subAccountEntryId } })
}
```

- [ ] **Step 4: Move `TxClient` type and `PrismaClient` import to top of file**

The import `import type { PrismaClient } from '@prisma/client'` and the `TxClient` type definition should be placed at the top of the file, after the existing imports. Ensure the file compiles:

Run: `cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp" && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/sub-account-entries/service.ts
git commit -m "feat: add transaction-side service functions (create/update/delete entry from transaction)"
```

---

## Task 5: Refactor Entry API Routes to Use Service Layer

**Files:**
- Modify: `src/app/api/sub-account-groups/[id]/entries/route.ts`
- Modify: `src/app/api/sub-account-entries/[id]/route.ts`

- [ ] **Step 1: Refactor entry creation endpoint**

Replace the entire file `src/app/api/sub-account-groups/[id]/entries/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'
import { createLinkedEntry } from '@/lib/sub-account-entries/service'

export const POST = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const body = await request.json()
  const data = z.object({
    date: z.string(),
    description: z.string().min(1),
    amount: z.coerce.number(),
    fromBudget: z.boolean().default(false),
    categoryId: z.string().min(1),
  }).parse(body)

  const result = await createLinkedEntry({
    groupId: id,
    categoryId: data.categoryId,
    date: data.date,
    description: data.description,
    amount: data.amount,
    fromBudget: data.fromBudget,
  })

  return NextResponse.json(result.entry, { status: 201 })
})
```

- [ ] **Step 2: Refactor entry deletion endpoint**

Replace the entire file `src/app/api/sub-account-entries/[id]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { withHandler } from '@/lib/api/handler'
import { deleteLinkedEntry } from '@/lib/sub-account-entries/service'

export const DELETE = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  await deleteLinkedEntry(id)
  return NextResponse.json({ success: true })
})
```

- [ ] **Step 3: Verify build**

Run: `cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp" && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/app/api/sub-account-groups/\[id\]/entries/route.ts src/app/api/sub-account-entries/\[id\]/route.ts
git commit -m "refactor: entry API routes use shared service layer"
```

---

## Task 6: Refactor Transaction POST to Use Service Layer

**Files:**
- Modify: `src/app/api/transactions/route.ts`

- [ ] **Step 1: Replace inline entry logic with service call**

Replace the POST handler (lines 70-167) in `src/app/api/transactions/route.ts`. The GET handler (lines 6-68) stays unchanged.

```typescript
import { createEntryFromTransaction } from '@/lib/sub-account-entries/service'

export const POST = withHandler(async (request: Request) => {
  const body = await request.json()
  const data = createTransactionSchema.parse(body)

  const transaction = await prisma.$transaction(async (tx) => {
    // Load category with sub-account link info
    const category = data.categoryId
      ? await tx.category.findUnique({
          where: { id: data.categoryId },
          include: {
            subAccountGroup: {
              include: { subAccount: { include: { account: true } } },
            },
          },
        })
      : null

    const linkedGroup = category?.subAccountGroup ?? null
    const linkType = category?.subAccountLinkType ?? 'BOOKING'

    // For TRANSFER link type, override the transaction type
    const txType = linkedGroup && linkType === 'TRANSFER' && !data.skipSubAccountEntry ? 'TRANSFER' : data.type

    // Create source transaction
    const { skipSubAccountEntry: _skip1, skipPairedTransfer: _skip2, ...txData } = data
    const t = await tx.transaction.create({
      data: {
        ...txData,
        type: txType,
        date: new Date(data.date),
        categoryId: data.categoryId || null,
      },
      include: { account: true, category: true },
    })

    // Update source account balance
    await tx.account.update({
      where: { id: data.accountId },
      data: { currentBalance: { increment: data.amount } },
    })

    // Delegate entry + TRANSFER pair creation to service layer
    if (linkedGroup && !data.skipSubAccountEntry) {
      const result = await createEntryFromTransaction(tx, {
        transactionId: t.id,
        transactionAmount: data.amount,
        date: new Date(data.date),
        description: data.description,
        status: data.status ?? 'PENDING',
        categoryId: data.categoryId || null,
        linkedGroupId: linkedGroup.id,
        linkType,
        skipPairedTransfer: data.skipPairedTransfer,
      })

      return {
        ...t,
        subAccountEntryId: result.entry.id,
        ...(result.pairedTransactionId && { transferToId: result.pairedTransactionId }),
      }
    }

    return t
  })

  return NextResponse.json(transaction, { status: 201 })
})
```

- [ ] **Step 2: Verify build**

Run: `cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp" && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Verify via dev server — create a transaction with a category linked to a sub-account group**

Run: `npm run dev`
Test: Create a transaction in the UI with a category that has a sub-account link. Verify:
- Transaction appears in transaction list
- Entry appears in sub-account view
- Account balance updates correctly

- [ ] **Step 4: Commit**

```bash
git add src/app/api/transactions/route.ts
git commit -m "refactor: transaction POST uses service layer for entry creation"
```

---

## Task 7: Refactor Transaction PUT and DELETE to Use Service Layer

**Files:**
- Modify: `src/app/api/transactions/[id]/route.ts`

- [ ] **Step 1: Replace inline entry sync in PUT handler**

Replace the PUT handler (lines 7-125) with service layer calls. Replace lines 41-119 (sub-account entry sync + TRANSFER sync) with a call to `updateEntryFromTransaction`:

```typescript
import { updateEntryFromTransaction, deleteEntryFromTransaction } from '@/lib/sub-account-entries/service'

export const PUT = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const body = await request.json()
  const data = updateTransactionSchema.parse(body)

  const existing = await prisma.transaction.findUnique({
    where: { id },
    include: { category: { include: { subAccountGroup: true } } },
  })
  if (!existing) throw new DomainError('Nicht gefunden', 404)

  const transaction = await prisma.$transaction(async (tx) => {
    const newAmount = data.amount ?? existing.amount
    const newDate = data.date ? new Date(data.date) : existing.date
    const newDescription = data.description ?? existing.description

    // Update source account balance if amount changed
    if (data.amount !== undefined && data.amount !== existing.amount) {
      const diff = data.amount - existing.amount
      await tx.account.update({
        where: { id: existing.accountId },
        data: { currentBalance: { increment: diff } },
      })
    }

    const updated = await tx.transaction.update({
      where: { id },
      data: {
        ...data,
        ...(data.date && { date: newDate }),
      },
      include: { account: true, category: { include: { subAccountGroup: true } } },
    })

    // Delegate entry + TRANSFER sync to service layer
    const newCategoryId = data.categoryId !== undefined ? data.categoryId : existing.categoryId
    await updateEntryFromTransaction(tx, {
      newAmount,
      oldAmount: existing.amount,
      date: newDate,
      description: newDescription,
      newCategoryId,
      existingSubAccountEntryId: existing.subAccountEntryId,
      existingTransferId: existing.transferToId,
      existingStatus: existing.status,
      transactionId: id,
    })

    return updated
  })

  return NextResponse.json(transaction)
})
```

- [ ] **Step 2: Replace inline entry deletion in DELETE handler**

Replace the DELETE handler (lines 127-183). Replace lines 154-167 (entry unlink + delete) with a call to `deleteEntryFromTransaction`:

```typescript
export const DELETE = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const { searchParams } = new URL(request.url)
  const revertLoan = searchParams.get('revertLoan') === 'true'

  const existing = await prisma.transaction.findUnique({ where: { id } })
  if (!existing) throw new DomainError('Nicht gefunden', 404)

  const linkedPayment = await prisma.loanPayment.findFirst({
    where: { transactionId: id },
  })

  await prisma.$transaction(async (tx) => {
    const pairedId = existing.transferToId

    // Loan payment cleanup
    if (linkedPayment) {
      await tx.loanPayment.update({
        where: { loanId_periodNumber: { loanId: linkedPayment.loanId, periodNumber: linkedPayment.periodNumber } },
        data: {
          transactionId: null,
          ...(revertLoan && { paidAt: null }),
        },
      })
    }

    // Delete linked sub-account entry via service
    await deleteEntryFromTransaction(tx, existing.subAccountEntryId)

    // Unlink transfer and delete transaction
    if (pairedId) {
      await tx.transaction.update({ where: { id }, data: { transferToId: null } })
    }
    await tx.transaction.delete({ where: { id } })

    // Reverse source account balance
    await tx.account.update({
      where: { id: existing.accountId },
      data: { currentBalance: { increment: -existing.amount } },
    })

    // Delete paired TRANSFER transaction and reverse its account balance
    if (pairedId) {
      const paired = await tx.transaction.findUnique({ where: { id: pairedId } })
      if (paired) {
        await tx.transaction.delete({ where: { id: pairedId } })
        await tx.account.update({
          where: { id: paired.accountId },
          data: { currentBalance: { increment: -paired.amount } },
        })
      }
    }
  })

  return NextResponse.json({ success: true })
})
```

- [ ] **Step 3: Verify build**

Run: `cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp" && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Verify via dev server**

Test: Edit a transaction that has a sub-account entry — verify entry stays in sync. Delete a transaction with entry — verify both are removed.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/transactions/\[id\]/route.ts
git commit -m "refactor: transaction PUT/DELETE use service layer for entry sync"
```

---

## Task 8: Update correctedBalance Filter

**Files:**
- Modify: `src/app/api/sub-accounts/route.ts`

- [ ] **Step 1: Change the filter to exclude ALL transactions with subAccountEntryId**

In `src/app/api/sub-accounts/route.ts`, replace lines 34-37:

Old:
```typescript
      OR: [
        { type: 'TRANSFER' },
        { type: 'EXPENSE', subAccountEntryId: { not: null } },
      ],
```

New:
```typescript
      OR: [
        { type: 'TRANSFER' },
        { subAccountEntryId: { not: null } },
      ],
```

- [ ] **Step 2: Verify build**

Run: `cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp" && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/sub-accounts/route.ts
git commit -m "fix: correctedBalance excludes all transactions with subAccountEntryId"
```

---

## Task 9: Update SubAccountsSection — Pass categoryId, Hide TRANSFER, Fix Invalidation

**Files:**
- Modify: `src/components/accounts/SubAccountsSection.tsx`

This task requires the SubAccountsSection to know which category each group is linked to, so it can pass `categoryId` when creating entries. The component also needs to hide the "add entry" link for TRANSFER-linked groups.

- [ ] **Step 1: Extend the data query to include linked categories and their linkType**

The sub-accounts query in the account detail page needs to include `linkedCategories` on each group. Find where sub-accounts are fetched for the account detail page (the API at `/api/accounts/[id]/sub-accounts`) and ensure groups include `linkedCategories: { select: { id: true, subAccountLinkType: true } }`.

Check the route file and add the include if missing:

```typescript
// In the sub-accounts query for the account detail, ensure groups include:
groups: {
  include: {
    entries: true,
    linkedCategories: { select: { id: true, subAccountLinkType: true } },
  },
},
```

- [ ] **Step 2: Update interfaces in SubAccountsSection**

In `src/components/accounts/SubAccountsSection.tsx`, update the `SubAccountGroup` interface to include linked categories:

```typescript
interface LinkedCategory {
  id: string
  subAccountLinkType: string
}

interface SubAccountGroup {
  id: string
  name: string
  initialBalance: number
  entries: SubAccountEntry[]
  linkedCategories: LinkedCategory[]
}
```

- [ ] **Step 3: Pass categoryId in NewEntryRow and hide for TRANSFER groups**

Update `NewEntryRow` to accept and send `categoryId`:

```typescript
function NewEntryRow({ groupId, accountId, categoryId, onDone }: { groupId: string; accountId: string; categoryId: string; onDone: () => void }) {
  const qc = useQueryClient()
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const mutation = useMutation({
    mutationFn: () =>
      fetch(`/api/sub-account-groups/${groupId}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, description, amount: parseFloat(amount), fromBudget: false, categoryId }),
      }).then(r => { if (!r.ok) throw new Error('Fehler'); return r.json() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-accounts', accountId] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      onDone()
    },
    onError: () => toast.error('Fehler beim Erstellen des Eintrags'),
  })
  // ... rest unchanged
```

- [ ] **Step 4: Update GroupSection to conditionally show "add entry" and pass categoryId**

In `GroupSection`, determine the first BOOKING-linked category, hide the add-entry link if none exists or if only TRANSFER categories are linked:

Replace the "Add entry row" section (around lines 267-283):

```typescript
      {/* Add entry row — only for BOOKING-linked groups with a category */}
      {expanded && (() => {
        const bookingCategory = group.linkedCategories.find(c => c.subAccountLinkType === 'BOOKING')
        if (!bookingCategory) return null
        return addingEntry
          ? <NewEntryRow groupId={group.id} accountId={accountId} categoryId={bookingCategory.id} onDone={() => setAddingEntry(false)} />
          : (
            <tr>
              <td colSpan={5} className="px-2 py-1 pl-8">
                <button
                  onClick={() => setAddingEntry(true)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Eintrag hinzufügen
                </button>
              </td>
            </tr>
          )
      })()}
```

- [ ] **Step 5: Add `transactions` and `accounts` invalidation to deleteEntry mutation**

In `GroupSection`, update the `deleteEntry` mutation's `onSuccess`:

```typescript
  const deleteEntry = useMutation({
    mutationFn: async (entryId: string) => {
      const res = await fetch(`/api/sub-account-entries/${entryId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-accounts', accountId] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
    onError: () => toast.error('Fehler beim Löschen des Eintrags'),
  })
```

- [ ] **Step 6: Verify build**

Run: `cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp" && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 7: Verify via dev server**

Test:
- BOOKING group shows "Eintrag hinzufügen" link
- TRANSFER group does NOT show the link
- Creating an entry also creates a transaction (visible in transaction list)
- Deleting an entry also removes the transaction
- Account balance updates correctly

- [ ] **Step 8: Commit**

```bash
git add src/components/accounts/SubAccountsSection.tsx
git commit -m "feat: entry creation generates linked transaction, hide add-entry for TRANSFER groups"
```

---

## Task 10: TransactionFormDialog — Add Edit Mode

**Files:**
- Modify: `src/components/transactions/TransactionFormDialog.tsx`

- [ ] **Step 1: Add `editTransaction` prop and update interface**

In `src/components/transactions/TransactionFormDialog.tsx`, update the Props interface and add the edit mode logic:

```typescript
interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultAccountId?: string
  hideAccountSelector?: boolean
  editTransaction?: Transaction | null
}

export function TransactionFormDialog({ open, onOpenChange, defaultAccountId, hideAccountSelector, editTransaction }: Props) {
```

Add import at the top:
```typescript
import type { Account, Transaction } from '@/types/api'
```

- [ ] **Step 2: Prefill form when editing**

Replace the existing `useEffect` for defaultAccountId (lines 106-110) with a combined effect:

```typescript
  // Prefill form when editing or when dialog opens with default account
  useEffect(() => {
    if (!open) return
    if (editTransaction) {
      form.reset({
        date: format(new Date(editTransaction.date), 'yyyy-MM-dd'),
        amount: Math.abs(editTransaction.amount),
        description: editTransaction.description,
        payee: editTransaction.payee ?? '',
        accountId: editTransaction.accountId,
        categoryId: editTransaction.categoryId ?? '',
        type: editTransaction.type,
        notes: editTransaction.notes ?? '',
      })
    } else if (defaultAccountId) {
      form.setValue('accountId', defaultAccountId)
    }
  }, [open, editTransaction, defaultAccountId]) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 3: Add update mutation alongside create mutation**

Replace the existing `mutation` (lines 142-169) with create and update mutations:

```typescript
  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const amount = values.type === 'INCOME' ? Math.abs(values.amount) : -Math.abs(values.amount)
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          amount,
          categoryId: values.categoryId || null,
          payee: values.payee || null,
        }),
      })
      if (!res.ok) throw new Error('Fehler')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['sub-accounts'] })
      toast.success('Transaktion erstellt')
      handleClose()
    },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  const updateMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const amount = values.type === 'INCOME' ? Math.abs(values.amount) : -Math.abs(values.amount)
      const res = await fetch(`/api/transactions/${editTransaction!.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: values.date,
          amount,
          description: values.description,
          payee: values.payee || null,
          notes: values.notes || null,
          categoryId: values.categoryId || null,
          status: editTransaction!.status,
        }),
      })
      if (!res.ok) throw new Error('Fehler')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['sub-accounts'] })
      toast.success('Transaktion aktualisiert')
      handleClose()
    },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  const mutation = editTransaction ? updateMutation : createMutation

  function handleClose() {
    onOpenChange(false)
    form.reset({ date: format(new Date(), 'yyyy-MM-dd'), type: 'EXPENSE', amount: 0 })
    setTransferTargetId('')
    setTransferGroupId('')
    setSelectedGroupId('')
  }
```

- [ ] **Step 4: Update dialog title and submit button**

Replace the `DialogTitle` (line 175):

```typescript
          <DialogTitle>{editTransaction ? 'Transaktion bearbeiten' : 'Neue Transaktion'}</DialogTitle>
```

Update the submit button text (line 413-414):

```typescript
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Speichern...' : 'Speichern'}
              </Button>
```

- [ ] **Step 5: Verify build**

Run: `cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp" && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/components/transactions/TransactionFormDialog.tsx
git commit -m "feat: TransactionFormDialog supports edit mode with prefill + PUT"
```

---

## Task 11: Transaction Page — Row Edit Button

**Files:**
- Modify: `src/app/(app)/transactions/page.tsx`

- [ ] **Step 1: Add edit state and edit button to each row**

Add import for `Pencil` icon and state for editing:

```typescript
import { Plus, Pencil } from 'lucide-react'
```

Add state for the transaction being edited:

```typescript
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
```

- [ ] **Step 2: Add edit button in each table row**

In the table row's last `<td>` (lines 170-179), add a Pencil button before the delete button:

```typescript
                <td className="p-3">
                  <div className="flex items-center gap-1 justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground h-7 px-2"
                      onClick={() => setEditingTransaction(t)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive h-7 px-2"
                      onClick={() => handleDeleteClick(t)}
                      disabled={deleteMutation.isPending}
                    >
                      ×
                    </Button>
                  </div>
                </td>
```

- [ ] **Step 3: Add edit dialog alongside create dialog**

After the existing `TransactionFormDialog` (line 228), add the edit dialog:

```typescript
      <TransactionFormDialog open={open} onOpenChange={setOpen} />

      <TransactionFormDialog
        open={!!editingTransaction}
        onOpenChange={(v) => { if (!v) setEditingTransaction(null) }}
        editTransaction={editingTransaction}
      />
```

- [ ] **Step 4: Add `sub-accounts` to delete mutation invalidation**

In the `deleteMutation.onSuccess` (lines 71-77), add sub-accounts invalidation:

```typescript
    onSuccess: (_, { revertLoan }) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['sub-accounts'] })
      if (revertLoan) queryClient.invalidateQueries({ queryKey: ['loans'] })
      setPendingDelete(null)
      toast.success('Transaktion gelöscht')
    },
```

- [ ] **Step 5: Verify build**

Run: `cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp" && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 6: Verify via dev server**

Test: Click pencil icon on a transaction → dialog opens prefilled → change description → save → transaction list updates.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(app\)/transactions/page.tsx
git commit -m "feat: add per-row edit button to transaction list"
```

---

## Task 12: Transaction Page — Batch Inline Edit Mode

**Files:**
- Modify: `src/app/(app)/transactions/page.tsx`

- [ ] **Step 1: Add batch edit state**

Add state variables after the existing state declarations:

```typescript
  const [isEditMode, setIsEditMode] = useState(false)
  const [editingRows, setEditingRows] = useState<Record<string, Partial<{
    date: string
    description: string
    amount: number
    accountId: string
    categoryId: string | null
  }>>>({})
  const [isSaving, setIsSaving] = useState(false)
```

- [ ] **Step 2: Fetch accounts and category groups for dropdowns in edit mode**

Add queries needed for the inline dropdowns:

```typescript
  const { data: allAccounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => fetch('/api/accounts').then(r => r.json()),
    enabled: isEditMode,
  })
```

Add import for `Account` type and `AppSelect`:
```typescript
import type { Transaction, TransactionPage, LoanPaymentRef, Account } from '@/types/api'
import { AppSelect } from '@/components/ui/app-select'
```

- [ ] **Step 3: Add edit mode toggle button in table header**

Replace the `<thead>` section (lines 128-136):

```typescript
          <thead className="bg-muted">
            <tr>
              <th className="text-left p-3 font-medium">Datum</th>
              <th className="text-left p-3 font-medium">Beschreibung</th>
              <th className="text-left p-3 font-medium">Konto</th>
              <th className="text-left p-3 font-medium">Kategorie</th>
              <th className="text-right p-3 font-medium">Betrag</th>
              <th className="p-3">
                {isEditMode ? (
                  <div className="flex items-center gap-1 justify-end">
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 px-2"
                      onClick={handleBatchSave}
                      disabled={isSaving || Object.keys(editingRows).length === 0}
                    >
                      {isSaving ? 'Speichern...' : 'Speichern'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => { setIsEditMode(false); setEditingRows({}) }}
                      disabled={isSaving}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-foreground h-7 px-2"
                    onClick={() => setIsEditMode(true)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
              </th>
            </tr>
          </thead>
```

Add import for `X`:
```typescript
import { Plus, Pencil, X } from 'lucide-react'
```

- [ ] **Step 4: Add batch save handler**

Add the handler function before the return statement:

```typescript
  async function handleBatchSave() {
    setIsSaving(true)
    const errors: string[] = []

    for (const [id, changes] of Object.entries(editingRows)) {
      try {
        const original = transactions.find(t => t.id === id)
        if (!original) continue

        const body: Record<string, unknown> = {}
        if (changes.date !== undefined) body.date = changes.date
        if (changes.description !== undefined) body.description = changes.description
        if (changes.amount !== undefined) {
          body.amount = original.type === 'INCOME' ? Math.abs(changes.amount) : -Math.abs(changes.amount)
        }
        if (changes.categoryId !== undefined) body.categoryId = changes.categoryId || null

        const res = await fetch(`/api/transactions/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error(`Fehler bei Transaktion ${original.description}`)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : 'Unbekannter Fehler')
      }
    }

    queryClient.invalidateQueries({ queryKey: ['transactions'] })
    queryClient.invalidateQueries({ queryKey: ['accounts'] })
    queryClient.invalidateQueries({ queryKey: ['sub-accounts'] })

    if (errors.length > 0) {
      toast.error(`${errors.length} Fehler beim Speichern`)
    } else {
      toast.success('Alle Änderungen gespeichert')
      setIsEditMode(false)
      setEditingRows({})
    }

    setIsSaving(false)
  }
```

- [ ] **Step 5: Replace table row rendering with edit-mode-aware version**

Replace the table row rendering (lines 143-182). This is the core of inline editing:

```typescript
            ) : transactions.map((t: Transaction) => {
              const rowChanges = editingRows[t.id]
              const isChanged = !!rowChanges
              const hasEntry = !!t.subAccountEntryId

              if (isEditMode) {
                const currentDate = rowChanges?.date ?? format(new Date(t.date), 'yyyy-MM-dd')
                const currentDesc = rowChanges?.description ?? t.description
                const currentAmount = rowChanges?.amount ?? Math.abs(t.amount)
                const currentAccountId = rowChanges?.accountId ?? t.accountId
                const currentCategoryId = rowChanges?.categoryId !== undefined ? rowChanges.categoryId : t.categoryId

                function updateRow(field: string, value: unknown) {
                  setEditingRows(prev => ({
                    ...prev,
                    [t.id]: { ...prev[t.id], [field]: value },
                  }))
                }

                return (
                  <tr key={t.id} className={`border-t ${isChanged ? 'bg-amber-50 dark:bg-amber-950/20' : 'hover:bg-muted/50'}`}>
                    <td className="p-2">
                      <Input
                        type="date"
                        value={currentDate}
                        onChange={e => updateRow('date', e.target.value)}
                        className="h-8 text-sm w-32"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        value={currentDesc}
                        onChange={e => updateRow('description', e.target.value)}
                        className="h-8 text-sm"
                      />
                    </td>
                    <td className="p-2">
                      {hasEntry ? (
                        <span className="text-xs text-muted-foreground">{t.account?.name}</span>
                      ) : (
                        <AppSelect
                          value={currentAccountId}
                          onValueChange={v => updateRow('accountId', v)}
                          options={allAccounts.map(a => ({ value: a.id, label: a.name }))}
                          placeholder="Konto"
                          className="h-8 text-sm"
                        />
                      )}
                    </td>
                    <td className="p-2">
                      {hasEntry ? (
                        <span className="text-xs text-muted-foreground">{t.category?.name ?? '—'}</span>
                      ) : (
                        <Input
                          value={currentCategoryId ?? ''}
                          disabled
                          className="h-8 text-sm opacity-50"
                          placeholder="via Dialog"
                        />
                      )}
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        step="0.01"
                        value={currentAmount}
                        onChange={e => updateRow('amount', parseFloat(e.target.value) || 0)}
                        className="h-8 text-sm text-right w-28"
                      />
                    </td>
                    <td className="p-2" />
                  </tr>
                )
              }

              // Normal read mode (unchanged from original)
              return (
                <tr key={t.id} className="border-t hover:bg-muted/50">
                  <td className="p-3 text-muted-foreground whitespace-nowrap">{formatDate(t.date)}</td>
                  <td className="p-3">
                    <p className="font-medium">{t.description}</p>
                    {t.payee && <p className="text-xs text-muted-foreground">{t.payee}</p>}
                  </td>
                  <td className="p-3">
                    {t.account && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.account.color }} />
                        <span className="text-xs">{t.account.name}</span>
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    {t.category ? (
                      <Badge variant="outline" style={{ borderColor: t.category.color, color: t.category.color }}>
                        {t.category.name}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className={`p-3 text-right font-semibold whitespace-nowrap ${t.amount < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                    {fmt(t.amount)}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-foreground h-7 px-2"
                        onClick={() => setEditingTransaction(t)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive h-7 px-2"
                        onClick={() => handleDeleteClick(t)}
                        disabled={deleteMutation.isPending}
                      >
                        ×
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
```

Add `format` import from date-fns (already imported in TransactionFormDialog, but check if it's in transactions/page.tsx):
```typescript
import { format } from 'date-fns'
```

- [ ] **Step 6: Verify build**

Run: `cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp" && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 7: Verify via dev server**

Test:
- Click pencil icon in table header → rows become editable
- Change description of a row → row highlights in amber
- Click Save → changes persist, table returns to read mode
- Click Cancel → changes are discarded
- Linked rows: account and category columns show read-only text

- [ ] **Step 8: Commit**

```bash
git add src/app/\(app\)/transactions/page.tsx
git commit -m "feat: add batch inline edit mode to transaction list"
```

---

## Task 13: Migration Script — Backfill Transactions for Orphaned Entries

**Files:**
- Create: `prisma/migrations/20260405_backfill_entry_transactions.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Migration: Backfill transactions for SubAccountEntries without a linked Transaction
-- This creates CLEARED transactions for each orphaned entry and recalculates account balances.

-- Step 1: Create transactions for entries that have no linked transaction.
-- Uses MIN(c.id) as deterministic categoryId when multiple categories link to same group.
-- transaction.amount = -entry.amount (inverted sign convention)
INSERT INTO Transaction (id, date, amount, description, accountId, categoryId, type, status, subAccountEntryId, createdAt, updatedAt)
SELECT
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))) AS id,
  e.date,
  -e.amount AS amount,
  e.description,
  sa.accountId,
  (SELECT MIN(c.id) FROM Category c WHERE c.subAccountGroupId = g.id) AS categoryId,
  CASE WHEN -e.amount > 0 THEN 'INCOME' ELSE 'EXPENSE' END AS type,
  'CLEARED' AS status,
  e.id AS subAccountEntryId,
  datetime('now') AS createdAt,
  datetime('now') AS updatedAt
FROM SubAccountEntry e
JOIN SubAccountGroup g ON e.groupId = g.id
JOIN SubAccount sa ON g.subAccountId = sa.id
WHERE NOT EXISTS (
  SELECT 1 FROM Transaction t WHERE t.subAccountEntryId = e.id
);

-- Step 2: Recalculate currentBalance for all affected accounts.
-- currentBalance = SUM(all transaction amounts for this account)
UPDATE Account
SET currentBalance = (
  SELECT COALESCE(SUM(t.amount), 0)
  FROM Transaction t
  WHERE t.accountId = Account.id
)
WHERE id IN (
  SELECT DISTINCT sa.accountId
  FROM SubAccountEntry e
  JOIN SubAccountGroup g ON e.groupId = g.id
  JOIN SubAccount sa ON g.subAccountId = sa.id
);
```

- [ ] **Step 2: Verify SQL syntax**

Run: `cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp" && sqlite3 prisma/dev.db ".schema Transaction" | head -5`
Expected: Shows the Transaction table schema to confirm column names match.

- [ ] **Step 3: Apply migration to dev.db**

Run: `cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp" && sqlite3 prisma/dev.db < prisma/migrations/20260405_backfill_entry_transactions.sql`
Expected: No errors

- [ ] **Step 4: Verify migration results**

Run: `cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp" && sqlite3 prisma/dev.db "SELECT COUNT(*) AS orphaned_entries FROM SubAccountEntry e WHERE NOT EXISTS (SELECT 1 FROM Transaction t WHERE t.subAccountEntryId = e.id)"`
Expected: `0` (no more orphaned entries)

Run: `cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp" && sqlite3 prisma/dev.db "SELECT a.id, a.name, a.currentBalance, (SELECT COALESCE(SUM(t.amount),0) FROM Transaction t WHERE t.accountId = a.id) AS computed FROM Account a WHERE a.id IN (SELECT DISTINCT sa.accountId FROM SubAccount sa)"`
Expected: `currentBalance` matches `computed` for all accounts with sub-accounts.

- [ ] **Step 5: Verify via dev server**

Run: `npm run dev`
Test: Open an account with sub-accounts. Verify:
- All entries now have transactions visible in the transaction list
- Account balance is correct
- Sub-account balances haven't changed
- Budget view shows correct correctedBalance

- [ ] **Step 6: Commit**

```bash
git add prisma/migrations/20260405_backfill_entry_transactions.sql
git commit -m "chore: migration to backfill transactions for orphaned sub-account entries"
```

---

## Task 14: Push and Create Draft PR

- [ ] **Step 1: Push all changes**

```bash
git push -u origin feature/unified-account-dialog
```

- [ ] **Step 2: Create or update draft PR**

If a draft PR already exists for this branch, update its description. Otherwise create one:

```bash
gh pr create --draft --title "feat: linked sub-account entries and transaction editing" --body "$(cat <<'EOF'
## Summary
- New shared service layer for atomic entry+transaction pair management
- Entry creation in sub-account UI now generates a linked transaction
- Transaction form dialog supports edit mode (prefill + PUT)
- Transaction list: per-row edit button + batch inline edit mode
- correctedBalance filter updated to exclude all sub-account-linked transactions
- Migration script backfills transactions for existing orphaned entries

## Spec
docs/superpowers/specs/2026-04-05-linked-entries-transactions-design.md

## Test plan
- [ ] Create entry in sub-account → verify transaction appears
- [ ] Delete entry → verify transaction removed
- [ ] Create transaction with sub-account category → verify entry appears
- [ ] Delete transaction with entry → verify entry removed
- [ ] Edit transaction via row button → verify entry stays in sync
- [ ] Batch edit mode: change amounts → verify all saved correctly
- [ ] Batch edit: linked rows have read-only account/category
- [ ] Verify account balances after all operations
- [ ] Verify budget correctedBalance unchanged
- [ ] Verify migration: no orphaned entries, balances correct

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Commit**

No commit needed — PR is metadata only.

---

## Follow-Up (Not in this plan)

**CSV-Import:** The spec requires that CSV import with sub-account-linked categories also calls `createEntryFromTransaction()`. The import endpoint (`/api/transactions/import` or similar) needs to be updated separately. Currently, bulk-imported transactions with sub-account-linked categories would not create entries. This should be addressed as a follow-up task after this plan is complete.
