// Rollover: Überträgt "available" Beträge in den nächsten Monat — nur für dieses Konto
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withHandler } from '@/lib/api/handler'

export const POST = withHandler(async (_, ctx) => {
  const { id, year: yearStr, month: monthStr } = await (ctx as { params: Promise<{ id: string; year: string; month: string }> }).params
  const year = parseInt(yearStr)
  const month = parseInt(monthStr)

  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year

  const startOfMonth = new Date(year, month - 1, 1)
  const endOfMonth = new Date(year, month, 0, 23, 59, 59)

  // Nur Kategorien dieses Kontos (via Gruppe)
  const groups = await prisma.categoryGroup.findMany({
    where: { accountId: id },
    include: {
      categories: { where: { isActive: true, rolloverEnabled: true } },
    },
  })
  const categories = groups.flatMap(g => g.categories)

  const categoryIds = categories.map(c => c.id)
  const budgetEntries = await prisma.budgetEntry.findMany({
    where: { year, month, categoryId: { in: categoryIds } },
  })
  const budgetMap = new Map(budgetEntries.map(e => [e.categoryId, e]))

  const activities = await prisma.transaction.groupBy({
    by: ['categoryId'],
    where: {
      accountId: id,
      date: { gte: startOfMonth, lte: endOfMonth },
      categoryId: { in: categoryIds },
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
})
