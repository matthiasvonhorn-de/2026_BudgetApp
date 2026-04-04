import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withHandler } from '@/lib/api/handler'
import type { AccountType } from '@prisma/client'

export const GET = withHandler(async (request: Request) => {
  const { searchParams } = new URL(request.url)
  const now = new Date()
  const year = parseInt(searchParams.get('year') ?? String(now.getFullYear()))
  const month = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1))

  const startOfMonth = new Date(year, month - 1, 1)
  const endOfMonth = new Date(year, month, 0, 23, 59, 59)

  const activities = await prisma.transaction.groupBy({
    by: ['categoryId'],
    where: {
      date: { gte: startOfMonth, lte: endOfMonth },
      type: 'EXPENSE',
      categoryId: { not: null },
      account: { isActive: true, type: { notIn: ['SPARPLAN', 'FESTGELD'] as AccountType[] } },
    },
    _sum: { amount: true },
  })

  const categoryIds = activities.map(a => a.categoryId!).filter(Boolean)
  const categories = await prisma.category.findMany({
    where: { id: { in: categoryIds } },
    select: { id: true, name: true, color: true },
  })
  const catMap = new Map(categories.map(c => [c.id, c]))

  const result = activities
    .map(a => ({
      categoryId: a.categoryId!,
      name: catMap.get(a.categoryId!)?.name ?? 'Unbekannt',
      color: catMap.get(a.categoryId!)?.color ?? '#6366f1',
      amount: Math.abs(a._sum.amount ?? 0),
    }))
    .filter(r => r.amount > 0)
    .sort((a, b) => b.amount - a.amount)

  return NextResponse.json(result)
})
