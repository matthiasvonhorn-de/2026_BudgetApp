import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { POST } from '@/app/api/budget/[year]/[month]/rollover/route'
import { seedDatabase, SEED } from './seed'
import { createRequest, createParams } from './helpers'
import { prisma } from '@/lib/prisma'

beforeAll(async () => {
  await seedDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

afterEach(async () => {
  await prisma.budgetEntry.deleteMany()
  await prisma.transaction.deleteMany()
})

const rolloverParams = (year: number, month: number) =>
  createParams({ year: String(year), month: String(month) })

describe('POST /api/budget/[year]/[month]/rollover', () => {
  it('creates rollover entries for next month with correct amounts', async () => {
    // Setup: budget entry for Miete in April 2026, budgeted = 800
    await prisma.budgetEntry.create({
      data: { categoryId: SEED.categories.miete, month: 4, year: 2026, budgeted: 800 },
    })

    // Create a transaction for Miete in April: mainAmount = -500 (expense)
    await prisma.transaction.create({
      data: {
        date: new Date('2026-04-15'),
        mainAmount: -500,
        mainType: 'EXPENSE',
        description: 'Miete April',
        accountId: SEED.accounts.girokonto,
        categoryId: SEED.categories.miete,
        status: 'CLEARED',
      },
    })

    const res = await POST(
      createRequest('POST', '/api/budget/2026/4/rollover'),
      rolloverParams(2026, 4),
    )
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)

    // Check May entry for Miete: available = rolledOver(0) + activity(-500) - budgeted(800) = -1300
    const mayEntry = await prisma.budgetEntry.findUnique({
      where: { categoryId_month_year: { categoryId: SEED.categories.miete, month: 5, year: 2026 } },
    })
    expect(mayEntry).toBeDefined()
    expect(mayEntry!.rolledOver).toBe(-1300)
    expect(mayEntry!.budgeted).toBe(800)
  })

  it('returns success response with nextMonth and nextYear', async () => {
    const res = await POST(
      createRequest('POST', '/api/budget/2026/4/rollover'),
      rolloverParams(2026, 4),
    )
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.nextMonth).toBe(5)
    expect(data.nextYear).toBe(2026)
    expect(typeof data.entries).toBe('number')
  })

  it('handles December to January year rollover', async () => {
    const res = await POST(
      createRequest('POST', '/api/budget/2026/12/rollover'),
      rolloverParams(2026, 12),
    )
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.nextMonth).toBe(1)
    expect(data.nextYear).toBe(2027)
  })

  it('works with no budget data and returns entries count matching active categories', async () => {
    // No budget entries or transactions — rollover should still succeed
    const res = await POST(
      createRequest('POST', '/api/budget/2026/4/rollover'),
      rolloverParams(2026, 4),
    )
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)

    // entries count should match the number of active EXPENSE categories
    const expenseCategories = await prisma.category.findMany({
      where: { isActive: true, type: 'EXPENSE' },
    })
    expect(data.entries).toBe(expenseCategories.length)
  })
})
