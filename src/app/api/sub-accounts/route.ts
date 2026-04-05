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

  // categorizedAccountsBalance: SUM(mainAmount) across accounts with sub-accounts
  const accountIds = [...new Set(subAccounts.map(sa => sa.accountId))]
  let categorizedAccountsBalance = 0
  if (accountIds.length > 0) {
    const placeholders = accountIds.map(() => '?').join(',')
    const rows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
      `SELECT SUM(COALESCE(mainAmount, 0)) as total FROM "Transaction" WHERE accountId IN (${placeholders})`,
      ...accountIds,
    )
    categorizedAccountsBalance = rows[0]?.total ?? 0
  }

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
