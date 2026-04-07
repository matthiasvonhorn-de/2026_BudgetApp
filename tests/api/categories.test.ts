import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { GET, POST } from '@/app/api/categories/route'
import { PUT, DELETE } from '@/app/api/categories/[id]/route'
import { seedDatabase, SEED } from './seed'
import { createRequest, createParams } from './helpers'
import { prisma } from '@/lib/prisma'

beforeAll(async () => {
  await seedDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

// Track IDs created by tests for cleanup
const createdIds: string[] = []
afterEach(async () => {
  for (const id of createdIds) {
    await prisma.category.deleteMany({ where: { id } })
  }
  createdIds.length = 0
})

describe('GET /api/categories', () => {
  it('returns groups with their categories + ungrouped', async () => {
    const res = await GET(createRequest('GET', '/api/categories'))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.groups).toBeDefined()
    expect(data.ungrouped).toBeDefined()
    expect(Array.isArray(data.groups)).toBe(true)
  })

  it('seed groups contain their categories', async () => {
    const res = await GET(createRequest('GET', '/api/categories'))
    const data = await res.json()
    const fixkosten = data.groups.find((g: { id: string }) => g.id === SEED.groups.giroFixkosten)
    expect(fixkosten).toBeDefined()
    expect(fixkosten.categories.length).toBeGreaterThanOrEqual(1)
    const miete = fixkosten.categories.find((c: { id: string }) => c.id === SEED.categories.miete)
    expect(miete).toBeDefined()
    expect(miete.name).toBe('Miete')
  })

  it('excludes inactive categories', async () => {
    await prisma.category.update({
      where: { id: SEED.categories.sonstiges },
      data: { isActive: false },
    })
    const res = await GET(createRequest('GET', '/api/categories'))
    const data = await res.json()
    const allCategories = data.groups.flatMap((g: { categories: unknown[] }) => g.categories)
    const sonstiges = allCategories.find((c: { id: string }) => c.id === SEED.categories.sonstiges)
    expect(sonstiges).toBeUndefined()
    // restore
    await prisma.category.update({
      where: { id: SEED.categories.sonstiges },
      data: { isActive: true },
    })
  })
})

describe('POST /api/categories', () => {
  it('creates a category with defaults', async () => {
    const res = await POST(createRequest('POST', '/api/categories', {
      name: 'Transport',
    }))
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.name).toBe('Transport')
    expect(data.type).toBe('EXPENSE')
    expect(data.color).toBe('#6366f1')
    expect(data.rolloverEnabled).toBe(true)
    createdIds.push(data.id)
  })

  it('creates a category in a group', async () => {
    const res = await POST(createRequest('POST', '/api/categories', {
      name: 'Strom',
      type: 'EXPENSE',
      groupId: SEED.groups.giroFixkosten,
    }))
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.groupId).toBe(SEED.groups.giroFixkosten)
    createdIds.push(data.id)
  })

  it('rejects missing name', async () => {
    const res = await POST(createRequest('POST', '/api/categories', {
      type: 'EXPENSE',
    }))
    expect(res.status).toBe(400)
  })
})

describe('PUT /api/categories/[id]', () => {
  it('updates category fields', async () => {
    const res = await PUT(
      createRequest('PUT', `/api/categories/${SEED.categories.miete}`, {
        name: 'Warmmiete',
        color: '#dc2626',
      }),
      createParams({ id: SEED.categories.miete }),
    )
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.name).toBe('Warmmiete')
    expect(data.color).toBe('#dc2626')
    // restore
    await prisma.category.update({
      where: { id: SEED.categories.miete },
      data: { name: 'Miete', color: '#ef4444' },
    })
  })
})

describe('DELETE /api/categories/[id]', () => {
  it('soft-deletes category', async () => {
    const cat = await prisma.category.create({
      data: { name: 'Temp', type: 'EXPENSE' },
    })
    const res = await DELETE(
      createRequest('DELETE', `/api/categories/${cat.id}`),
      createParams({ id: cat.id }),
    )
    expect(res.status).toBe(200)
    const deleted = await prisma.category.findUnique({ where: { id: cat.id } })
    expect(deleted!.isActive).toBe(false)
    // cleanup
    await prisma.category.delete({ where: { id: cat.id } })
  })
})
