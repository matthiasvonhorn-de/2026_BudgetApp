import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { POST } from '@/app/api/assets/[id]/values/route'
import { PUT, DELETE } from '@/app/api/assets/[id]/values/[valueId]/route'
import { seedDatabase } from './seed'
import { createRequest, createParams } from './helpers'
import { prisma } from '@/lib/prisma'

let assetId: string

beforeAll(async () => {
  await seedDatabase()

  // Create test asset type + asset (not in global seed to avoid collisions with assets.test.ts)
  const assetType = await prisma.assetType.create({
    data: { name: 'Test-Immobilie', icon: 'Home', sortOrder: 50 },
  })
  const asset = await prisma.asset.create({
    data: {
      name: 'Eigenheim',
      assetTypeId: assetType.id,
      purchaseDate: new Date('2020-01-15'),
      purchasePrice: 350000,
    },
  })
  assetId = asset.id
})

afterAll(async () => {
  await prisma.assetValue.deleteMany()
  await prisma.asset.deleteMany({ where: { id: assetId } })
  await prisma.assetType.deleteMany({ where: { name: 'Test-Immobilie' } })
  await prisma.$disconnect()
})

afterEach(async () => {
  await prisma.assetValue.deleteMany()
})

describe('POST /api/assets/[id]/values', () => {
  it('creates a value entry', async () => {
    const res = await POST(
      createRequest('POST', `/api/assets/${assetId}/values`, {
        date: '2026-04-01',
        value: 360000,
        notes: 'Gutachten',
      }),
      createParams({ id: assetId }),
    )
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.value).toBe(360000)
    expect(data.notes).toBe('Gutachten')
    expect(data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns 404 for non-existent asset', async () => {
    const res = await POST(
      createRequest('POST', '/api/assets/nonexistent/values', {
        date: '2026-04-01',
        value: 100,
      }),
      createParams({ id: 'nonexistent' }),
    )
    expect(res.status).toBe(404)
  })

  it('returns 400 for future date', async () => {
    const res = await POST(
      createRequest('POST', `/api/assets/${assetId}/values`, {
        date: '2030-01-01',
        value: 400000,
      }),
      createParams({ id: assetId }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 409 for duplicate date', async () => {
    await POST(
      createRequest('POST', `/api/assets/${assetId}/values`, {
        date: '2026-04-01',
        value: 350000,
      }),
      createParams({ id: assetId }),
    )

    const res = await POST(
      createRequest('POST', `/api/assets/${assetId}/values`, {
        date: '2026-04-01',
        value: 360000,
      }),
      createParams({ id: assetId }),
    )
    expect(res.status).toBe(409)
  })
})

describe('PUT /api/assets/[id]/values/[valueId]', () => {
  it('updates a value entry', async () => {
    const createRes = await POST(
      createRequest('POST', `/api/assets/${assetId}/values`, {
        date: '2026-04-01',
        value: 350000,
      }),
      createParams({ id: assetId }),
    )
    const created = await createRes.json()

    const res = await PUT(
      createRequest('PUT', `/api/assets/${assetId}/values/${created.id}`, {
        value: 370000,
        notes: 'Updated',
      }),
      createParams({ id: assetId, valueId: created.id }),
    )
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.value).toBe(370000)
    expect(data.notes).toBe('Updated')
  })

  it('returns 404 for non-existent value', async () => {
    const res = await PUT(
      createRequest('PUT', `/api/assets/${assetId}/values/nonexistent`, {
        value: 999,
      }),
      createParams({ id: assetId, valueId: 'nonexistent' }),
    )
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/assets/[id]/values/[valueId]', () => {
  it('deletes a value entry', async () => {
    const createRes = await POST(
      createRequest('POST', `/api/assets/${assetId}/values`, {
        date: '2026-04-01',
        value: 350000,
      }),
      createParams({ id: assetId }),
    )
    const created = await createRes.json()

    const res = await DELETE(
      createRequest('DELETE', `/api/assets/${assetId}/values/${created.id}`),
      createParams({ id: assetId, valueId: created.id }),
    )
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)

    const deleted = await prisma.assetValue.findUnique({ where: { id: created.id } })
    expect(deleted).toBeNull()
  })

  it('returns 404 for non-existent value', async () => {
    const res = await DELETE(
      createRequest('DELETE', `/api/assets/${assetId}/values/nonexistent`),
      createParams({ id: assetId, valueId: 'nonexistent' }),
    )
    expect(res.status).toBe(404)
  })
})
