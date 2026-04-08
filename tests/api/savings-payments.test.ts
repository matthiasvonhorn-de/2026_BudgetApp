import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { POST as payRoute } from '@/app/api/savings/[id]/pay/route'
import { POST as extendRoute } from '@/app/api/savings/[id]/extend/route'
import { DELETE as unpayRoute } from '@/app/api/savings/[id]/entries/[entryId]/pay/route'
import { seedDatabase, SEED } from './seed'
import { createRequest, createParams } from './helpers'
import { prisma } from '@/lib/prisma'
import { createSavings, getSavingsDetail } from '@/lib/savings/service'

let savingsAccountId: string

beforeAll(async () => {
  await seedDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

beforeEach(async () => {
  // Clean previous savings data (children first to avoid FK violations)
  await prisma.savingsEntry.deleteMany()
  await prisma.savingsConfig.deleteMany()
  // Delete transactions on savings accounts AND any giro counter-transactions
  const savingsAccounts = await prisma.account.findMany({
    where: { type: { in: ['SPARPLAN', 'FESTGELD'] } },
    select: { id: true },
  })
  if (savingsAccounts.length > 0) {
    await prisma.transaction.deleteMany({
      where: { accountId: { in: savingsAccounts.map(a => a.id) } },
    })
  }
  // Delete giro transactions created by pay operations
  await prisma.transaction.deleteMany({
    where: { accountId: SEED.accounts.girokonto },
  })
  await prisma.account.deleteMany({ where: { type: { in: ['SPARPLAN', 'FESTGELD'] } } })

  // Reset girokonto balance (payEntries may have decremented it)
  await prisma.account.update({
    where: { id: SEED.accounts.girokonto },
    data: { currentBalance: 1000 },
  })

  const result = await createSavings({
    name: 'Test Sparplan',
    savingsType: 'SPARPLAN',
    startDate: '2026-01-01',
    interestRate: 3,
    interestFrequency: 'MONTHLY',
    contributionAmount: 100,
    contributionFrequency: 'MONTHLY',
    linkedAccountId: SEED.accounts.girokonto,
    color: '#10b981',
  })
  savingsAccountId = result.account.id
})

// ── POST /api/savings/[id]/pay ────────────────────────────────────────

describe('POST /api/savings/[id]/pay', () => {
  it('pays unpaid entries up to the given date', async () => {
    // First, reset all entries to unpaid so we have a known state
    await prisma.savingsEntry.updateMany({
      where: { savingsConfig: { accountId: savingsAccountId } },
      data: { paidAt: null, transactionId: null, giroTransactionId: null },
    })

    const res = await payRoute(
      createRequest('POST', `/api/savings/${savingsAccountId}/pay`, {
        paidUntil: '2026-03-01',
      }),
      createParams({ id: savingsAccountId }),
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.paid).toBeGreaterThan(0)

    // Verify entries are now marked as paid
    const paidEntries = await prisma.savingsEntry.findMany({
      where: {
        savingsConfig: { accountId: savingsAccountId },
        paidAt: { not: null },
        transactionId: { not: null },
      },
    })
    expect(paidEntries.length).toBe(data.paid)
  })

  it('creates transactions on the savings account', async () => {
    await prisma.savingsEntry.updateMany({
      where: { savingsConfig: { accountId: savingsAccountId } },
      data: { paidAt: null, transactionId: null, giroTransactionId: null },
    })

    await payRoute(
      createRequest('POST', `/api/savings/${savingsAccountId}/pay`, {
        paidUntil: '2026-02-01',
      }),
      createParams({ id: savingsAccountId }),
    )

    const txs = await prisma.transaction.findMany({
      where: { accountId: savingsAccountId },
    })
    expect(txs.length).toBeGreaterThan(0)
    // All savings transactions should be CLEARED
    expect(txs.every(t => t.status === 'CLEARED')).toBe(true)
  })

  it('creates counter-transactions on linked girokonto for contributions', async () => {
    await prisma.savingsEntry.updateMany({
      where: { savingsConfig: { accountId: savingsAccountId } },
      data: { paidAt: null, transactionId: null, giroTransactionId: null },
    })

    await payRoute(
      createRequest('POST', `/api/savings/${savingsAccountId}/pay`, {
        paidUntil: '2026-02-01',
      }),
      createParams({ id: savingsAccountId }),
    )

    // Contribution entries should have created giro transactions
    const paidContribs = await prisma.savingsEntry.findMany({
      where: {
        savingsConfig: { accountId: savingsAccountId },
        entryType: 'CONTRIBUTION',
        giroTransactionId: { not: null },
      },
    })
    expect(paidContribs.length).toBeGreaterThan(0)

    // Verify the giro transactions exist
    const giroTxs = await prisma.transaction.findMany({
      where: { accountId: SEED.accounts.girokonto },
    })
    expect(giroTxs.length).toBeGreaterThanOrEqual(paidContribs.length)
  })

  it('returns { paid: 0 } when no unpaid entries are due', async () => {
    // All entries up to now are already initialized (marked paid) by createSavings
    // Pay a date before the start → nothing to pay
    const res = await payRoute(
      createRequest('POST', `/api/savings/${savingsAccountId}/pay`, {
        paidUntil: '2025-12-01',
      }),
      createParams({ id: savingsAccountId }),
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.paid).toBe(0)
  })

  it('returns 404 for non-existent savings', async () => {
    const res = await payRoute(
      createRequest('POST', '/api/savings/nonexistent-id/pay', {
        paidUntil: '2026-03-01',
      }),
      createParams({ id: 'nonexistent-id' }),
    )

    expect(res.status).toBe(404)
  })

  it('returns 400 for missing paidUntil field', async () => {
    const res = await payRoute(
      createRequest('POST', `/api/savings/${savingsAccountId}/pay`, {}),
      createParams({ id: savingsAccountId }),
    )

    expect(res.status).toBe(400)
  })
})

// ── POST /api/savings/[id]/extend ─────────────────────────────────────

describe('POST /api/savings/[id]/extend', () => {
  it('extends a SPARPLAN by adding new entries', async () => {
    const detailBefore = await getSavingsDetail(savingsAccountId)
    const entriesBefore = detailBefore.entries.length

    // Use 48 months to go well beyond the default 24-month horizon
    const res = await extendRoute(
      createRequest('POST', `/api/savings/${savingsAccountId}/extend`, {
        months: 48,
      }),
      createParams({ id: savingsAccountId }),
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.added).toBeGreaterThan(0)

    // Verify entries were actually added
    const detailAfter = await getSavingsDetail(savingsAccountId)
    expect(detailAfter.entries.length).toBeGreaterThan(entriesBefore)
  })

  it('uses default 24 months when no body is provided', async () => {
    const res = await extendRoute(
      createRequest('POST', `/api/savings/${savingsAccountId}/extend`),
      createParams({ id: savingsAccountId }),
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    // Default 24 months — should add entries (or return 0 if already covered)
    expect(typeof data.added).toBe('number')
  })

  it('rejects FESTGELD with 400', async () => {
    // Create a FESTGELD account
    const festgeld = await createSavings({
      name: 'Test Festgeld',
      savingsType: 'FESTGELD',
      startDate: '2026-01-01',
      interestRate: 3.5,
      interestFrequency: 'ANNUALLY',
      initialBalance: 10000,
      termMonths: 12,
      color: '#6366f1',
    })

    const res = await extendRoute(
      createRequest('POST', `/api/savings/${festgeld.account.id}/extend`, {
        months: 12,
      }),
      createParams({ id: festgeld.account.id }),
    )

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBeDefined()
  })

  it('returns 404 for non-existent savings', async () => {
    const res = await extendRoute(
      createRequest('POST', '/api/savings/nonexistent-id/extend', {
        months: 12,
      }),
      createParams({ id: 'nonexistent-id' }),
    )

    expect(res.status).toBe(404)
  })

  it('is idempotent when entries already cover the horizon', async () => {
    // Extend once
    await extendRoute(
      createRequest('POST', `/api/savings/${savingsAccountId}/extend`, {
        months: 6,
      }),
      createParams({ id: savingsAccountId }),
    )

    // Extend again with the same horizon — should add 0
    const res = await extendRoute(
      createRequest('POST', `/api/savings/${savingsAccountId}/extend`, {
        months: 6,
      }),
      createParams({ id: savingsAccountId }),
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.added).toBe(0)
  })
})

// ── DELETE /api/savings/[id]/entries/[entryId]/pay ─────────────────────

describe('DELETE /api/savings/[id]/entries/[entryId]/pay', () => {
  it('unpays a paid entry and removes its transactions', async () => {
    // Reset and pay one entry first
    await prisma.savingsEntry.updateMany({
      where: { savingsConfig: { accountId: savingsAccountId } },
      data: { paidAt: null, transactionId: null, giroTransactionId: null },
    })

    await payRoute(
      createRequest('POST', `/api/savings/${savingsAccountId}/pay`, {
        paidUntil: '2026-02-01',
      }),
      createParams({ id: savingsAccountId }),
    )

    // Get a paid entry
    const paidEntry = await prisma.savingsEntry.findFirst({
      where: {
        savingsConfig: { accountId: savingsAccountId },
        paidAt: { not: null },
        transactionId: { not: null },
      },
    })
    expect(paidEntry).not.toBeNull()

    const res = await unpayRoute(
      createRequest('DELETE', `/api/savings/${savingsAccountId}/entries/${paidEntry!.id}/pay`),
      createParams({ id: savingsAccountId, entryId: paidEntry!.id }),
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)

    // Verify entry is now unpaid
    const updated = await prisma.savingsEntry.findUnique({
      where: { id: paidEntry!.id },
    })
    expect(updated!.paidAt).toBeNull()
    expect(updated!.transactionId).toBeNull()
  })

  it('removes the savings transaction when unpaying', async () => {
    await prisma.savingsEntry.updateMany({
      where: { savingsConfig: { accountId: savingsAccountId } },
      data: { paidAt: null, transactionId: null, giroTransactionId: null },
    })

    await payRoute(
      createRequest('POST', `/api/savings/${savingsAccountId}/pay`, {
        paidUntil: '2026-02-01',
      }),
      createParams({ id: savingsAccountId }),
    )

    const paidEntry = await prisma.savingsEntry.findFirst({
      where: {
        savingsConfig: { accountId: savingsAccountId },
        paidAt: { not: null },
        transactionId: { not: null },
      },
    })
    const txId = paidEntry!.transactionId!

    await unpayRoute(
      createRequest('DELETE', `/api/savings/${savingsAccountId}/entries/${paidEntry!.id}/pay`),
      createParams({ id: savingsAccountId, entryId: paidEntry!.id }),
    )

    // Transaction should be deleted
    const tx = await prisma.transaction.findUnique({ where: { id: txId } })
    expect(tx).toBeNull()
  })

  it('returns 404 for non-existent entry', async () => {
    const res = await unpayRoute(
      createRequest('DELETE', `/api/savings/${savingsAccountId}/entries/nonexistent-entry/pay`),
      createParams({ id: savingsAccountId, entryId: 'nonexistent-entry' }),
    )

    expect(res.status).toBe(404)
  })

  it('returns 404 when entry belongs to a different savings account', async () => {
    // Create another savings account
    const other = await createSavings({
      name: 'Other Sparplan',
      savingsType: 'SPARPLAN',
      startDate: '2026-01-01',
      interestRate: 2,
      interestFrequency: 'MONTHLY',
      contributionAmount: 50,
      contributionFrequency: 'MONTHLY',
      color: '#ef4444',
    })

    // Get an entry from the other account
    const otherEntry = await prisma.savingsEntry.findFirst({
      where: { savingsConfig: { accountId: other.account.id } },
    })
    expect(otherEntry).not.toBeNull()

    // Try to unpay it using the wrong savings account ID
    const res = await unpayRoute(
      createRequest('DELETE', `/api/savings/${savingsAccountId}/entries/${otherEntry!.id}/pay`),
      createParams({ id: savingsAccountId, entryId: otherEntry!.id }),
    )

    expect(res.status).toBe(404)
  })
})
