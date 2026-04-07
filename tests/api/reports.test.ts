import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { GET as GET_MONTHLY } from '@/app/api/reports/monthly-summary/route'
import { GET as GET_CATEGORY } from '@/app/api/reports/category-spending/route'
import { seedDatabase, SEED } from './seed'
import { createRequest } from './helpers'
import { prisma } from '@/lib/prisma'

beforeAll(async () => {
  await seedDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

afterEach(async () => {
  await prisma.transaction.deleteMany()
})

describe('GET /api/reports/monthly-summary', () => {
  it('returns monthly data with income and expenses', async () => {
    // Add an expense in current month
    await prisma.transaction.create({
      data: {
        date: new Date(),
        mainAmount: -500,
        mainType: 'EXPENSE',
        description: 'Miete',
        accountId: SEED.accounts.girokonto,
        categoryId: SEED.categories.miete,
        status: 'CLEARED',
      },
    })
    // Add income in current month
    await prisma.transaction.create({
      data: {
        date: new Date(),
        mainAmount: 3000,
        mainType: 'INCOME',
        description: 'Gehalt',
        accountId: SEED.accounts.girokonto,
        categoryId: SEED.categories.gehalt,
        status: 'CLEARED',
      },
    })

    const res = await GET_MONTHLY(createRequest('GET', '/api/reports/monthly-summary?months=1'))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBe(1)
    expect(data[0].income).toBe(3000)
    expect(data[0].expenses).toBe(500) // absolute value
  })

  it('returns multiple months', async () => {
    const res = await GET_MONTHLY(createRequest('GET', '/api/reports/monthly-summary?months=6'))
    const data = await res.json()
    expect(data.length).toBe(6)
    // Each entry has year, month, income, expenses
    for (const entry of data) {
      expect(entry).toHaveProperty('year')
      expect(entry).toHaveProperty('month')
      expect(entry).toHaveProperty('income')
      expect(entry).toHaveProperty('expenses')
    }
  })

  it('defaults to 12 months', async () => {
    const res = await GET_MONTHLY(createRequest('GET', '/api/reports/monthly-summary'))
    const data = await res.json()
    expect(data.length).toBe(12)
  })

  it('excludes TRANSFER transactions', async () => {
    await prisma.transaction.create({
      data: {
        date: new Date(),
        mainAmount: 1000,
        mainType: 'TRANSFER',
        description: 'Transfer',
        accountId: SEED.accounts.girokonto,
        status: 'CLEARED',
      },
    })
    const res = await GET_MONTHLY(createRequest('GET', '/api/reports/monthly-summary?months=1'))
    const data = await res.json()
    expect(data[0].income).toBe(0) // transfer not counted as income
  })
})

describe('GET /api/reports/category-spending', () => {
  it('returns expense and income grouped by category group', async () => {
    await prisma.transaction.create({
      data: {
        date: new Date(),
        mainAmount: -200,
        mainType: 'EXPENSE',
        description: 'Einkauf',
        accountId: SEED.accounts.girokonto,
        categoryId: SEED.categories.lebensmittel,
        status: 'CLEARED',
      },
    })

    const now = new Date()
    const res = await GET_CATEGORY(
      createRequest('GET', `/api/reports/category-spending?year=${now.getFullYear()}&month=${now.getMonth() + 1}`),
    )
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.expenses).toBeDefined()
    expect(data.income).toBeDefined()
    expect(Array.isArray(data.expenses)).toBe(true)
    // Should have at least one expense group
    expect(data.expenses.length).toBeGreaterThanOrEqual(1)
    expect(data.expenses[0].amount).toBe(200) // absolute value
  })

  it('filters by accountId', async () => {
    // Create a TX on girokonto with a giro category
    await prisma.transaction.create({
      data: {
        date: new Date(),
        mainAmount: -100,
        mainType: 'EXPENSE',
        description: 'Giro-TX',
        accountId: SEED.accounts.girokonto,
        categoryId: SEED.categories.lebensmittel,
        status: 'CLEARED',
      },
    })

    const now = new Date()
    // Filter by girokonto → should see the transaction
    const res = await GET_CATEGORY(
      createRequest('GET', `/api/reports/category-spending?year=${now.getFullYear()}&month=${now.getMonth() + 1}&accountId=${SEED.accounts.girokonto}`),
    )
    const data = await res.json()
    expect(data.expenses.length).toBeGreaterThanOrEqual(1)

    // Filter by sparkonto → should NOT see it (different account's groups)
    const res2 = await GET_CATEGORY(
      createRequest('GET', `/api/reports/category-spending?year=${now.getFullYear()}&month=${now.getMonth() + 1}&accountId=${SEED.accounts.sparkonto}`),
    )
    const data2 = await res2.json()
    expect(data2.expenses.length).toBe(0) // lebensmittel is in giro group, not spar group
  })

  it('returns empty arrays for month without transactions', async () => {
    const res = await GET_CATEGORY(
      createRequest('GET', '/api/reports/category-spending?year=2020&month=1'),
    )
    const data = await res.json()
    expect(data.expenses).toEqual([])
    expect(data.income).toEqual([])
  })
})
