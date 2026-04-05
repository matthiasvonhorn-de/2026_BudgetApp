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
