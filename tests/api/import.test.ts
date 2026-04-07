import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { POST } from '@/app/api/import/route'
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
  // Reset balance
  await prisma.account.update({
    where: { id: SEED.accounts.girokonto },
    data: { currentBalance: 1000 },
  })
})

describe('POST /api/import', () => {
  it('imports transactions and updates balance', async () => {
    const res = await POST(createRequest('POST', '/api/import', {
      accountId: SEED.accounts.girokonto,
      transactions: [
        { date: '2026-04-01', amount: -50, description: 'EDEKA', hash: 'hash-1' },
        { date: '2026-04-02', amount: -30, description: 'REWE', hash: 'hash-2' },
        { date: '2026-04-03', amount: 3000, description: 'Gehalt', hash: 'hash-3' },
      ],
    }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.imported).toBe(3)
    expect(data.duplicates).toBe(0)

    // Verify transactions were created
    const txs = await prisma.transaction.findMany({ where: { accountId: SEED.accounts.girokonto } })
    expect(txs).toHaveLength(3)

    // Verify balance: 1000 + (-50) + (-30) + 3000 = 3920
    const account = await prisma.account.findUnique({ where: { id: SEED.accounts.girokonto } })
    expect(account!.currentBalance).toBe(3920)
  })

  it('detects duplicates by hash', async () => {
    // First import
    await POST(createRequest('POST', '/api/import', {
      accountId: SEED.accounts.girokonto,
      transactions: [
        { date: '2026-04-01', amount: -50, description: 'EDEKA', hash: 'dup-hash-1' },
      ],
    }))

    // Second import with same hash + a new one
    const res = await POST(createRequest('POST', '/api/import', {
      accountId: SEED.accounts.girokonto,
      transactions: [
        { date: '2026-04-01', amount: -50, description: 'EDEKA', hash: 'dup-hash-1' },
        { date: '2026-04-05', amount: -25, description: 'Bäcker', hash: 'dup-hash-2' },
      ],
    }))
    const data = await res.json()
    expect(data.imported).toBe(1)
    expect(data.duplicates).toBe(1)
  })

  it('returns zero imports when all are duplicates', async () => {
    await POST(createRequest('POST', '/api/import', {
      accountId: SEED.accounts.girokonto,
      transactions: [
        { date: '2026-04-01', amount: -50, description: 'X', hash: 'all-dup-1' },
      ],
    }))
    const res = await POST(createRequest('POST', '/api/import', {
      accountId: SEED.accounts.girokonto,
      transactions: [
        { date: '2026-04-01', amount: -50, description: 'X', hash: 'all-dup-1' },
      ],
    }))
    const data = await res.json()
    expect(data.imported).toBe(0)
    expect(data.duplicates).toBe(1)
  })

  it('sets mainType based on amount sign', async () => {
    await POST(createRequest('POST', '/api/import', {
      accountId: SEED.accounts.girokonto,
      transactions: [
        { date: '2026-04-01', amount: -100, description: 'Ausgabe', hash: 'type-1' },
        { date: '2026-04-01', amount: 500, description: 'Einnahme', hash: 'type-2' },
      ],
    }))
    const txs = await prisma.transaction.findMany({
      where: { accountId: SEED.accounts.girokonto },
      orderBy: { mainAmount: 'asc' },
    })
    expect(txs[0].mainType).toBe('EXPENSE')
    expect(txs[1].mainType).toBe('INCOME')
  })

  it('assigns categoryId when provided', async () => {
    await POST(createRequest('POST', '/api/import', {
      accountId: SEED.accounts.girokonto,
      transactions: [
        { date: '2026-04-01', amount: -50, description: 'Miete', hash: 'cat-1', categoryId: SEED.categories.miete },
      ],
    }))
    const tx = await prisma.transaction.findFirst({ where: { importHash: 'cat-1' } })
    expect(tx!.categoryId).toBe(SEED.categories.miete)
  })

  it('sets status to CLEARED', async () => {
    await POST(createRequest('POST', '/api/import', {
      accountId: SEED.accounts.girokonto,
      transactions: [
        { date: '2026-04-01', amount: -10, description: 'Test', hash: 'status-1' },
      ],
    }))
    const tx = await prisma.transaction.findFirst({ where: { importHash: 'status-1' } })
    expect(tx!.status).toBe('CLEARED')
  })

  it('rejects missing accountId', async () => {
    const res = await POST(createRequest('POST', '/api/import', {
      transactions: [{ date: '2026-04-01', amount: -10, description: 'X', hash: 'bad-1' }],
    }))
    expect(res.status).toBe(400)
  })
})
