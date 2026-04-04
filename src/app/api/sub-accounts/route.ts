import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withHandler } from '@/lib/api/handler'

export const GET = withHandler(async () => {
  const subAccounts = await prisma.subAccount.findMany({
    orderBy: [{ account: { name: 'asc' } }, { sortOrder: 'asc' }],
    include: {
      account: { select: { id: true, name: true } },
      groups: {
        include: {
          entries: { select: { amount: true } },
        },
      },
    },
  })

  // Accounts that have at least one transaction with a category
  const accountsWithCategorizedTx = await prisma.account.findMany({
    where: {
      transactions: {
        some: { categoryId: { not: null } },
      },
    },
    select: { id: true, currentBalance: true },
  })

  // Subtract internal allocations — TRANSFER and sub-account-linked EXPENSE
  // transactions don't change the physical balance
  const internalSums = await prisma.transaction.groupBy({
    by: ['accountId'],
    where: {
      accountId: { in: accountsWithCategorizedTx.map(a => a.id) },
      OR: [
        { type: 'TRANSFER' },
        { type: 'EXPENSE', subAccountEntryId: { not: null } },
      ],
    },
    _sum: { amount: true },
  })
  const transferMap = new Map(internalSums.map(t => [t.accountId, t._sum.amount ?? 0]))

  const categorizedAccountsBalance = accountsWithCategorizedTx.reduce(
    (s, a) => s + a.currentBalance - (transferMap.get(a.id) ?? 0),
    0,
  )

  const result = subAccounts.map(sa => {
    const balance = sa.groups.reduce(
      (sum, g) => sum + g.entries.reduce((s, e) => s + e.amount, 0),
      0,
    )
    return {
      id: sa.id,
      name: sa.name,
      color: sa.color,
      accountId: sa.accountId,
      accountName: sa.account.name,
      balance,
    }
  })

  return NextResponse.json({ subAccounts: result, categorizedAccountsBalance })
})
