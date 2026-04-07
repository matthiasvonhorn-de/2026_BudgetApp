import { TransactionStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { DomainError } from '@/lib/api/errors'
import { balanceIncrement } from '@/lib/money'

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

interface CreateLinkedEntryInput {
  groupId: string
  categoryId?: string
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

    // Validate category belongs to this group and is not TRANSFER (if provided)
    if (categoryId) {
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
    }

    const accountId = group.subAccount.accountId

    // Sub-only transaction: mainAmount = null, subAmount = entry.amount
    const subAmount = amount
    const subType = subAmount >= 0 ? 'INCOME' : 'EXPENSE'

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

    // Create linked transaction (sub-only)
    const transaction = await tx.transaction.create({
      data: {
        date: new Date(date),
        mainAmount: null,
        mainType: 'INCOME',
        subAmount,
        subType,
        description,
        accountId,
        categoryId: categoryId ?? null,
        status: 'PENDING',
        subAccountEntryId: entry.id,
      },
    })

    // Update account balance: only subAmount contributes (mainAmount is null)
    await tx.account.update({
      where: { id: accountId },
      data: { currentBalance: balanceIncrement(subAmount) },
    })

    return { entry, transaction }
  })
}

// ── Task 2 ─────────────────────────────────────────────────────────────────

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

    const oldSubAmount = existing.transaction.subAmount ?? 0
    const oldMainAmount = existing.transaction.mainAmount ?? 0
    const newEntryAmount = input.amount ?? existing.amount
    const newSubAmount = newEntryAmount
    const newSubType = newSubAmount >= 0 ? 'INCOME' : 'EXPENSE'
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
        subAmount: newSubAmount,
        subType: newSubType,
      },
    })

    // Update account balance if amount changed
    if (input.amount !== undefined && newSubAmount !== oldSubAmount) {
      const balanceDiff = (oldMainAmount + newSubAmount) - (oldMainAmount + oldSubAmount)
      await tx.account.update({
        where: { id: existing.group.subAccount.accountId },
        data: { currentBalance: balanceIncrement(balanceDiff) },
      })
    }

    return { entry, transaction }
  })
}

// ── Task 3 ─────────────────────────────────────────────────────────────────

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

    // Reverse account balance using total effect: -(mainAmount + subAmount)
    if (existing.transaction) {
      const totalEffect = (existing.transaction.mainAmount ?? 0) + (existing.transaction.subAmount ?? 0)
      await tx.account.update({
        where: { id: accountId },
        data: { currentBalance: balanceIncrement(-totalEffect) },
      })
      // Delete transaction first (holds FK to entry)
      await tx.transaction.delete({ where: { id: existing.transaction.id } })
    }

    // Delete entry
    await tx.subAccountEntry.delete({ where: { id: entryId } })
  })
}

// ── Task 4 ─────────────────────────────────────────────────────────────────

interface CreateEntryFromTransactionInput {
  transactionId: string
  transactionMainAmount: number
  date: Date
  description: string
  status: TransactionStatus
  categoryId: string | null
  linkedGroupId: string
  linkType: string
  skipPairedTransfer?: boolean
}

export async function createEntryFromTransaction(tx: TxClient, input: CreateEntryFromTransactionInput) {
  const { transactionId, transactionMainAmount, date, description, status, categoryId, linkedGroupId, linkType, skipPairedTransfer } = input

  // subAmount = -mainAmount (allocation: main gives, sub receives)
  const subAmount = -transactionMainAmount
  const subType = subAmount >= 0 ? 'INCOME' : 'EXPENSE'
  const entryAmount = subAmount

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
    data: {
      subAccountEntryId: entry.id,
      subAmount,
      subType,
    },
  })

  let pairedTransactionId: string | null = null

  if (linkType === 'TRANSFER' && !skipPairedTransfer) {
    const group = await tx.subAccountGroup.findUnique({
      where: { id: linkedGroupId },
      include: { subAccount: true },
    })
    if (group) {
      const targetAccountId = group.subAccount.accountId
      const pairedAmount = -transactionMainAmount

      const paired = await tx.transaction.create({
        data: {
          date,
          mainAmount: pairedAmount,
          mainType: pairedAmount >= 0 ? 'INCOME' : 'EXPENSE',
          description,
          accountId: targetAccountId,
          categoryId,
          status,
        },
      })

      await tx.account.update({
        where: { id: targetAccountId },
        data: { currentBalance: balanceIncrement(pairedAmount) },
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

interface UpdateEntryFromTransactionInput {
  newMainAmount: number
  oldMainAmount: number
  date: Date
  description: string
  newCategoryId: string | null
  existingSubAccountEntryId: string | null
  existingTransferId: string | null
  existingStatus: TransactionStatus
  transactionId: string
}

export async function updateEntryFromTransaction(tx: TxClient, input: UpdateEntryFromTransactionInput) {
  const { newMainAmount, date, description, newCategoryId, existingSubAccountEntryId, existingTransferId, existingStatus, transactionId } = input

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
    // subAmount = -mainAmount, entry.amount = subAmount
    const newSubAmount = -newMainAmount
    const newSubType = newSubAmount >= 0 ? 'INCOME' : 'EXPENSE'
    await tx.subAccountEntry.update({
      where: { id: existingSubAccountEntryId! },
      data: { date, description, amount: newSubAmount, groupId: newSubGroupId },
    })
    await tx.transaction.update({
      where: { id: transactionId },
      data: { subAmount: newSubAmount, subType: newSubType },
    })
  } else if (hadEntry && !newSubGroupId) {
    // Remove sub side
    await tx.transaction.update({ where: { id: transactionId }, data: { subAccountEntryId: null, subAmount: null, subType: null } })
    await tx.subAccountEntry.delete({ where: { id: existingSubAccountEntryId! } })
  } else if (!hadEntry && newSubGroupId) {
    // Add sub side
    const newSubAmount = -newMainAmount
    const newSubType = newSubAmount >= 0 ? 'INCOME' : 'EXPENSE'
    const entry = await tx.subAccountEntry.create({
      data: { date, description, amount: newSubAmount, fromBudget: true, groupId: newSubGroupId },
    })
    await tx.transaction.update({
      where: { id: transactionId },
      data: { subAccountEntryId: entry.id, subAmount: newSubAmount, subType: newSubType },
    })
  }

  // Sync paired TRANSFER transaction
  if (existingTransferId) {
    const paired = await tx.transaction.findUnique({ where: { id: existingTransferId } })
    if (paired) {
      const oldPairedMain = paired.mainAmount ?? 0
      const newPairedMain = -newMainAmount
      if (newPairedMain !== oldPairedMain) {
        await tx.account.update({
          where: { id: paired.accountId },
          data: { currentBalance: balanceIncrement(newPairedMain - oldPairedMain) },
        })
      }
      await tx.transaction.update({
        where: { id: existingTransferId },
        data: {
          date,
          description,
          mainAmount: newPairedMain,
          mainType: newPairedMain >= 0 ? 'INCOME' : 'EXPENSE',
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
      const pairedMain = -newMainAmount
      const paired = await tx.transaction.create({
        data: {
          date,
          mainAmount: pairedMain,
          mainType: pairedMain >= 0 ? 'INCOME' : 'EXPENSE',
          description,
          accountId: targetAccountId,
          categoryId: newCategoryId,
          status: existingStatus,
        },
      })
      await tx.account.update({
        where: { id: targetAccountId },
        data: { currentBalance: balanceIncrement(pairedMain) },
      })
      await tx.transaction.update({ where: { id: transactionId }, data: { transferToId: paired.id } })
    }
  }
}

export async function deleteEntryFromTransaction(tx: TxClient, subAccountEntryId: string | null) {
  if (!subAccountEntryId) return
  // Unlink first (FK constraint), then delete
  await tx.transaction.updateMany({
    where: { subAccountEntryId },
    data: { subAccountEntryId: null, subAmount: null, subType: null },
  })
  await tx.subAccountEntry.delete({ where: { id: subAccountEntryId } })
}
