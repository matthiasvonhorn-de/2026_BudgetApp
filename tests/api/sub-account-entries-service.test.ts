import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { createLinkedEntry, updateLinkedEntry, deleteLinkedEntry } from '@/lib/sub-account-entries/service'
import { prisma } from '@/lib/prisma'
import { seedDatabase, SEED } from './seed'
import { cleanTable } from './helpers'

beforeAll(async () => {
  await seedDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

afterEach(async () => {
  // Delete transactions first (they hold FK to subAccountEntry)
  await prisma.transaction.deleteMany({
    where: { accountId: SEED.accounts.sparkonto },
  })
  await cleanTable('subAccountEntry')
  await prisma.account.update({
    where: { id: SEED.accounts.sparkonto },
    data: { currentBalance: 5000 },
  })
})

describe('createLinkedEntry', () => {
  it('creates entry and linked transaction', async () => {
    const result = await createLinkedEntry({
      groupId: SEED.subAccountGroups.sparGroup1,
      date: '2026-04-01',
      description: 'Test Rücklage',
      amount: 200,
    })

    expect(result.entry).toBeDefined()
    expect(result.entry.amount).toBe(200)
    expect(result.entry.description).toBe('Test Rücklage')
    expect(result.entry.groupId).toBe(SEED.subAccountGroups.sparGroup1)

    expect(result.transaction).toBeDefined()
    expect(result.transaction.mainAmount).toBeNull()
    expect(result.transaction.subAmount).toBe(200)
    expect(result.transaction.subType).toBe('INCOME')
    expect(result.transaction.accountId).toBe(SEED.accounts.sparkonto)
  })

  it('updates account balance by subAmount', async () => {
    await createLinkedEntry({
      groupId: SEED.subAccountGroups.sparGroup1,
      date: '2026-04-01',
      description: 'Balance test',
      amount: 150,
    })

    const account = await prisma.account.findUnique({
      where: { id: SEED.accounts.sparkonto },
    })
    expect(account!.currentBalance).toBe(5150)
  })

  it('handles negative amounts (expense)', async () => {
    const result = await createLinkedEntry({
      groupId: SEED.subAccountGroups.sparGroup1,
      date: '2026-04-01',
      description: 'Ausgabe',
      amount: -100,
    })

    expect(result.transaction.subAmount).toBe(-100)
    expect(result.transaction.subType).toBe('EXPENSE')

    const account = await prisma.account.findUnique({
      where: { id: SEED.accounts.sparkonto },
    })
    expect(account!.currentBalance).toBe(4900)
  })

  it('throws 404 for non-existent group', async () => {
    await expect(
      createLinkedEntry({
        groupId: 'nonexistent-group',
        date: '2026-04-01',
        description: 'Should fail',
        amount: 100,
      })
    ).rejects.toThrow('Gruppe nicht gefunden')
  })

  it('throws 400 for category not belonging to group', async () => {
    // Create a category linked to a different group (or no group)
    const otherCategory = await prisma.category.create({
      data: {
        name: 'Other Category',
        type: 'EXPENSE',
        groupId: SEED.groups.giroFixkosten,
        subAccountGroupId: null,
      },
    })

    await expect(
      createLinkedEntry({
        groupId: SEED.subAccountGroups.sparGroup1,
        date: '2026-04-01',
        description: 'Should fail',
        amount: 100,
        categoryId: otherCategory.id,
      })
    ).rejects.toThrow('Kategorie gehört nicht zu dieser Gruppe')

    // cleanup
    await prisma.category.delete({ where: { id: otherCategory.id } })
  })

  it('sets fromBudget when specified', async () => {
    const result = await createLinkedEntry({
      groupId: SEED.subAccountGroups.sparGroup1,
      date: '2026-04-01',
      description: 'Budget entry',
      amount: 50,
      fromBudget: true,
    })

    expect(result.entry.fromBudget).toBe(true)
  })
})

describe('updateLinkedEntry', () => {
  it('updates amount and adjusts balance diff', async () => {
    const { entry } = await createLinkedEntry({
      groupId: SEED.subAccountGroups.sparGroup1,
      date: '2026-04-01',
      description: 'Original',
      amount: 200,
    })
    // Balance after create: 5000 + 200 = 5200

    const result = await updateLinkedEntry(entry.id, { amount: 300 })
    expect(result.entry.amount).toBe(300)
    expect(result.transaction.subAmount).toBe(300)

    const account = await prisma.account.findUnique({
      where: { id: SEED.accounts.sparkonto },
    })
    // Balance: 5200 + (300 - 200) = 5300
    expect(account!.currentBalance).toBe(5300)
  })

  it('updates description without changing balance', async () => {
    const { entry } = await createLinkedEntry({
      groupId: SEED.subAccountGroups.sparGroup1,
      date: '2026-04-01',
      description: 'Old name',
      amount: 100,
    })

    const result = await updateLinkedEntry(entry.id, { description: 'New name' })
    expect(result.entry.description).toBe('New name')
    expect(result.transaction.description).toBe('New name')

    const account = await prisma.account.findUnique({
      where: { id: SEED.accounts.sparkonto },
    })
    // Balance unchanged: 5000 + 100 = 5100
    expect(account!.currentBalance).toBe(5100)
  })

  it('updates date on entry and transaction', async () => {
    const { entry } = await createLinkedEntry({
      groupId: SEED.subAccountGroups.sparGroup1,
      date: '2026-04-01',
      description: 'Date test',
      amount: 50,
    })

    const result = await updateLinkedEntry(entry.id, { date: '2026-05-15' })
    expect(new Date(result.entry.date).toISOString().slice(0, 10)).toBe('2026-05-15')
    expect(new Date(result.transaction.date).toISOString().slice(0, 10)).toBe('2026-05-15')
  })

  it('throws 404 for non-existent entry', async () => {
    await expect(
      updateLinkedEntry('nonexistent-entry', { amount: 500 })
    ).rejects.toThrow('Eintrag nicht gefunden')
  })
})

describe('deleteLinkedEntry', () => {
  it('deletes entry and transaction, reverses balance', async () => {
    const { entry } = await createLinkedEntry({
      groupId: SEED.subAccountGroups.sparGroup1,
      date: '2026-04-01',
      description: 'To delete',
      amount: 300,
    })
    // Balance after create: 5000 + 300 = 5300

    await deleteLinkedEntry(entry.id)

    // Entry should be gone
    const deletedEntry = await prisma.subAccountEntry.findUnique({
      where: { id: entry.id },
    })
    expect(deletedEntry).toBeNull()

    // Transaction should be gone
    const transactions = await prisma.transaction.findMany({
      where: { accountId: SEED.accounts.sparkonto, mainAmount: null },
    })
    expect(transactions).toHaveLength(0)

    // Balance restored: 5300 - 300 = 5000
    const account = await prisma.account.findUnique({
      where: { id: SEED.accounts.sparkonto },
    })
    expect(account!.currentBalance).toBe(5000)
  })

  it('reverses negative amount correctly', async () => {
    const { entry } = await createLinkedEntry({
      groupId: SEED.subAccountGroups.sparGroup1,
      date: '2026-04-01',
      description: 'Negative to delete',
      amount: -200,
    })
    // Balance after create: 5000 + (-200) = 4800

    await deleteLinkedEntry(entry.id)

    const account = await prisma.account.findUnique({
      where: { id: SEED.accounts.sparkonto },
    })
    // Balance restored: 4800 - (-200) = 5000
    expect(account!.currentBalance).toBe(5000)
  })

  it('throws 404 for non-existent entry', async () => {
    await expect(
      deleteLinkedEntry('nonexistent-entry')
    ).rejects.toThrow('Eintrag nicht gefunden')
  })
})
