// Rollover: Überträgt "available" Beträge in den nächsten Monat
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withHandler } from '@/lib/api/handler'

export const POST = withHandler(async (_, ctx) => {
  const { year: yearStr, month: monthStr } = await (ctx as { params: Promise<{ year: string; month: string }> }).params
  const year = parseInt(yearStr)
  const month = parseInt(monthStr)

  // Nächsten Monat berechnen
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year

  const startOfMonth = new Date(year, month - 1, 1)
  const endOfMonth = new Date(year, month, 0, 23, 59, 59)

  const categories = await prisma.category.findMany({
    where: { isActive: true, type: 'EXPENSE' },
  })

  const budgetEntries = await prisma.budgetEntry.findMany({
    where: { year, month },
  })
  const budgetMap = new Map(budgetEntries.map(e => [e.categoryId, e]))

  const activityRows = await prisma.$queryRaw<Array<{ categoryId: string; total: number }>>`
    SELECT t.categoryId, SUM(COALESCE(t.mainAmount, 0)) as total
    FROM "Transaction" t
    JOIN Account a ON t.accountId = a.id
    WHERE t.date >= ${startOfMonth}
      AND t.date <= ${endOfMonth}
      AND t.categoryId IS NOT NULL
      AND a.isActive = 1
      AND a.type NOT IN ('SPARPLAN', 'FESTGELD')
    GROUP BY t.categoryId
  `
  const activityMap = new Map(activityRows.map(a => [a.categoryId, a.total]))

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
