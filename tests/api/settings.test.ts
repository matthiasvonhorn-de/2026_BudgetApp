import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { GET, PUT } from '@/app/api/settings/route'
import { seedDatabase } from './seed'
import { createRequest } from './helpers'
import { prisma } from '@/lib/prisma'

beforeAll(async () => {
  await seedDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('GET /api/settings', () => {
  it('returns seeded settings as key-value pairs', async () => {
    const res = await GET(createRequest('GET', '/api/settings'))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.currency).toBe('EUR')
    expect(data.locale).toBe('de-DE')
  })

  it('returns empty object when no settings exist', async () => {
    await prisma.appSetting.deleteMany()
    const res = await GET(createRequest('GET', '/api/settings'))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data).toEqual({})
    // restore
    await prisma.appSetting.createMany({
      data: [
        { key: 'currency', value: 'EUR' },
        { key: 'locale', value: 'de-DE' },
      ],
    })
  })
})

describe('PUT /api/settings', () => {
  it('upserts all settings', async () => {
    const res = await PUT(createRequest('PUT', '/api/settings', {
      currency: 'CHF',
      locale: 'de-CH',
    }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    // verify
    const currency = await prisma.appSetting.findUnique({ where: { key: 'currency' } })
    const locale = await prisma.appSetting.findUnique({ where: { key: 'locale' } })
    expect(currency!.value).toBe('CHF')
    expect(locale!.value).toBe('de-CH')
    // restore
    await prisma.appSetting.update({ where: { key: 'currency' }, data: { value: 'EUR' } })
    await prisma.appSetting.update({ where: { key: 'locale' }, data: { value: 'de-DE' } })
  })

  it('rejects partial updates (Zod v4 record requires all keys)', async () => {
    const res = await PUT(createRequest('PUT', '/api/settings', {
      currency: 'USD',
    }))
    expect(res.status).toBe(400)
  })

  it('rejects unknown keys', async () => {
    const res = await PUT(createRequest('PUT', '/api/settings', {
      unknownKey: 'value',
    }))
    expect(res.status).toBe(400)
  })

  it('rejects values longer than 32 characters', async () => {
    const res = await PUT(createRequest('PUT', '/api/settings', {
      currency: 'A'.repeat(33),
      locale: 'de-DE',
    }))
    expect(res.status).toBe(400)
  })
})
