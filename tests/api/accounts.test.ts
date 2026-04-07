import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { GET, POST } from '@/app/api/accounts/route'
import { GET as GET_BY_ID, PUT, DELETE } from '@/app/api/accounts/[id]/route'
import { seedDatabase, SEED } from './seed'
import { createRequest, createParams, seedTransaction } from './helpers'
import { prisma } from '@/lib/prisma'

beforeAll(async () => {
  await seedDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('GET /api/accounts', () => {
  it('returns only active accounts ordered by sortOrder', async () => {
    const res = await GET(createRequest('GET', '/api/accounts'))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data).toHaveLength(2)
    expect(data[0].name).toBe('Girokonto')
    expect(data[1].name).toBe('Sparkonto')
  })

  it('includes _count.transactions', async () => {
    const res = await GET(createRequest('GET', '/api/accounts'))
    const data = await res.json()
    expect(data[0]._count).toBeDefined()
    expect(data[0]._count.transactions).toBe(0)
  })

  it('excludes inactive accounts', async () => {
    await prisma.account.update({
      where: { id: SEED.accounts.sparkonto },
      data: { isActive: false },
    })
    const res = await GET(createRequest('GET', '/api/accounts'))
    const data = await res.json()
    expect(data).toHaveLength(1)
    expect(data[0].name).toBe('Girokonto')
    // restore
    await prisma.account.update({
      where: { id: SEED.accounts.sparkonto },
      data: { isActive: true },
    })
  })
})

describe('POST /api/accounts', () => {
  it('creates an account with auto sortOrder', async () => {
    const res = await POST(createRequest('POST', '/api/accounts', {
      name: 'Bargeld',
      type: 'CASH',
    }))
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.name).toBe('Bargeld')
    expect(data.type).toBe('CASH')
    expect(data.sortOrder).toBe(2) // seed has 0 and 1
    expect(data.isActive).toBe(true)
    // cleanup
    await prisma.account.delete({ where: { id: data.id } })
  })

  it('applies default values', async () => {
    const res = await POST(createRequest('POST', '/api/accounts', {
      name: 'Minimal',
    }))
    const data = await res.json()
    expect(data.type).toBe('CHECKING')
    expect(data.color).toBe('#6366f1')
    expect(data.currentBalance).toBe(0)
    await prisma.account.delete({ where: { id: data.id } })
  })

  it('rejects missing name', async () => {
    const res = await POST(createRequest('POST', '/api/accounts', {
      type: 'CHECKING',
    }))
    expect(res.status).toBe(400)
  })
})

describe('GET /api/accounts/[id]', () => {
  it('returns account with transactions', async () => {
    await seedTransaction(SEED.accounts.girokonto, {
      description: 'Test TX',
      mainAmount: -50,
    })
    const res = await GET_BY_ID(
      createRequest('GET', `/api/accounts/${SEED.accounts.girokonto}`),
      createParams({ id: SEED.accounts.girokonto }),
    )
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.name).toBe('Girokonto')
    expect(data.transactions).toHaveLength(1)
    expect(data.transactions[0].description).toBe('Test TX')
    // cleanup
    await prisma.transaction.deleteMany({ where: { accountId: SEED.accounts.girokonto } })
  })

  it('returns 404 for unknown id', async () => {
    const res = await GET_BY_ID(
      createRequest('GET', '/api/accounts/nonexistent'),
      createParams({ id: 'nonexistent' }),
    )
    expect(res.status).toBe(404)
  })
})

describe('PUT /api/accounts/[id]', () => {
  it('updates account fields', async () => {
    const res = await PUT(
      createRequest('PUT', `/api/accounts/${SEED.accounts.girokonto}`, {
        name: 'Mein Girokonto',
        color: '#ec4899',
      }),
      createParams({ id: SEED.accounts.girokonto }),
    )
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.name).toBe('Mein Girokonto')
    expect(data.color).toBe('#ec4899')
    // restore
    await prisma.account.update({
      where: { id: SEED.accounts.girokonto },
      data: { name: 'Girokonto', color: '#3b82f6' },
    })
  })
})

describe('DELETE /api/accounts/[id]', () => {
  it('soft-deletes (sets isActive to false)', async () => {
    const res = await DELETE(
      createRequest('DELETE', `/api/accounts/${SEED.accounts.sparkonto}`),
      createParams({ id: SEED.accounts.sparkonto }),
    )
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    // verify soft delete
    const account = await prisma.account.findUnique({
      where: { id: SEED.accounts.sparkonto },
    })
    expect(account).not.toBeNull()
    expect(account!.isActive).toBe(false)
    // restore
    await prisma.account.update({
      where: { id: SEED.accounts.sparkonto },
      data: { isActive: true },
    })
  })
})
