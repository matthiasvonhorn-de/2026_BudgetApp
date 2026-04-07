import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { GET, POST } from '@/app/api/savings/route'
import { DELETE } from '@/app/api/savings/[id]/route'
import { seedDatabase } from './seed'
import { createRequest, createParams } from './helpers'
import { prisma } from '@/lib/prisma'

beforeAll(async () => {
  await seedDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

afterEach(async () => {
  // Clean savings-related data
  await prisma.savingsEntry.deleteMany()
  await prisma.savingsConfig.deleteMany()
  await prisma.account.deleteMany({
    where: { type: { in: ['SPARPLAN', 'FESTGELD'] } },
  })
})

const sparplanData = {
  name: 'Notgroschen',
  savingsType: 'SPARPLAN' as const,
  initialBalance: 1000,
  contributionAmount: 200,
  contributionFrequency: 'MONTHLY' as const,
  interestRate: 0.03,
  interestFrequency: 'MONTHLY' as const,
  startDate: '2025-01-01',
  termMonths: 24,
  color: '#10b981',
}

const festgeldData = {
  name: 'Festgeld 12M',
  savingsType: 'FESTGELD' as const,
  initialBalance: 10000,
  contributionAmount: 0,
  interestRate: 0.035,
  interestFrequency: 'ANNUALLY' as const,
  startDate: '2025-01-01',
  termMonths: 12,
  color: '#6366f1',
}

describe('POST /api/savings', () => {
  it('creates a SPARPLAN (status 201)', async () => {
    const res = await POST(createRequest('POST', '/api/savings', sparplanData))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data).toBeDefined()

    // Verify account was created with correct type
    const accounts = await prisma.account.findMany({ where: { type: 'SPARPLAN' } })
    expect(accounts.length).toBeGreaterThanOrEqual(1)
    expect(accounts[0].name).toBe('Notgroschen')
  })

  it('creates a FESTGELD (status 201)', async () => {
    const res = await POST(createRequest('POST', '/api/savings', festgeldData))
    expect(res.status).toBe(201)

    const accounts = await prisma.account.findMany({ where: { type: 'FESTGELD' } })
    expect(accounts.length).toBeGreaterThanOrEqual(1)
    expect(accounts[0].name).toBe('Festgeld 12M')
  })

  it('generates schedule entries', async () => {
    await POST(createRequest('POST', '/api/savings', sparplanData))

    const configs = await prisma.savingsConfig.findMany({
      include: { entries: true },
    })
    expect(configs.length).toBeGreaterThanOrEqual(1)
    expect(configs[0].entries.length).toBeGreaterThan(0)
    const types = new Set(configs[0].entries.map(e => e.entryType))
    expect(types.has('CONTRIBUTION')).toBe(true)
    expect(types.has('INTEREST')).toBe(true)
  })

  it('FESTGELD has only INTEREST entries', async () => {
    await POST(createRequest('POST', '/api/savings', festgeldData))

    const configs = await prisma.savingsConfig.findMany({
      include: { entries: true },
    })
    expect(configs.length).toBeGreaterThanOrEqual(1)
    const types = new Set(configs[0].entries.map(e => e.entryType))
    expect(types.has('INTEREST')).toBe(true)
    expect(types.has('CONTRIBUTION')).toBe(false)
  })

  it('rejects missing required fields', async () => {
    const res = await POST(createRequest('POST', '/api/savings', { name: 'Bad' }))
    expect(res.status).toBe(400)
  })
})

describe('GET /api/savings', () => {
  it('returns list of savings', async () => {
    await POST(createRequest('POST', '/api/savings', sparplanData))

    const res = await GET(createRequest('GET', '/api/savings'))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThanOrEqual(1)
  })

  it('returns empty array when no savings exist', async () => {
    const res = await GET(createRequest('GET', '/api/savings'))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data).toEqual([])
  })
})

describe('DELETE /api/savings/[id]', () => {
  it('deletes savings', async () => {
    await POST(createRequest('POST', '/api/savings', sparplanData))
    const account = await prisma.account.findFirst({ where: { type: 'SPARPLAN' } })
    expect(account).not.toBeNull()

    const res = await DELETE(
      createRequest('DELETE', `/api/savings/${account!.id}`),
      createParams({ id: account!.id }),
    )
    expect(res.status).toBe(200)
  })
})
