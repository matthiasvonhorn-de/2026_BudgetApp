import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { GET as GET_TYPES, POST as POST_TYPE } from '@/app/api/asset-types/route'
import { GET, POST } from '@/app/api/assets/route'
import { seedDatabase } from './seed'
import { createRequest } from './helpers'
import { prisma } from '@/lib/prisma'

beforeAll(async () => {
  await seedDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

afterEach(async () => {
  await prisma.assetValue.deleteMany()
  await prisma.asset.deleteMany()
  await prisma.assetType.deleteMany()
})

describe('POST /api/asset-types', () => {
  it('creates an asset type with auto sortOrder', async () => {
    const res = await POST_TYPE(createRequest('POST', '/api/asset-types', {
      name: 'Immobilien',
      icon: 'Home',
      color: '#f59e0b',
    }))
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.name).toBe('Immobilien')
    expect(data.icon).toBe('Home')
    expect(data.sortOrder).toBe(0)
  })

  it('applies default icon and color', async () => {
    const res = await POST_TYPE(createRequest('POST', '/api/asset-types', { name: 'Sonstiges' }))
    const data = await res.json()
    expect(data.icon).toBe('Package')
    expect(data.color).toBe('#6366f1')
  })

  it('rejects missing name', async () => {
    const res = await POST_TYPE(createRequest('POST', '/api/asset-types', {}))
    expect(res.status).toBe(400)
  })
})

describe('GET /api/asset-types', () => {
  it('returns types with asset count', async () => {
    await POST_TYPE(createRequest('POST', '/api/asset-types', { name: 'Fahrzeuge' }))

    const res = await GET_TYPES(createRequest('GET', '/api/asset-types'))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.length).toBeGreaterThanOrEqual(1)
    expect(data[0]._count).toBeDefined()
    expect(data[0]._count.assets).toBe(0)
  })
})

describe('POST /api/assets', () => {
  it('creates an asset linked to a type', async () => {
    const typeRes = await POST_TYPE(createRequest('POST', '/api/asset-types', { name: 'Immobilien' }))
    const type = await typeRes.json()

    const res = await POST(createRequest('POST', '/api/assets', {
      name: 'Eigentumswohnung',
      assetTypeId: type.id,
      purchaseDate: '2020-06-15',
      purchasePrice: 250000,
      ownershipPercent: 50,
    }))
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.name).toBe('Eigentumswohnung')
    expect(data.purchasePrice).toBe(250000)
    expect(data.ownershipPercent).toBe(50)
    expect(data.assetType.name).toBe('Immobilien')
  })

  it('applies default ownership 100%', async () => {
    const typeRes = await POST_TYPE(createRequest('POST', '/api/asset-types', { name: 'Temp' }))
    const type = await typeRes.json()

    const res = await POST(createRequest('POST', '/api/assets', {
      name: 'Auto',
      assetTypeId: type.id,
      purchaseDate: '2024-01-01',
      purchasePrice: 30000,
    }))
    const data = await res.json()
    expect(data.ownershipPercent).toBe(100)
  })

  it('rejects missing required fields', async () => {
    const res = await POST(createRequest('POST', '/api/assets', { name: 'Bad' }))
    expect(res.status).toBe(400)
  })
})

describe('GET /api/assets', () => {
  it('returns active assets with sparkline data', async () => {
    const typeRes = await POST_TYPE(createRequest('POST', '/api/asset-types', { name: 'Test' }))
    const type = await typeRes.json()

    await POST(createRequest('POST', '/api/assets', {
      name: 'Haus',
      assetTypeId: type.id,
      purchaseDate: '2020-01-01',
      purchasePrice: 400000,
    }))

    const res = await GET(createRequest('GET', '/api/assets'))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.length).toBeGreaterThanOrEqual(1)
    expect(data[0].sparklineData).toBeDefined()
  })

  it('excludes inactive assets', async () => {
    const typeRes = await POST_TYPE(createRequest('POST', '/api/asset-types', { name: 'T' }))
    const type = await typeRes.json()

    const createRes = await POST(createRequest('POST', '/api/assets', {
      name: 'Inactive',
      assetTypeId: type.id,
      purchaseDate: '2020-01-01',
      purchasePrice: 1000,
    }))
    const asset = await createRes.json()
    await prisma.asset.update({ where: { id: asset.id }, data: { isActive: false } })

    const res = await GET(createRequest('GET', '/api/assets'))
    const data = await res.json()
    const found = data.find((a: { id: string }) => a.id === asset.id)
    expect(found).toBeUndefined()
  })
})
