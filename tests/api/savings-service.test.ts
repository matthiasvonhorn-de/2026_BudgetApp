import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import {
  createSavings,
  payEntries,
  unpayEntry,
  extendSavings,
  deleteSavings,
} from '@/lib/savings/service'
import { prisma } from '@/lib/prisma'
import { seedDatabase, SEED } from './seed'

let savingsAccountId: string

beforeAll(async () => {
  await seedDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

async function cleanSavingsData() {
  await prisma.savingsEntry.deleteMany()
  await prisma.savingsConfig.deleteMany()
  await prisma.transaction.deleteMany({
    where: { account: { type: { in: ['SPARPLAN', 'FESTGELD'] } } },
  })
  // Also clean giro transactions created by payEntries
  await prisma.transaction.deleteMany({
    where: { accountId: SEED.accounts.girokonto },
  })
  await prisma.account.deleteMany({
    where: { type: { in: ['SPARPLAN', 'FESTGELD'] } },
  })
  // Restore girokonto balance (may be changed by payEntries tests)
  await prisma.account.update({
    where: { id: SEED.accounts.girokonto },
    data: { currentBalance: 1000 },
  })
}

beforeEach(async () => {
  await cleanSavingsData()

  // Create a fresh SPARPLAN for each test.
  // Use a future start date so entries are NOT auto-initialized as paid.
  // Today is 2026-04-08, so startDate in June 2026 ensures entries are unpaid.
  const result = await createSavings({
    name: 'Test Sparplan',
    savingsType: 'SPARPLAN',
    startDate: '2026-06-01',
    interestRate: 0.03,
    interestFrequency: 'MONTHLY',
    contributionAmount: 100,
    contributionFrequency: 'MONTHLY',
    linkedAccountId: SEED.accounts.girokonto,
    color: '#10b981',
  })
  savingsAccountId = result.account.id
})

describe('payEntries', () => {
  it('marks unpaid entries as paid and creates transactions', async () => {
    // Pay entries through August 2026 (covers Jun + Jul + Aug entries)
    const result = await payEntries(savingsAccountId, '2026-08-31')
    expect(result.paid).toBeGreaterThan(0)

    // Verify entries are marked as paid with transaction IDs
    const paidEntries = await prisma.savingsEntry.findMany({
      where: {
        savingsConfig: { accountId: savingsAccountId },
        paidAt: { not: null },
        transactionId: { not: null },
      },
    })
    expect(paidEntries.length).toBe(result.paid)

    // Verify transactions were created on savings account
    const savingsTxs = await prisma.transaction.findMany({
      where: { accountId: savingsAccountId },
    })
    expect(savingsTxs.length).toBeGreaterThan(0)
  })

  it('creates counter-transactions on linked account for contributions', async () => {
    await payEntries(savingsAccountId, '2026-08-31')

    // Contributions should create a counter-transaction on the girokonto
    const giroTxs = await prisma.transaction.findMany({
      where: { accountId: SEED.accounts.girokonto },
    })
    // Should have at least the contribution counter-transactions
    const contribTxs = giroTxs.filter(tx => tx.description.includes('Sparrate'))
    expect(contribTxs.length).toBeGreaterThan(0)
    // Each should be negative (money leaving girokonto)
    for (const tx of contribTxs) {
      expect(tx.mainAmount).toBeLessThan(0)
    }
  })

  it('updates account balances correctly', async () => {
    const before = await prisma.account.findUnique({
      where: { id: savingsAccountId },
    })

    await payEntries(savingsAccountId, '2026-07-31')

    const after = await prisma.account.findUnique({
      where: { id: savingsAccountId },
    })
    // Balance should have increased (contributions + interest)
    expect(after!.currentBalance).toBeGreaterThan(before!.currentBalance)
  })

  it('is idempotent — paying already-paid entries does nothing', async () => {
    const first = await payEntries(savingsAccountId, '2026-07-31')
    expect(first.paid).toBeGreaterThan(0)

    const second = await payEntries(savingsAccountId, '2026-07-31')
    expect(second.paid).toBe(0)
  })

  it('throws 404 for non-existent savings account', async () => {
    await expect(
      payEntries('nonexistent-id', '2026-07-31')
    ).rejects.toThrow('Not found')
  })
})

describe('unpayEntry', () => {
  it('reverses a paid entry and deletes transactions', async () => {
    // First pay some entries
    await payEntries(savingsAccountId, '2026-07-31')

    // Find a paid entry with a transaction
    const paidEntry = await prisma.savingsEntry.findFirst({
      where: {
        savingsConfig: { accountId: savingsAccountId },
        paidAt: { not: null },
        transactionId: { not: null },
      },
    })
    expect(paidEntry).not.toBeNull()

    const balanceBefore = (await prisma.account.findUnique({
      where: { id: savingsAccountId },
    }))!.currentBalance

    await unpayEntry(savingsAccountId, paidEntry!.id)

    // Entry should be unpaid
    const updated = await prisma.savingsEntry.findUnique({
      where: { id: paidEntry!.id },
    })
    expect(updated!.paidAt).toBeNull()
    expect(updated!.transactionId).toBeNull()

    // Balance should have decreased
    const balanceAfter = (await prisma.account.findUnique({
      where: { id: savingsAccountId },
    }))!.currentBalance
    expect(balanceAfter).toBeLessThan(balanceBefore)
  })

  it('reverses giro counter-transaction for contributions', async () => {
    await payEntries(savingsAccountId, '2026-07-31')

    // Find a paid contribution entry
    const paidContrib = await prisma.savingsEntry.findFirst({
      where: {
        savingsConfig: { accountId: savingsAccountId },
        paidAt: { not: null },
        transactionId: { not: null },
        giroTransactionId: { not: null },
        entryType: 'CONTRIBUTION',
      },
    })
    expect(paidContrib).not.toBeNull()

    const giroBefore = (await prisma.account.findUnique({
      where: { id: SEED.accounts.girokonto },
    }))!.currentBalance

    await unpayEntry(savingsAccountId, paidContrib!.id)

    // Giro balance should be restored (increased, since the deduction was reversed)
    const giroAfter = (await prisma.account.findUnique({
      where: { id: SEED.accounts.girokonto },
    }))!.currentBalance
    expect(giroAfter).toBeGreaterThan(giroBefore)
  })

  it('throws 404 for wrong accountId', async () => {
    await payEntries(savingsAccountId, '2026-07-31')

    const paidEntry = await prisma.savingsEntry.findFirst({
      where: {
        savingsConfig: { accountId: savingsAccountId },
        paidAt: { not: null },
        transactionId: { not: null },
      },
    })
    expect(paidEntry).not.toBeNull()

    await expect(
      unpayEntry('nonexistent-id', paidEntry!.id)
    ).rejects.toThrow('Not found')
  })

  it('throws 400 for unpaid entry', async () => {
    // Find an unpaid entry (future entries are unpaid)
    const unpaidEntry = await prisma.savingsEntry.findFirst({
      where: {
        savingsConfig: { accountId: savingsAccountId },
        paidAt: null,
      },
    })
    expect(unpaidEntry).not.toBeNull()

    await expect(
      unpayEntry(savingsAccountId, unpaidEntry!.id)
    ).rejects.toThrow('Not paid')
  })
})

describe('extendSavings', () => {
  it('adds more schedule entries for SPARPLAN', async () => {
    const entriesBefore = await prisma.savingsEntry.count({
      where: { savingsConfig: { accountId: savingsAccountId } },
    })

    const result = await extendSavings(savingsAccountId, 48)
    expect(result.added).toBeGreaterThan(0)

    const entriesAfter = await prisma.savingsEntry.count({
      where: { savingsConfig: { accountId: savingsAccountId } },
    })
    expect(entriesAfter).toBe(entriesBefore + result.added)
  })

  it('is idempotent when entries already cover the horizon', async () => {
    // Extend to 48 months first
    await extendSavings(savingsAccountId, 48)

    // Extending again with same or shorter horizon should add nothing
    const result = await extendSavings(savingsAccountId, 12)
    expect(result.added).toBe(0)
  })

  it('throws 400 for FESTGELD with termMonths', async () => {
    // Create a FESTGELD savings
    const festgeld = await createSavings({
      name: 'Test Festgeld',
      savingsType: 'FESTGELD',
      startDate: '2026-06-01',
      interestRate: 0.035,
      interestFrequency: 'ANNUALLY',
      termMonths: 12,
      color: '#6366f1',
    })

    await expect(
      extendSavings(festgeld.account.id, 24)
    ).rejects.toThrow('Festlaufzeit-Konten können nicht verlängert werden')
  })

  it('throws 404 for non-existent savings account', async () => {
    await expect(
      extendSavings('nonexistent-id', 24)
    ).rejects.toThrow('Not found')
  })
})

describe('deleteSavings', () => {
  it('soft-deletes by setting isActive to false', async () => {
    await deleteSavings(savingsAccountId)

    const account = await prisma.account.findUnique({
      where: { id: savingsAccountId },
    })
    expect(account).not.toBeNull()
    expect(account!.isActive).toBe(false)
  })

  it('savings data remains after soft-delete', async () => {
    await deleteSavings(savingsAccountId)

    // Config and entries should still exist
    const config = await prisma.savingsConfig.findUnique({
      where: { accountId: savingsAccountId },
    })
    expect(config).not.toBeNull()

    const entries = await prisma.savingsEntry.findMany({
      where: { savingsConfigId: config!.id },
    })
    expect(entries.length).toBeGreaterThan(0)
  })
})
