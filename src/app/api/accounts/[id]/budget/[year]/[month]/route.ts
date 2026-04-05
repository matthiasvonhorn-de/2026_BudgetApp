import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withHandler } from '@/lib/api/handler'
import { DomainError } from '@/lib/api/errors'
import { Prisma } from '@prisma/client'

export const GET = withHandler(async (_, ctx) => {
  const { id, year: yearStr, month: monthStr } = await (ctx as { params: Promise<{ id: string; year: string; month: string }> }).params
  const year = parseInt(yearStr)
  const month = parseInt(monthStr)

  const startOfMonth = new Date(year, month - 1, 1)
  const endOfMonth = new Date(year, month, 0, 23, 59, 59)

  const account = await prisma.account.findUnique({ where: { id } })
  if (!account) throw new DomainError('Not found', 404)

  // Saldoübertrag aus Vormonat: SUM(mainAmount + subAmount) for TX before month
  const openingRows = await prisma.$queryRaw<[{ total: number | null }]>`
    SELECT SUM(COALESCE(mainAmount, 0) + COALESCE(subAmount, 0)) as total
    FROM "Transaction"
    WHERE accountId = ${id}
      AND date < ${startOfMonth}
      AND categoryId IS NOT NULL
  `
  const openingBalance = openingRows[0]?.total ?? 0

  // Nur Gruppen dieses Kontos laden
  const allGroups = await prisma.categoryGroup.findMany({
    where: { accountId: id },
    include: {
      categories: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: { sortOrder: 'asc' },
  })

  // Budget-Einträge für diesen Monat
  const budgetEntries = await prisma.budgetEntry.findMany({ where: { year, month } })
  const budgetMap = new Map(budgetEntries.map(e => [e.categoryId, e]))

  // Ist-Werte pro Kategorie: SUM(mainAmount + subAmount) grouped by categoryId
  const activityRows = await prisma.$queryRaw<Array<{ categoryId: string; total: number }>>`
    SELECT categoryId, SUM(COALESCE(mainAmount, 0) + COALESCE(subAmount, 0)) as total
    FROM "Transaction"
    WHERE accountId = ${id}
      AND date >= ${startOfMonth}
      AND date <= ${endOfMonth}
      AND categoryId IS NOT NULL
    GROUP BY categoryId
  `
  const activityMap = new Map(activityRows.map(a => [a.categoryId, a.total]))

  // Daten zusammenführen
  const groups = allGroups
    .filter(g => g.categories.length > 0)
    .map(group => ({
      id: group.id,
      name: group.name,
      categories: group.categories.map(cat => {
        const entry = budgetMap.get(cat.id)
        const budgeted = entry?.budgeted ?? 0
        const rolledOver = entry?.rolledOver ?? 0
        const activity = activityMap.get(cat.id) ?? 0
        const available = rolledOver + activity - budgeted
        return {
          id: cat.id,
          name: cat.name,
          color: cat.color,
          type: cat.type,
          budgeted,
          rolledOver,
          activity,
          available,
          subAccountGroupId: cat.subAccountGroupId,
          subAccountLinkType: cat.subAccountLinkType,
        }
      }),
    }))

  const allCats = groups.flatMap(g => g.categories)
  const totalBudgeted = allCats.reduce((s, c) => s + c.budgeted, 0)
  const totalActivity = allCats.reduce((s, c) => s + c.activity, 0)

  // Geplanter Saldoübertrag: Summe aller Budget-Einträge der Vormonate (Plan-Spalte)
  const categoryIds = allGroups.flatMap(g => g.categories.map(c => c.id))
  const openingPlanResult = await prisma.budgetEntry.aggregate({
    where: {
      categoryId: { in: categoryIds },
      OR: [
        { year: { lt: year } },
        { year: year, month: { lt: month } },
      ],
    },
    _sum: { budgeted: true },
  })
  const openingBalancePlan = openingPlanResult._sum.budgeted ?? 0

  // Sub-Accounts-Saldo: SUM(subAmount) from transactions up to end of month
  const subBalanceRows = await prisma.$queryRaw<[{ total: number | null }]>`
    SELECT SUM(COALESCE(subAmount, 0)) as total
    FROM "Transaction"
    WHERE accountId = ${id}
      AND date <= ${endOfMonth}
      AND subAmount IS NOT NULL
  `
  const subAccountsBalance = subBalanceRows[0]?.total ?? 0

  return NextResponse.json({
    account,
    year,
    month,
    openingBalance,
    openingBalancePlan,
    subAccountsBalance,
    groups,
    summary: {
      totalBudgeted,
      totalActivity,
      closingBalancePlan: openingBalancePlan + totalBudgeted,
      closingBalanceActual: openingBalance + totalActivity,
    },
  })
})
