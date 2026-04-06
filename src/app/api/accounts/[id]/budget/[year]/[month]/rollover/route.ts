// Rollover: Überträgt "available" Beträge in den nächsten Monat — nur für dieses Konto
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withHandler } from '@/lib/api/handler'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ParamsCtx = { params: Promise<{ id: string; year: string; month: string }> }

function nextMonthYear(month: number, year: number) {
  return { month: month === 12 ? 1 : month + 1, year: month === 12 ? year + 1 : year }
}

/** Get all rollover-enabled, active categories for an account */
async function getRolloverCategories(accountId: string) {
  const groups = await prisma.categoryGroup.findMany({
    where: { accountId },
    include: {
      categories: { where: { isActive: true, rolloverEnabled: true } },
    },
  })
  return groups.flatMap(g => g.categories)
}

/** Compute available amounts for all rollover-enabled categories of an account in a given month */
async function computeRollovers(accountId: string, year: number, month: number) {
  const categories = await getRolloverCategories(accountId)
  const categoryIds = categories.map(c => c.id)

  if (categoryIds.length === 0) return []

  const budgetEntries = await prisma.budgetEntry.findMany({
    where: { year, month, categoryId: { in: categoryIds } },
  })
  const budgetMap = new Map(budgetEntries.map(e => [e.categoryId, e]))

  const startOfMonth = new Date(year, month - 1, 1)
  const endOfMonth = new Date(year, month, 0, 23, 59, 59)

  // Only mainAmount — consistent with budget API (Hauptkonto-Perspektive)
  const activityRows = await prisma.$queryRaw<Array<{ categoryId: string; total: number }>>`
    SELECT categoryId, SUM(COALESCE(mainAmount, 0)) as total
    FROM "Transaction"
    WHERE accountId = ${accountId}
      AND date >= ${startOfMonth}
      AND date <= ${endOfMonth}
      AND categoryId IS NOT NULL
    GROUP BY categoryId
  `
  const activityMap = new Map(activityRows.map(a => [a.categoryId, a.total]))

  return categories.map(cat => {
    const entry = budgetMap.get(cat.id)
    const budgeted = entry?.budgeted ?? 0
    const rolledOver = entry?.rolledOver ?? 0
    const activity = activityMap.get(cat.id) ?? 0
    const available = rolledOver + activity - budgeted
    return { categoryId: cat.id, available, budgeted }
  })
}

// ---------------------------------------------------------------------------
// GET — Check if next month has existing budget entries
// ---------------------------------------------------------------------------

export const GET = withHandler(async (_, ctx) => {
  const { id, year: yearStr, month: monthStr } = await (ctx as ParamsCtx).params
  const year = parseInt(yearStr)
  const month = parseInt(monthStr)
  const next = nextMonthYear(month, year)

  const categories = await getRolloverCategories(id)
  const categoryIds = categories.map(c => c.id)

  const existingCount = categoryIds.length === 0
    ? 0
    : await prisma.budgetEntry.count({
        where: { year: next.year, month: next.month, categoryId: { in: categoryIds } },
      })

  return NextResponse.json({
    nextMonth: next.month,
    nextYear: next.year,
    hasExistingEntries: existingCount > 0,
    existingCount,
  })
})

// ---------------------------------------------------------------------------
// POST — Rollover with mode support
// ---------------------------------------------------------------------------

export const POST = withHandler(async (req, ctx) => {
  const { id, year: yearStr, month: monthStr } = await (ctx as ParamsCtx).params
  const year = parseInt(yearStr)
  const month = parseInt(monthStr)
  const next = nextMonthYear(month, year)

  const body = await req.json().catch(() => ({}))
  const mode: 'create' | 'update' = body.mode === 'update' ? 'update' : 'create'

  const rollovers = await computeRollovers(id, year, month)

  if (mode === 'create') {
    // Original behavior: upsert with rolledOver + budgeted
    await prisma.$transaction(
      rollovers.map(r =>
        prisma.budgetEntry.upsert({
          where: { categoryId_month_year: { categoryId: r.categoryId, month: next.month, year: next.year } },
          update: { rolledOver: r.available, budgeted: r.budgeted },
          create: { categoryId: r.categoryId, month: next.month, year: next.year, rolledOver: r.available, budgeted: r.budgeted },
        })
      )
    )

    return NextResponse.json({
      success: true,
      nextMonth: next.month,
      nextYear: next.year,
      entries: rollovers.length,
      cascadedMonths: 0,
    })
  }

  // mode === 'update': only update rolledOver, then cascade forward
  let cascadedMonths = 0
  let currentRollovers = rollovers
  let targetMonth = next.month
  let targetYear = next.year

  while (currentRollovers.length > 0) {
    const categoryIds = currentRollovers.map(r => r.categoryId)

    // Check which categories have entries in the target month
    const existingEntries = await prisma.budgetEntry.findMany({
      where: { year: targetYear, month: targetMonth, categoryId: { in: categoryIds } },
    })
    const existingSet = new Set(existingEntries.map(e => e.categoryId))

    // Only update categories that already have entries (on first iteration, update all)
    const toUpdate = cascadedMonths === 0
      ? currentRollovers
      : currentRollovers.filter(r => existingSet.has(r.categoryId))

    if (toUpdate.length === 0) break

    // Update rolledOver only (first iteration upserts to ensure entries exist)
    if (cascadedMonths === 0) {
      await prisma.$transaction(
        toUpdate.map(r =>
          prisma.budgetEntry.upsert({
            where: { categoryId_month_year: { categoryId: r.categoryId, month: targetMonth, year: targetYear } },
            update: { rolledOver: r.available },
            create: { categoryId: r.categoryId, month: targetMonth, year: targetYear, rolledOver: r.available, budgeted: 0 },
          })
        )
      )
    } else {
      await prisma.$transaction(
        toUpdate.map(r =>
          prisma.budgetEntry.update({
            where: { categoryId_month_year: { categoryId: r.categoryId, month: targetMonth, year: targetYear } },
            data: { rolledOver: r.available },
          })
        )
      )
    }

    cascadedMonths++

    // Recompute available for the target month to cascade further
    const nextTarget = nextMonthYear(targetMonth, targetYear)

    // Check if the next month has any entries at all
    const nextExistingCount = await prisma.budgetEntry.count({
      where: { year: nextTarget.year, month: nextTarget.month, categoryId: { in: categoryIds } },
    })

    if (nextExistingCount === 0) break

    // Recompute rollovers for current target month (which we just updated)
    currentRollovers = await computeRollovers(id, targetYear, targetMonth)
    targetMonth = nextTarget.month
    targetYear = nextTarget.year
  }

  return NextResponse.json({
    success: true,
    nextMonth: next.month,
    nextYear: next.year,
    entries: rollovers.length,
    cascadedMonths,
  })
})
