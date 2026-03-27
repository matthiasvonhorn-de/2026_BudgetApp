// Rollover: Überträgt "available" Beträge in den nächsten Monat
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(_: Request, { params }: { params: Promise<{ year: string; month: string }> }) {
  const { year: yearStr, month: monthStr } = await params
  const year = parseInt(yearStr)
  const month = parseInt(monthStr)

  // Nächsten Monat berechnen
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year

  const startOfMonth = new Date(year, month - 1, 1)
  const endOfMonth = new Date(year, month, 0, 23, 59, 59)

  try {
    const categories = await prisma.category.findMany({
      where: { isActive: true, type: 'EXPENSE' },
    })

    const budgetEntries = await prisma.budgetEntry.findMany({
      where: { year, month },
    })
    const budgetMap = new Map(budgetEntries.map(e => [e.categoryId, e]))

    const activities = await prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        date: { gte: startOfMonth, lte: endOfMonth },
        categoryId: { not: null },
      },
      _sum: { amount: true },
    })
    const activityMap = new Map(activities.map(a => [a.categoryId!, a._sum.amount ?? 0]))

    const rollovers = categories.map(cat => {
      const entry = budgetMap.get(cat.id)
      const budgeted = entry?.budgeted ?? 0
      const rolledOver = entry?.rolledOver ?? 0
      const activity = activityMap.get(cat.id) ?? 0
      const available = rolledOver + activity - budgeted
      return { categoryId: cat.id, rolledOver: available, budgeted }
    })

    await prisma.$transaction(
      rollovers.map(r =>
        prisma.budgetEntry.upsert({
          where: { categoryId_month_year: { categoryId: r.categoryId, month: nextMonth, year: nextYear } },
          update: { rolledOver: r.rolledOver, budgeted: r.budgeted },
          create: { categoryId: r.categoryId, month: nextMonth, year: nextYear, rolledOver: r.rolledOver, budgeted: r.budgeted },
        })
      )
    )

    return NextResponse.json({ success: true, nextMonth, nextYear, entries: rollovers.length })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Fehler beim Rollover' }, { status: 500 })
  }
}
