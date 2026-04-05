import { TransactionStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { DomainError } from '@/lib/api/errors'

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

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
      data: { currentBalance: { increment: transaction.amount } },
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

// ── Task 4 ─────────────────────────────────────────────────────────────────

interface CreateEntryFromTransactionInput {
  transactionId: string
  transactionAmount: number
  date: Date
  description: string
  status: TransactionStatus
  categoryId: string | null
  linkedGroupId: string
  linkType: string
  skipPairedTransfer?: boolean
}

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

interface UpdateEntryFromTransactionInput {
  newAmount: number
  oldAmount: number
  date: Date
  description: string
  newCategoryId: string | null
  existingSubAccountEntryId: string | null
  existingTransferId: string | null
  existingStatus: TransactionStatus
  transactionId: string
}

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

export async function deleteEntryFromTransaction(tx: TxClient, subAccountEntryId: string | null) {
  if (!subAccountEntryId) return
  // Unlink first (FK constraint), then delete
  await tx.transaction.updateMany({
    where: { subAccountEntryId },
    data: { subAccountEntryId: null },
  })
  await tx.subAccountEntry.delete({ where: { id: subAccountEntryId } })
}
