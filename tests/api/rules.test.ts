import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { GET, POST } from '@/app/api/rules/route'
import { PUT, DELETE } from '@/app/api/rules/[id]/route'
import { seedDatabase, SEED } from './seed'
import { createRequest, createParams, seedRule } from './helpers'
import { prisma } from '@/lib/prisma'

beforeAll(async () => {
  await seedDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

const createdIds: string[] = []
afterEach(async () => {
  for (const id of createdIds) {
    await prisma.categoryRule.deleteMany({ where: { id } })
  }
  createdIds.length = 0
})

describe('GET /api/rules', () => {
  it('returns rules ordered by priority desc', async () => {
    await seedRule(SEED.categories.miete, { name: 'Low', priority: 1 })
    await seedRule(SEED.categories.gehalt, { name: 'High', priority: 10 })

    const res = await GET(createRequest('GET', '/api/rules'))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.length).toBeGreaterThanOrEqual(2)
    expect(data[0].priority).toBeGreaterThanOrEqual(data[1].priority)

    // cleanup
    await prisma.categoryRule.deleteMany()
  })

  it('includes category details', async () => {
    await seedRule(SEED.categories.miete, { name: 'Test' })
    const res = await GET(createRequest('GET', '/api/rules'))
    const data = await res.json()
    expect(data[0].category).toBeDefined()
    expect(data[0].category.name).toBe('Miete')
    await prisma.categoryRule.deleteMany()
  })
})

describe('POST /api/rules', () => {
  it('creates a CONTAINS rule', async () => {
    const res = await POST(createRequest('POST', '/api/rules', {
      name: 'Edeka Matcher',
      field: 'DESCRIPTION',
      operator: 'CONTAINS',
      value: 'edeka',
      categoryId: SEED.categories.lebensmittel,
      priority: 5,
    }))
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.name).toBe('Edeka Matcher')
    expect(data.operator).toBe('CONTAINS')
    expect(data.category).toBeDefined()
    createdIds.push(data.id)
  })

  it('creates a REGEX rule with valid pattern', async () => {
    const res = await POST(createRequest('POST', '/api/rules', {
      name: 'Regex Test',
      field: 'DESCRIPTION',
      operator: 'REGEX',
      value: 'EDEKA.*BERLIN',
      categoryId: SEED.categories.lebensmittel,
    }))
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.operator).toBe('REGEX')
    createdIds.push(data.id)
  })

  it('rejects REGEX rule with invalid pattern', async () => {
    const res = await POST(createRequest('POST', '/api/rules', {
      name: 'Bad Regex',
      field: 'DESCRIPTION',
      operator: 'REGEX',
      value: '[invalid',
      categoryId: SEED.categories.lebensmittel,
    }))
    expect(res.status).toBe(400)
  })

  it('rejects REGEX rule with ReDoS pattern', async () => {
    const res = await POST(createRequest('POST', '/api/rules', {
      name: 'ReDoS',
      field: 'DESCRIPTION',
      operator: 'REGEX',
      value: '(a+)+',
      categoryId: SEED.categories.lebensmittel,
    }))
    expect(res.status).toBe(400)
  })

  it('applies default priority and isActive', async () => {
    const res = await POST(createRequest('POST', '/api/rules', {
      name: 'Defaults Test',
      field: 'PAYEE',
      operator: 'EQUALS',
      value: 'test',
      categoryId: SEED.categories.miete,
    }))
    const data = await res.json()
    expect(data.priority).toBe(0)
    expect(data.isActive).toBe(true)
    createdIds.push(data.id)
  })

  it('rejects missing required fields', async () => {
    const res = await POST(createRequest('POST', '/api/rules', {
      name: 'Incomplete',
    }))
    expect(res.status).toBe(400)
  })
})

describe('PUT /api/rules/[id]', () => {
  it('updates rule fields', async () => {
    const rule = await seedRule(SEED.categories.miete, {
      name: 'Old Name',
      priority: 1,
    })
    const res = await PUT(
      createRequest('PUT', `/api/rules/${rule.id}`, {
        name: 'New Name',
        priority: 10,
      }),
      createParams({ id: rule.id }),
    )
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.name).toBe('New Name')
    expect(data.priority).toBe(10)
    await prisma.categoryRule.delete({ where: { id: rule.id } })
  })

  it('validates regex when updating value on a REGEX rule', async () => {
    const rule = await seedRule(SEED.categories.miete, {
      operator: 'REGEX',
      value: 'valid.*pattern',
    })
    const res = await PUT(
      createRequest('PUT', `/api/rules/${rule.id}`, {
        value: '[invalid',
      }),
      createParams({ id: rule.id }),
    )
    expect(res.status).toBe(400)
    await prisma.categoryRule.delete({ where: { id: rule.id } })
  })
})

describe('DELETE /api/rules/[id]', () => {
  it('hard-deletes a rule', async () => {
    const rule = await seedRule(SEED.categories.miete, { name: 'To Delete' })
    const res = await DELETE(
      createRequest('DELETE', `/api/rules/${rule.id}`),
      createParams({ id: rule.id }),
    )
    expect(res.status).toBe(200)
    const deleted = await prisma.categoryRule.findUnique({ where: { id: rule.id } })
    expect(deleted).toBeNull()
  })
})
