// src/app/api/budget/[year]/[month]/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

export async function GET(_: Request, { params }: { params: Promise<{ year: string; month: string }> }) {
  const { year: yearStr, month: monthStr } = await params
  const year = parseInt(yearStr)
  const month = parseInt(monthStr)

  const startOfMonth = new Date(year, month - 1, 1)
  const endOfMonth = new Date(year, month, 0, 23, 59, 59)

  try {
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

    const accountFilter = { isActive: true, type: { notIn: ['SPARPLAN', 'FESTGELD'] as const } }

    // Alle Transaktionen dieses Monats aggregiert nach Kategorie
    const activities = await prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        date: { gte: startOfMonth, lte: endOfMonth },
        categoryId: { not: null },
        account: accountFilter,
      },
      _sum: { amount: true },
    })
    const activityMap = new Map(activities.map(a => [a.categoryId!, a._sum.amount ?? 0]))

    // Gesamteinnahmen dieses Monats (für readyToAssign)
    const incomeResult = await prisma.transaction.aggregate({
      where: {
        date: { gte: startOfMonth, lte: endOfMonth },
        amount: { gt: 0 },
        type: 'INCOME',
        account: accountFilter,
      },
      _sum: { amount: true },
    })
    const totalIncome = incomeResult._sum.amount ?? 0

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
        // available = what's left in the envelope after planning and spending.
        // Sign convention: expenses are stored as negative (e.g. budgeted = -600),
        // activity is also negative for expenses (e.g. -400 spent).
        // Remaining budget = |budgeted| - |activity|
        //   = activity - budgeted  (because both are negative, subtracting gives the right sign)
        // With rollover: available = rolledOver + activity - budgeted
        // Example: rolledOver=0, budgeted=-600, activity=-400 → available = 0 + (-400) - (-600) = 200 ✓
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

    // totalBudgeted is negative (sum of expense budgets, e.g. -600).
    // readyToAssign = income not yet allocated to expense categories.
    // = totalIncome + totalBudgeted  (e.g. 1000 + (-600) = 400 remaining to assign)
    const readyToAssign = totalIncome + totalBudgeted

    return NextResponse.json({
      year,
      month,
      groups: groupsWithData,
      summary: { totalBudgeted, totalActivity, totalAvailable, readyToAssign, totalIncome },
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Fehler beim Laden' }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ year: string; month: string }> }) {
  const { year: yearStr, month: monthStr } = await params
  const year = parseInt(yearStr)
  const month = parseInt(monthStr)

  try {
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
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Fehler beim Speichern' }, { status: 500 })
  }
}
