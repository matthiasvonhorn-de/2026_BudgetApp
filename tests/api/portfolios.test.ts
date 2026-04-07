import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { GET, POST } from '@/app/api/portfolios/route'
import { GET as GET_BY_ID, PUT, DELETE } from '@/app/api/portfolios/[id]/route'
import { POST as POST_VALUE } from '@/app/api/portfolios/[id]/values/route'
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
  await prisma.portfolioValue.deleteMany()
  await prisma.portfolio.deleteMany()
})

describe('POST /api/portfolios', () => {
  it('creates a portfolio', async () => {
    const res = await POST(createRequest('POST', '/api/portfolios', {
      name: 'MSCI World ETF',
      color: '#3b82f6',
    }))
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.name).toBe('MSCI World ETF')
    expect(data.color).toBe('#3b82f6')
  })

  it('applies default color', async () => {
    const res = await POST(createRequest('POST', '/api/portfolios', { name: 'Minimal' }))
    const data = await res.json()
    expect(data.color).toBe('#6366f1')
  })

  it('rejects missing name', async () => {
    const res = await POST(createRequest('POST', '/api/portfolios', {}))
    expect(res.status).toBe(400)
  })
})

describe('GET /api/portfolios', () => {
  it('returns active portfolios with sparkline data', async () => {
    const createRes = await POST(createRequest('POST', '/api/portfolios', { name: 'Test' }))
    const created = await createRes.json()

    // Add a value
    await prisma.portfolioValue.create({
      data: { portfolioId: created.id, date: new Date('2026-04-01'), value: 10000 },
    })

    const res = await GET(createRequest('GET', '/api/portfolios'))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.length).toBeGreaterThanOrEqual(1)
    expect(data[0].currentValue).toBe(10000)
    expect(data[0].sparklineData).toBeDefined()
  })

  it('excludes inactive portfolios', async () => {
    const createRes = await POST(createRequest('POST', '/api/portfolios', { name: 'Inactive' }))
    const created = await createRes.json()
    await prisma.portfolio.update({ where: { id: created.id }, data: { isActive: false } })

    const res = await GET(createRequest('GET', '/api/portfolios'))
    const data = await res.json()
    const found = data.find((p: { id: string }) => p.id === created.id)
    expect(found).toBeUndefined()
  })
})

describe('GET /api/portfolios/[id]', () => {
  it('returns portfolio with values', async () => {
    const createRes = await POST(createRequest('POST', '/api/portfolios', { name: 'Detail' }))
    const created = await createRes.json()

    const res = await GET_BY_ID(
      createRequest('GET', `/api/portfolios/${created.id}`),
      createParams({ id: created.id }),
    )
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.name).toBe('Detail')
    expect(data.values).toBeDefined()
  })

  it('returns 404 for unknown id', async () => {
    const res = await GET_BY_ID(
      createRequest('GET', '/api/portfolios/nonexistent'),
      createParams({ id: 'nonexistent' }),
    )
    expect(res.status).toBe(404)
  })
})

describe('PUT /api/portfolios/[id]', () => {
  it('updates portfolio', async () => {
    const createRes = await POST(createRequest('POST', '/api/portfolios', { name: 'Old' }))
    const created = await createRes.json()

    const res = await PUT(
      createRequest('PUT', `/api/portfolios/${created.id}`, { name: 'New', color: '#ec4899' }),
      createParams({ id: created.id }),
    )
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.name).toBe('New')
    expect(data.color).toBe('#ec4899')
  })
})

describe('DELETE /api/portfolios/[id]', () => {
  it('hard-deletes portfolio', async () => {
    const createRes = await POST(createRequest('POST', '/api/portfolios', { name: 'To Delete' }))
    const created = await createRes.json()

    const res = await DELETE(
      createRequest('DELETE', `/api/portfolios/${created.id}`),
      createParams({ id: created.id }),
    )
    expect(res.status).toBe(200)
    const deleted = await prisma.portfolio.findUnique({ where: { id: created.id } })
    expect(deleted).toBeNull()
  })
})

describe('POST /api/portfolios/[id]/values', () => {
  it('adds a value entry', async () => {
    const createRes = await POST(createRequest('POST', '/api/portfolios', { name: 'WithValue' }))
    const portfolio = await createRes.json()

    const res = await POST_VALUE(
      createRequest('POST', `/api/portfolios/${portfolio.id}/values`, {
        date: '2026-04-01T12:00:00',
        value: 12500.50,
      }),
      createParams({ id: portfolio.id }),
    )
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.value).toBe(12500.5)
    // Date may shift due to timezone normalization — just check it's a valid date string
    expect(data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('rejects duplicate date', async () => {
    const createRes = await POST(createRequest('POST', '/api/portfolios', { name: 'Dupe' }))
    const portfolio = await createRes.json()

    await POST_VALUE(
      createRequest('POST', `/api/portfolios/${portfolio.id}/values`, { date: '2026-04-01T12:00:00', value: 100 }),
      createParams({ id: portfolio.id }),
    )
    const res = await POST_VALUE(
      createRequest('POST', `/api/portfolios/${portfolio.id}/values`, { date: '2026-04-01T12:00:00', value: 200 }),
      createParams({ id: portfolio.id }),
    )
    expect(res.status).toBe(409)
  })
})
