import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { POST } from '@/app/api/portfolios/[id]/values/route'
import { PUT, DELETE } from '@/app/api/portfolios/[id]/values/[valueId]/route'
import { seedDatabase } from './seed'
import { createRequest, createParams } from './helpers'
import { prisma } from '@/lib/prisma'

let portfolioId: string

beforeAll(async () => {
  await seedDatabase()

  // Create test portfolio (not in global seed to avoid collisions with portfolios.test.ts)
  const portfolio = await prisma.portfolio.create({
    data: { name: 'Test-Aktiendepot' },
  })
  portfolioId = portfolio.id
})

afterAll(async () => {
  await prisma.portfolioValue.deleteMany()
  await prisma.portfolio.deleteMany({ where: { id: portfolioId } })
  await prisma.$disconnect()
})

afterEach(async () => {
  await prisma.portfolioValue.deleteMany()
})

describe('POST /api/portfolios/[id]/values', () => {
  it('creates a value entry', async () => {
    const res = await POST(
      createRequest('POST', `/api/portfolios/${portfolioId}/values`, {
        date: '2026-04-01',
        value: 15000.50,
        notes: 'Monatsende',
      }),
      createParams({ id: portfolioId }),
    )
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.value).toBe(15000.5)
    expect(data.notes).toBe('Monatsende')
    expect(data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns 404 for non-existent portfolio', async () => {
    const res = await POST(
      createRequest('POST', '/api/portfolios/nonexistent/values', {
        date: '2026-04-01',
        value: 100,
      }),
      createParams({ id: 'nonexistent' }),
    )
    expect(res.status).toBe(404)
  })

  it('returns 400 for future date', async () => {
    const res = await POST(
      createRequest('POST', `/api/portfolios/${portfolioId}/values`, {
        date: '2030-01-01',
        value: 20000,
      }),
      createParams({ id: portfolioId }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 409 for duplicate date', async () => {
    await POST(
      createRequest('POST', `/api/portfolios/${portfolioId}/values`, {
        date: '2026-04-01',
        value: 10000,
      }),
      createParams({ id: portfolioId }),
    )

    const res = await POST(
      createRequest('POST', `/api/portfolios/${portfolioId}/values`, {
        date: '2026-04-01',
        value: 11000,
      }),
      createParams({ id: portfolioId }),
    )
    expect(res.status).toBe(409)
  })
})

describe('PUT /api/portfolios/[id]/values/[valueId]', () => {
  it('updates a value entry', async () => {
    const createRes = await POST(
      createRequest('POST', `/api/portfolios/${portfolioId}/values`, {
        date: '2026-04-01',
        value: 10000,
      }),
      createParams({ id: portfolioId }),
    )
    const created = await createRes.json()

    const res = await PUT(
      createRequest('PUT', `/api/portfolios/${portfolioId}/values/${created.id}`, {
        value: 12000,
        notes: 'Korrektur',
      }),
      createParams({ id: portfolioId, valueId: created.id }),
    )
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.value).toBe(12000)
    expect(data.notes).toBe('Korrektur')
  })

  it('returns 404 for non-existent value', async () => {
    const res = await PUT(
      createRequest('PUT', `/api/portfolios/${portfolioId}/values/nonexistent`, {
        value: 999,
      }),
      createParams({ id: portfolioId, valueId: 'nonexistent' }),
    )
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/portfolios/[id]/values/[valueId]', () => {
  it('deletes a value entry', async () => {
    const createRes = await POST(
      createRequest('POST', `/api/portfolios/${portfolioId}/values`, {
        date: '2026-04-01',
        value: 10000,
      }),
      createParams({ id: portfolioId }),
    )
    const created = await createRes.json()

    const res = await DELETE(
      createRequest('DELETE', `/api/portfolios/${portfolioId}/values/${created.id}`),
      createParams({ id: portfolioId, valueId: created.id }),
    )
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)

    const deleted = await prisma.portfolioValue.findUnique({ where: { id: created.id } })
    expect(deleted).toBeNull()
  })

  it('returns 404 for non-existent value', async () => {
    const res = await DELETE(
      createRequest('DELETE', `/api/portfolios/${portfolioId}/values/nonexistent`),
      createParams({ id: portfolioId, valueId: 'nonexistent' }),
    )
    expect(res.status).toBe(404)
  })
})
