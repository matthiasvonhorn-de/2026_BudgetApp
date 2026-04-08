import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { GET, POST } from '@/app/api/transactions/route'
import { PUT, DELETE } from '@/app/api/transactions/[id]/route'
import { seedDatabase, SEED } from './seed'
import { createRequest, createParams } from './helpers'
import { prisma } from '@/lib/prisma'

beforeAll(async () => {
  await seedDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

afterEach(async () => {
  await prisma.transaction.deleteMany()
  // Reset account balances to seed values
  await prisma.account.update({
    where: { id: SEED.accounts.girokonto },
    data: { currentBalance: 1000 },
  })
  await prisma.account.update({
    where: { id: SEED.accounts.sparkonto },
    data: { currentBalance: 5000 },
  })
})

describe('GET /api/transactions', () => {
  it('returns transactions with account and category info', async () => {
    await prisma.transaction.create({
      data: {
        date: new Date('2026-04-01'),
        mainAmount: -50,
        mainType: 'EXPENSE',
        description: 'Einkauf',
        accountId: SEED.accounts.girokonto,
        categoryId: SEED.categories.lebensmittel,
        status: 'PENDING',
      },
    })
    const res = await GET(createRequest('GET', '/api/transactions'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data).toHaveLength(1)
    expect(body.data[0].description).toBe('Einkauf')
    expect(body.data[0].account.name).toBe('Girokonto')
    expect(body.data[0].category.name).toBe('Lebensmittel')
    expect(body.total).toBe(1)
  })

  it('filters by accountId', async () => {
    await prisma.transaction.createMany({
      data: [
        { date: new Date('2026-04-01'), mainAmount: -10, mainType: 'EXPENSE', description: 'TX1', accountId: SEED.accounts.girokonto, status: 'PENDING' },
        { date: new Date('2026-04-01'), mainAmount: -20, mainType: 'EXPENSE', description: 'TX2', accountId: SEED.accounts.sparkonto, status: 'PENDING' },
      ],
    })
    const res = await GET(createRequest('GET', `/api/transactions?accountId=${SEED.accounts.girokonto}`))
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].description).toBe('TX1')
  })

  it('filters by date range', async () => {
    await prisma.transaction.createMany({
      data: [
        { date: new Date('2026-01-15'), mainAmount: -10, mainType: 'EXPENSE', description: 'Jan', accountId: SEED.accounts.girokonto, status: 'PENDING' },
        { date: new Date('2026-03-15'), mainAmount: -20, mainType: 'EXPENSE', description: 'Mar', accountId: SEED.accounts.girokonto, status: 'PENDING' },
        { date: new Date('2026-06-15'), mainAmount: -30, mainType: 'EXPENSE', description: 'Jun', accountId: SEED.accounts.girokonto, status: 'PENDING' },
      ],
    })
    const res = await GET(createRequest('GET', '/api/transactions?from=2026-02-01&to=2026-04-30'))
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].description).toBe('Mar')
  })

  it('searches in description and payee', async () => {
    await prisma.transaction.createMany({
      data: [
        { date: new Date('2026-04-01'), mainAmount: -10, mainType: 'EXPENSE', description: 'EDEKA Berlin', accountId: SEED.accounts.girokonto, status: 'PENDING' },
        { date: new Date('2026-04-01'), mainAmount: -20, mainType: 'EXPENSE', description: 'Miete', payee: 'Vermieter', accountId: SEED.accounts.girokonto, status: 'PENDING' },
      ],
    })
    const res = await GET(createRequest('GET', '/api/transactions?search=EDEKA'))
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].description).toBe('EDEKA Berlin')
  })

  it('searches within a specific account', async () => {
    await prisma.transaction.createMany({
      data: [
        { date: new Date('2026-04-01'), mainAmount: -10, mainType: 'EXPENSE', description: 'Rewe Einkauf', accountId: SEED.accounts.girokonto, status: 'PENDING' },
        { date: new Date('2026-04-01'), mainAmount: -20, mainType: 'EXPENSE', description: 'Rewe Einkauf', accountId: SEED.accounts.sparkonto, status: 'PENDING' },
        { date: new Date('2026-04-01'), mainAmount: -30, mainType: 'EXPENSE', description: 'Aldi Einkauf', accountId: SEED.accounts.girokonto, status: 'PENDING' },
      ],
    })
    const res = await GET(createRequest('GET', `/api/transactions?accountId=${SEED.accounts.girokonto}&search=Rewe`))
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].description).toBe('Rewe Einkauf')
    expect(body.data[0].accountId).toBe(SEED.accounts.girokonto)
  })

  it('paginates results', async () => {
    for (let i = 0; i < 5; i++) {
      await prisma.transaction.create({
        data: { date: new Date(`2026-04-0${i + 1}`), mainAmount: -10, mainType: 'EXPENSE', description: `TX${i}`, accountId: SEED.accounts.girokonto, status: 'PENDING' },
      })
    }
    const res = await GET(createRequest('GET', '/api/transactions?page=1&pageSize=2'))
    const body = await res.json()
    expect(body.data).toHaveLength(2)
    expect(body.total).toBe(5)
    expect(body.page).toBe(1)
    expect(body.pageSize).toBe(2)
  })

  it('returns all when pageSize=0', async () => {
    for (let i = 0; i < 3; i++) {
      await prisma.transaction.create({
        data: { date: new Date('2026-04-01'), mainAmount: -10, mainType: 'EXPENSE', description: `TX${i}`, accountId: SEED.accounts.girokonto, status: 'PENDING' },
      })
    }
    const res = await GET(createRequest('GET', '/api/transactions?pageSize=0'))
    const body = await res.json()
    expect(body.data).toHaveLength(3)
  })
})

describe('POST /api/transactions', () => {
  it('creates a transaction and updates account balance', async () => {
    const res = await POST(createRequest('POST', '/api/transactions', {
      date: '2026-04-01',
      mainAmount: -100,
      mainType: 'EXPENSE',
      description: 'Einkauf',
      accountId: SEED.accounts.girokonto,
      categoryId: SEED.categories.lebensmittel,
    }))
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.description).toBe('Einkauf')
    expect(data.mainAmount).toBe(-100)

    // Verify balance was updated: 1000 + (-100) = 900
    const account = await prisma.account.findUnique({ where: { id: SEED.accounts.girokonto } })
    expect(account!.currentBalance).toBe(900)
  })

  it('creates income and increases balance', async () => {
    const res = await POST(createRequest('POST', '/api/transactions', {
      date: '2026-04-01',
      mainAmount: 3000,
      mainType: 'INCOME',
      description: 'Gehalt',
      accountId: SEED.accounts.girokonto,
      categoryId: SEED.categories.gehalt,
    }))
    expect(res.status).toBe(201)

    const account = await prisma.account.findUnique({ where: { id: SEED.accounts.girokonto } })
    expect(account!.currentBalance).toBe(4000) // 1000 + 3000
  })

  it('applies default status PENDING', async () => {
    const res = await POST(createRequest('POST', '/api/transactions', {
      date: '2026-04-01',
      mainAmount: -10,
      mainType: 'EXPENSE',
      description: 'Test',
      accountId: SEED.accounts.girokonto,
    }))
    const data = await res.json()
    expect(data.status).toBe('PENDING')
  })

  it('rejects missing required fields', async () => {
    const res = await POST(createRequest('POST', '/api/transactions', {
      mainAmount: -50,
    }))
    expect(res.status).toBe(400)
  })

  it('handles floating-point amounts correctly', async () => {
    const res = await POST(createRequest('POST', '/api/transactions', {
      date: '2026-04-01',
      mainAmount: -0.1,
      mainType: 'EXPENSE',
      description: 'Cent test',
      accountId: SEED.accounts.girokonto,
    }))
    expect(res.status).toBe(201)
    // balanceIncrement rounds: 1000 + (-0.1) = 999.9
    const account = await prisma.account.findUnique({ where: { id: SEED.accounts.girokonto } })
    expect(account!.currentBalance).toBe(999.9)
  })
})

describe('PUT /api/transactions/[id]', () => {
  it('updates transaction fields', async () => {
    const tx = await prisma.transaction.create({
      data: {
        date: new Date('2026-04-01'),
        mainAmount: -50,
        mainType: 'EXPENSE',
        description: 'Original',
        accountId: SEED.accounts.girokonto,
        status: 'PENDING',
      },
    })
    const res = await PUT(
      createRequest('PUT', `/api/transactions/${tx.id}`, {
        description: 'Updated',
        status: 'CLEARED',
      }),
      createParams({ id: tx.id }),
    )
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.description).toBe('Updated')
    expect(data.status).toBe('CLEARED')
  })

  it('updates balance when mainAmount changes', async () => {
    // Create via POST to get correct initial balance
    const createRes = await POST(createRequest('POST', '/api/transactions', {
      date: '2026-04-01',
      mainAmount: -100,
      mainType: 'EXPENSE',
      description: 'To update',
      accountId: SEED.accounts.girokonto,
    }))
    const created = await createRes.json()
    // Balance is now 900

    const res = await PUT(
      createRequest('PUT', `/api/transactions/${created.id}`, {
        mainAmount: -50,
      }),
      createParams({ id: created.id }),
    )
    expect(res.status).toBe(200)

    // Balance should be: 900 + ((-50) - (-100)) = 900 + 50 = 950
    const account = await prisma.account.findUnique({ where: { id: SEED.accounts.girokonto } })
    expect(account!.currentBalance).toBe(950)
  })

  it('returns 404 for nonexistent transaction', async () => {
    const res = await PUT(
      createRequest('PUT', '/api/transactions/nonexistent', {
        description: 'nope',
      }),
      createParams({ id: 'nonexistent' }),
    )
    expect(res.status).toBe(404)
  })
})

describe('PUT /api/transactions/[id] — Sub-Only transfer sync', () => {
  it('syncs paired transaction when editing a Sub-Only transfer', async () => {
    // Create Sub-Only transfer pair: source on giro, target on spar
    const sourceTx = await prisma.transaction.create({
      data: {
        date: new Date('2026-04-01'),
        mainAmount: null,
        mainType: 'TRANSFER',
        subAmount: -200,
        subType: 'EXPENSE',
        description: 'Transfer test',
        accountId: SEED.accounts.girokonto,
        status: 'CLEARED',
      },
    })
    const targetTx = await prisma.transaction.create({
      data: {
        date: new Date('2026-04-01'),
        mainAmount: null,
        mainType: 'TRANSFER',
        subAmount: 200,
        subType: 'INCOME',
        description: 'Transfer test',
        accountId: SEED.accounts.sparkonto,
        status: 'CLEARED',
      },
    })
    // Link source → target
    await prisma.transaction.update({
      where: { id: sourceTx.id },
      data: { transferToId: targetTx.id },
    })
    // Adjust balances for the initial transfer
    await prisma.account.update({
      where: { id: SEED.accounts.girokonto },
      data: { currentBalance: 800 }, // 1000 - 200
    })
    await prisma.account.update({
      where: { id: SEED.accounts.sparkonto },
      data: { currentBalance: 5200 }, // 5000 + 200
    })

    // Edit source TX: change amount from -200 to -300
    const res = await PUT(
      createRequest('PUT', `/api/transactions/${sourceTx.id}`, {
        subAmount: -300,
      }),
      createParams({ id: sourceTx.id }),
    )
    expect(res.status).toBe(200)

    // Source TX should have -300
    const updatedSource = await prisma.transaction.findUnique({ where: { id: sourceTx.id } })
    expect(updatedSource!.subAmount).toBe(-300)

    // Target TX should be synced to +300
    const updatedTarget = await prisma.transaction.findUnique({ where: { id: targetTx.id } })
    expect(updatedTarget!.subAmount).toBe(300)

    // Balances: giro went from 800 to 700 (-100 diff), spar from 5200 to 5300 (+100 diff)
    const giro = await prisma.account.findUnique({ where: { id: SEED.accounts.girokonto } })
    expect(giro!.currentBalance).toBe(700)
    const spar = await prisma.account.findUnique({ where: { id: SEED.accounts.sparkonto } })
    expect(spar!.currentBalance).toBe(5300)
  })

  it('syncs via reverse lookup when editing the target side', async () => {
    // Create pair: source → target
    const sourceTx = await prisma.transaction.create({
      data: {
        date: new Date('2026-04-01'),
        mainAmount: null,
        mainType: 'TRANSFER',
        subAmount: -150,
        subType: 'EXPENSE',
        description: 'Reverse test',
        accountId: SEED.accounts.girokonto,
        status: 'CLEARED',
      },
    })
    const targetTx = await prisma.transaction.create({
      data: {
        date: new Date('2026-04-01'),
        mainAmount: null,
        mainType: 'TRANSFER',
        subAmount: 150,
        subType: 'INCOME',
        description: 'Reverse test',
        accountId: SEED.accounts.sparkonto,
        status: 'CLEARED',
      },
    })
    await prisma.transaction.update({
      where: { id: sourceTx.id },
      data: { transferToId: targetTx.id },
    })
    await prisma.account.update({
      where: { id: SEED.accounts.girokonto },
      data: { currentBalance: 850 },
    })
    await prisma.account.update({
      where: { id: SEED.accounts.sparkonto },
      data: { currentBalance: 5150 },
    })

    // Edit TARGET TX (has no transferToId, needs reverse lookup)
    const res = await PUT(
      createRequest('PUT', `/api/transactions/${targetTx.id}`, {
        subAmount: 250,
      }),
      createParams({ id: targetTx.id }),
    )
    expect(res.status).toBe(200)

    // Target should be 250
    const updatedTarget = await prisma.transaction.findUnique({ where: { id: targetTx.id } })
    expect(updatedTarget!.subAmount).toBe(250)

    // Source should be synced to -250
    const updatedSource = await prisma.transaction.findUnique({ where: { id: sourceTx.id } })
    expect(updatedSource!.subAmount).toBe(-250)

    // Balances: spar from 5150 to 5250 (+100), giro from 850 to 750 (-100)
    const spar = await prisma.account.findUnique({ where: { id: SEED.accounts.sparkonto } })
    expect(spar!.currentBalance).toBe(5250)
    const giro = await prisma.account.findUnique({ where: { id: SEED.accounts.girokonto } })
    expect(giro!.currentBalance).toBe(750)
  })
})

describe('DELETE /api/transactions/[id]', () => {
  it('deletes transaction and reverses balance', async () => {
    // Create via POST
    const createRes = await POST(createRequest('POST', '/api/transactions', {
      date: '2026-04-01',
      mainAmount: -200,
      mainType: 'EXPENSE',
      description: 'To delete',
      accountId: SEED.accounts.girokonto,
    }))
    const created = await createRes.json()
    // Balance is now 800

    const res = await DELETE(
      createRequest('DELETE', `/api/transactions/${created.id}`),
      createParams({ id: created.id }),
    )
    expect(res.status).toBe(200)

    // Balance should be restored: 800 - (-200) = 1000
    const account = await prisma.account.findUnique({ where: { id: SEED.accounts.girokonto } })
    expect(account!.currentBalance).toBe(1000)

    // Transaction should be gone
    const tx = await prisma.transaction.findUnique({ where: { id: created.id } })
    expect(tx).toBeNull()
  })

  it('returns 404 for nonexistent transaction', async () => {
    const res = await DELETE(
      createRequest('DELETE', '/api/transactions/nonexistent'),
      createParams({ id: 'nonexistent' }),
    )
    expect(res.status).toBe(404)
  })
})
