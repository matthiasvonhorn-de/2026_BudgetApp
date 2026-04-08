import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { POST } from '@/app/api/accounts/[id]/reconcile/route'
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
  await prisma.reconciliation.deleteMany()
  await prisma.transaction.deleteMany()
  await prisma.account.update({
    where: { id: SEED.accounts.girokonto },
    data: { currentBalance: 1000 },
  })
})

describe('POST /api/accounts/[id]/reconcile', () => {
  it('reconciles transactions and creates reconciliation record', async () => {
    // Setup: 2 CLEARED transactions for girokonto
    const tx1 = await prisma.transaction.create({
      data: {
        date: new Date('2026-04-01'),
        mainAmount: -100,
        mainType: 'EXPENSE',
        description: 'Einkauf 1',
        accountId: SEED.accounts.girokonto,
        status: 'CLEARED',
      },
    })
    const tx2 = await prisma.transaction.create({
      data: {
        date: new Date('2026-04-02'),
        mainAmount: -200,
        mainType: 'EXPENSE',
        description: 'Einkauf 2',
        accountId: SEED.accounts.girokonto,
        status: 'CLEARED',
      },
    })

    const res = await POST(
      createRequest('POST', `/api/accounts/${SEED.accounts.girokonto}/reconcile`, {
        statementBalance: 700,
        clearedTransactionIds: [tx1.id, tx2.id],
      }),
      createParams({ id: SEED.accounts.girokonto }),
    )
    const data = await res.json()
    expect(res.status).toBe(200)

    // Verify transactions are RECONCILED
    const updatedTx1 = await prisma.transaction.findUnique({ where: { id: tx1.id } })
    const updatedTx2 = await prisma.transaction.findUnique({ where: { id: tx2.id } })
    expect(updatedTx1!.status).toBe('RECONCILED')
    expect(updatedTx1!.isReconciled).toBe(true)
    expect(updatedTx2!.status).toBe('RECONCILED')
    expect(updatedTx2!.isReconciled).toBe(true)

    // Verify reconciliation record exists
    expect(data.reconciliation).toBeDefined()
    expect(data.reconciliation.accountId).toBe(SEED.accounts.girokonto)
    expect(data.reconciliation.statementBalance).toBe(700)

    // Verify account balance updated
    const account = await prisma.account.findUnique({ where: { id: SEED.accounts.girokonto } })
    expect(account!.currentBalance).toBe(700)
  })

  it('returns correct difference between statement and cleared balance', async () => {
    const tx1 = await prisma.transaction.create({
      data: {
        date: new Date('2026-04-01'),
        mainAmount: -100,
        mainType: 'EXPENSE',
        description: 'Einkauf',
        accountId: SEED.accounts.girokonto,
        status: 'CLEARED',
      },
    })

    const res = await POST(
      createRequest('POST', `/api/accounts/${SEED.accounts.girokonto}/reconcile`, {
        statementBalance: 500,
        clearedTransactionIds: [tx1.id],
      }),
      createParams({ id: SEED.accounts.girokonto }),
    )
    const data = await res.json()
    expect(res.status).toBe(200)

    // clearedBalance = SUM(mainAmount + subAmount) of all reconciled TXs = -100
    // difference = statementBalance - clearedBalance = 500 - (-100) = 600
    expect(data.reconciliation.clearedBalance).toBe(-100)
    expect(data.difference).toBe(600)
  })

  it('rejects invalid body with 400', async () => {
    const res = await POST(
      createRequest('POST', `/api/accounts/${SEED.accounts.girokonto}/reconcile`, {
        invalid: true,
      }),
      createParams({ id: SEED.accounts.girokonto }),
    )
    expect(res.status).toBe(400)
  })
})
