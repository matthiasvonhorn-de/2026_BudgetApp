import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { GET, PUT } from '@/app/api/budget/[year]/[month]/route'
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

const budgetParams = (year: number, month: number) =>
  createParams({ year: String(year), month: String(month) })

describe('GET /api/budget/[year]/[month]', () => {
  it('returns budget structure with groups and summary', async () => {
    const res = await GET(
      createRequest('GET', '/api/budget/2026/4'),
      budgetParams(2026, 4),
    )
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.year).toBe(2026)
    expect(data.month).toBe(4)
    expect(data.groups).toBeDefined()
    expect(Array.isArray(data.groups)).toBe(true)
    expect(data.summary).toBeDefined()
    expect(data.summary).toHaveProperty('totalBudgeted')
    expect(data.summary).toHaveProperty('totalActivity')
    expect(data.summary).toHaveProperty('totalAvailable')
    expect(data.summary).toHaveProperty('readyToAssign')
    expect(data.summary).toHaveProperty('totalIncome')
  })

  it('includes categories with budget data', async () => {
    // Assign a budget
    await prisma.budgetEntry.create({
      data: { categoryId: SEED.categories.miete, month: 4, year: 2026, budgeted: 800 },
    })
    const res = await GET(
      createRequest('GET', '/api/budget/2026/4'),
      budgetParams(2026, 4),
    )
    const data = await res.json()
    const allCats = data.groups.flatMap((g: { categories: unknown[] }) => g.categories)
    const miete = allCats.find((c: { id: string }) => c.id === SEED.categories.miete)
    expect(miete).toBeDefined()
    expect(miete.budgeted).toBe(800)
  })

  it('calculates activity from transactions', async () => {
    await prisma.transaction.create({
      data: {
        date: new Date('2026-04-15'),
        mainAmount: -120,
        mainType: 'EXPENSE',
        description: 'Einkauf',
        accountId: SEED.accounts.girokonto,
        categoryId: SEED.categories.lebensmittel,
        status: 'CLEARED',
      },
    })
    const res = await GET(
      createRequest('GET', '/api/budget/2026/4'),
      budgetParams(2026, 4),
    )
    const data = await res.json()
    const allCats = data.groups.flatMap((g: { categories: unknown[] }) => g.categories)
    const lebensmittel = allCats.find((c: { id: string }) => c.id === SEED.categories.lebensmittel)
    expect(lebensmittel.activity).toBe(-120)
  })

  it('calculates totalIncome from INCOME transactions', async () => {
    await prisma.transaction.create({
      data: {
        date: new Date('2026-04-01'),
        mainAmount: 3000,
        mainType: 'INCOME',
        description: 'Gehalt',
        accountId: SEED.accounts.girokonto,
        categoryId: SEED.categories.gehalt,
        status: 'CLEARED',
      },
    })
    const res = await GET(
      createRequest('GET', '/api/budget/2026/4'),
      budgetParams(2026, 4),
    )
    const data = await res.json()
    expect(data.summary.totalIncome).toBe(3000)
  })

  it('returns zero summary for month without data', async () => {
    const res = await GET(
      createRequest('GET', '/api/budget/2025/1'),
      budgetParams(2025, 1),
    )
    const data = await res.json()
    expect(data.summary.totalBudgeted).toBe(0)
    expect(data.summary.totalActivity).toBe(0)
    expect(data.summary.totalIncome).toBe(0)
  })
})

describe('PUT /api/budget/[year]/[month]', () => {
  it('upserts budget entries', async () => {
    const res = await PUT(
      createRequest('PUT', '/api/budget/2026/4', [
        { categoryId: SEED.categories.miete, budgeted: 800 },
        { categoryId: SEED.categories.lebensmittel, budgeted: 400 },
      ]),
      budgetParams(2026, 4),
    )
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)

    const entries = await prisma.budgetEntry.findMany({ where: { year: 2026, month: 4 } })
    expect(entries).toHaveLength(2)
    const miete = entries.find(e => e.categoryId === SEED.categories.miete)
    expect(miete!.budgeted).toBe(800)
  })

  it('updates existing entries on repeated PUT', async () => {
    // First PUT
    await PUT(
      createRequest('PUT', '/api/budget/2026/4', [
        { categoryId: SEED.categories.miete, budgeted: 800 },
      ]),
      budgetParams(2026, 4),
    )
    // Second PUT with new value
    await PUT(
      createRequest('PUT', '/api/budget/2026/4', [
        { categoryId: SEED.categories.miete, budgeted: 900 },
      ]),
      budgetParams(2026, 4),
    )
    const entry = await prisma.budgetEntry.findUnique({
      where: { categoryId_month_year: { categoryId: SEED.categories.miete, month: 4, year: 2026 } },
    })
    expect(entry!.budgeted).toBe(900)
  })

  it('rejects invalid body', async () => {
    const res = await PUT(
      createRequest('PUT', '/api/budget/2026/4', { invalid: true }),
      budgetParams(2026, 4),
    )
    expect(res.status).toBe(400)
  })
})
