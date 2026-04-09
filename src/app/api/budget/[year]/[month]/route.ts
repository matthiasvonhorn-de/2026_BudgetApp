// src/app/api/budget/[year]/[month]/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'

export const GET = withHandler(async (_, ctx) => {
  const { year: yearStr, month: monthStr } = await (ctx as { params: Promise<{ year: string; month: string }> }).params
  const year = parseInt(yearStr)
  const month = parseInt(monthStr)

  const startOfMonth = new Date(year, month - 1, 1)
  const endOfMonth = new Date(year, month, 0, 23, 59, 59)

  // Alle Kategoriegruppen mit Kategorien laden
  const groups = await prisma.categoryGroup.findMany({
    include: {
      categories: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: { sortOrder: 'asc' },
  })

  // Alle Budget-Einträge für diesen Monat
  const budgetEntries = await prisma.budgetEntry.findMany({
    where: { year, month },
  })
  const budgetMap = new Map(budgetEntries.map(e => [e.categoryId, e]))

  // Alle Transaktionen dieses Monats aggregiert nach Kategorie
  // Transfers und dual-sided TX (main+sub gefüllt) ausschließen
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

  // Gesamteinnahmen dieses Monats (für readyToAssign): nur von Konten mit Budgetplanung
  const incomeRows = await prisma.$queryRaw<[{ total: number | null }]>`
    SELECT SUM(COALESCE(t.mainAmount, 0)) as total
    FROM "Transaction" t
    JOIN Account a ON t.accountId = a.id
    WHERE t.date >= ${startOfMonth}
      AND t.date <= ${endOfMonth}
      AND t.mainAmount > 0
      AND t.mainType = 'INCOME'
      AND a.isActive = 1
      AND a.type NOT IN ('SPARPLAN', 'FESTGELD')
      AND EXISTS (
        SELECT 1 FROM BudgetEntry be
        JOIN Category c ON be.categoryId = c.id
        JOIN CategoryGroup cg ON c.groupId = cg.id
        WHERE cg.accountId = a.id
          AND be.month = ${month}
          AND be.year = ${year}
      )
  `
  const totalIncome = incomeRows[0]?.total ?? 0

  // Daten zusammenführen
  let totalBudgeted = 0
  let totalActivity = 0
  let totalAvailable = 0

  const groupsWithData = groups.map(group => ({
    ...group,
    categories: group.categories.map(cat => {
      const entry = budgetMap.get(cat.id)
      const budgeted = entry?.budgeted ?? 0
      const rolledOver = entry?.rolledOver ?? 0
      const activity = activityMap.get(cat.id) ?? 0
      const available = rolledOver + activity - budgeted

      if (cat.type === 'EXPENSE') {
        totalBudgeted += budgeted
        totalActivity += activity
        totalAvailable += available
      }

      return {
        ...cat,
        budgeted,
        rolledOver,
        activity,
        available,
      }
    }),
  }))

  const readyToAssign = totalIncome + totalBudgeted

  return NextResponse.json({
    year,
    month,
    groups: groupsWithData,
    summary: { totalBudgeted, totalActivity, totalAvailable, readyToAssign, totalIncome },
  })
})

export const PUT = withHandler(async (request: Request, ctx) => {
  const { year: yearStr, month: monthStr } = await (ctx as { params: Promise<{ year: string; month: string }> }).params
  const year = parseInt(yearStr)
  const month = parseInt(monthStr)

  const body = await request.json()
  // body: Array von { categoryId, budgeted }
  const entries = z.array(z.object({
    categoryId: z.string(),
    budgeted: z.number(),
  })).parse(body)

  await prisma.$transaction(
    entries.map(e =>
      prisma.budgetEntry.upsert({
        where: { categoryId_month_year: { categoryId: e.categoryId, month, year } },
        update: { budgeted: e.budgeted },
        create: { categoryId: e.categoryId, month, year, budgeted: e.budgeted },
      })
    )
  )

  return NextResponse.json({ success: true })
})
