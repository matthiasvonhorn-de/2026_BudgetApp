import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withHandler } from '@/lib/api/handler'

export const GET = withHandler(async (request: Request) => {
  const { searchParams } = new URL(request.url)
  const now = new Date()
  const year = parseInt(searchParams.get('year') ?? String(now.getFullYear()))
  const month = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1))
  const accountId = searchParams.get('accountId')

  const startOfMonth = new Date(year, month - 1, 1)
  const endOfMonth = new Date(year, month, 0, 23, 59, 59)

  type Row = { groupId: string; groupName: string; color: string; total: number }
  const toResult = (rows: Row[]) => rows
    .map(r => ({ groupId: r.groupId, name: r.groupName, color: r.color ?? '#6366f1', amount: Math.abs(r.total) }))
    .filter(r => r.amount > 0)
    .sort((a, b) => b.amount - a.amount)

  const [expenseRows, incomeRows] = accountId
    ? await Promise.all([
        prisma.$queryRaw<Row[]>`
          SELECT g.id as groupId, g.name as groupName, MIN(c.color) as color,
                 SUM(COALESCE(t.mainAmount, t.subAmount, 0)) as total
          FROM "Transaction" t
          JOIN Account a ON t.accountId = a.id
          JOIN Category c ON t.categoryId = c.id
          JOIN CategoryGroup g ON c.groupId = g.id
          WHERE t.date >= ${startOfMonth} AND t.date <= ${endOfMonth}
            AND g.accountId = ${accountId}
            AND t.mainType != 'TRANSFER'
            AND NOT (t.mainAmount IS NOT NULL AND t.subAmount IS NOT NULL)
            AND COALESCE(t.mainAmount, t.subAmount, 0) < 0
            AND t.categoryId IS NOT NULL
            AND a.isActive = 1
            AND a.type NOT IN ('SPARPLAN', 'FESTGELD')
          GROUP BY g.id, g.name
        `,
        prisma.$queryRaw<Row[]>`
          SELECT g.id as groupId, g.name as groupName, MIN(c.color) as color,
                 SUM(COALESCE(t.mainAmount, t.subAmount, 0)) as total
          FROM "Transaction" t
          JOIN Account a ON t.accountId = a.id
          JOIN Category c ON t.categoryId = c.id
          JOIN CategoryGroup g ON c.groupId = g.id
          WHERE t.date >= ${startOfMonth} AND t.date <= ${endOfMonth}
            AND g.accountId = ${accountId}
            AND t.mainType != 'TRANSFER'
            AND NOT (t.mainAmount IS NOT NULL AND t.subAmount IS NOT NULL)
            AND COALESCE(t.mainAmount, t.subAmount, 0) > 0
            AND t.categoryId IS NOT NULL
            AND a.isActive = 1
            AND a.type NOT IN ('SPARPLAN', 'FESTGELD')
          GROUP BY g.id, g.name
        `,
      ])
    : await Promise.all([
        prisma.$queryRaw<Row[]>`
          SELECT g.id as groupId, g.name as groupName, MIN(c.color) as color,
                 SUM(COALESCE(t.mainAmount, t.subAmount, 0)) as total
          FROM "Transaction" t
          JOIN Account a ON t.accountId = a.id
          JOIN Category c ON t.categoryId = c.id
          JOIN CategoryGroup g ON c.groupId = g.id
          WHERE t.date >= ${startOfMonth} AND t.date <= ${endOfMonth}
            AND t.mainType != 'TRANSFER'
            AND NOT (t.mainAmount IS NOT NULL AND t.subAmount IS NOT NULL)
            AND COALESCE(t.mainAmount, t.subAmount, 0) < 0
            AND t.categoryId IS NOT NULL
            AND a.isActive = 1
            AND a.type NOT IN ('SPARPLAN', 'FESTGELD')
          GROUP BY g.id, g.name
        `,
        prisma.$queryRaw<Row[]>`
          SELECT g.id as groupId, g.name as groupName, MIN(c.color) as color,
                 SUM(COALESCE(t.mainAmount, t.subAmount, 0)) as total
          FROM "Transaction" t
          JOIN Account a ON t.accountId = a.id
          JOIN Category c ON t.categoryId = c.id
          JOIN CategoryGroup g ON c.groupId = g.id
          WHERE t.date >= ${startOfMonth} AND t.date <= ${endOfMonth}
            AND t.mainType != 'TRANSFER'
            AND NOT (t.mainAmount IS NOT NULL AND t.subAmount IS NOT NULL)
            AND COALESCE(t.mainAmount, t.subAmount, 0) > 0
            AND t.categoryId IS NOT NULL
            AND a.isActive = 1
            AND a.type NOT IN ('SPARPLAN', 'FESTGELD')
          GROUP BY g.id, g.name
        `,
      ])

  return NextResponse.json({
    expenses: toResult(expenseRows),
    income: toResult(incomeRows),
  })
})
