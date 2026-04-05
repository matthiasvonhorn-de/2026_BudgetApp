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
      data: { currentBalance: { increment: transactionAmount } },
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
