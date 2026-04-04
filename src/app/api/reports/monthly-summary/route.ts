import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withHandler } from '@/lib/api/handler'
import type { AccountType } from '@prisma/client'

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

    const accountFilter = { isActive: true, type: { notIn: ['SPARPLAN', 'FESTGELD'] as AccountType[] } }
    const [incomeResult, expenseResult] = await Promise.all([
      prisma.transaction.aggregate({
        where: { date: { gte: startOfMonth, lte: endOfMonth }, type: 'INCOME', account: accountFilter },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { date: { gte: startOfMonth, lte: endOfMonth }, type: 'EXPENSE', account: accountFilter },
        _sum: { amount: true },
      }),
    ])

    results.push({
      year,
      month,
      income: incomeResult._sum.amount ?? 0,
      expenses: Math.abs(expenseResult._sum.amount ?? 0),
    })
  }

  return NextResponse.json(results)
})
