import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withHandler } from '@/lib/api/handler'

export const GET = withHandler(async (request: Request) => {
  const { searchParams } = new URL(request.url)
  const months = parseInt(searchParams.get('months') ?? '12')

  const now = new Date()
  const results = []

  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    const startOfMonth = new Date(year, month - 1, 1)
    const endOfMonth = new Date(year, month, 0, 23, 59, 59)

    const [incomeRows, expenseRows] = await Promise.all([
      prisma.$queryRaw<[{ total: number | null }]>`
        SELECT SUM(COALESCE(t.mainAmount, 0)) as total
        FROM "Transaction" t
        JOIN Account a ON t.accountId = a.id
        WHERE t.date >= ${startOfMonth}
          AND t.date <= ${endOfMonth}
          AND t.mainType = 'INCOME'
          AND t.mainAmount > 0
          AND a.isActive = 1
          AND a.type NOT IN ('SPARPLAN', 'FESTGELD')
      `,
      prisma.$queryRaw<[{ total: number | null }]>`
        SELECT SUM(COALESCE(t.mainAmount, 0)) as total
        FROM "Transaction" t
        JOIN Account a ON t.accountId = a.id
        WHERE t.date >= ${startOfMonth}
          AND t.date <= ${endOfMonth}
          AND t.mainType = 'EXPENSE'
          AND a.isActive = 1
          AND a.type NOT IN ('SPARPLAN', 'FESTGELD')
      `,
    ])

    results.push({
      year,
      month,
      income: incomeRows[0]?.total ?? 0,
      expenses: Math.abs(expenseRows[0]?.total ?? 0),
    })
  }

  return NextResponse.json(results)
})
