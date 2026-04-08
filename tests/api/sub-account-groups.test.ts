import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { GET } from '@/app/api/sub-account-groups/route'
import { PUT, DELETE } from '@/app/api/sub-account-groups/[id]/route'
import { POST as POST_ENTRY } from '@/app/api/sub-account-groups/[id]/entries/route'
import { prisma } from '@/lib/prisma'
import { seedDatabase, SEED } from './seed'
import { createRequest, createParams } from './helpers'

beforeAll(async () => {
  await seedDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

afterEach(async () => {
  // Delete transactions first (they hold FK to subAccountEntry)
  await prisma.transaction.deleteMany({
    where: { accountId: SEED.accounts.sparkonto, mainAmount: null },
  })
  await prisma.subAccountEntry.deleteMany()
  await prisma.account.update({
    where: { id: SEED.accounts.sparkonto },
    data: { currentBalance: 5000 },
  })
})

// ── GET /api/sub-account-groups ──────────────────────────────────────────────

describe('GET /api/sub-account-groups', () => {
  it('returns all groups', async () => {
    const res = await GET(createRequest('GET', '/api/sub-account-groups'))
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThanOrEqual(1)

    const group = data.find((g: { id: string }) => g.id === SEED.subAccountGroups.sparGroup1)
    expect(group).toBeDefined()
    expect(group.name).toBe('Rücklagen')
  })

  it('filters by accountId', async () => {
    const res = await GET(
      createRequest('GET', `/api/sub-account-groups?accountId=${SEED.accounts.sparkonto}`),
    )
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.length).toBeGreaterThanOrEqual(1)
    // Every returned group should belong to the sparkonto
    for (const group of data) {
      expect(group.subAccount.account.id).toBe(SEED.accounts.sparkonto)
    }
  })

  it('returns empty array for unknown accountId', async () => {
    const res = await GET(
      createRequest('GET', '/api/sub-account-groups?accountId=nonexistent'),
    )
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data).toEqual([])
  })

  it('includes nested subAccount info', async () => {
    const res = await GET(createRequest('GET', '/api/sub-account-groups'))
    const data = await res.json()

    const group = data.find((g: { id: string }) => g.id === SEED.subAccountGroups.sparGroup1)
    expect(group.subAccount).toBeDefined()
    expect(group.subAccount.id).toBe(SEED.subAccounts.sparSubAccount)
    expect(group.subAccount.name).toBe('Spar-Unterkonto')
    expect(group.subAccount.account).toBeDefined()
    expect(group.subAccount.account.name).toBe('Sparkonto')
  })
})

// ── PUT /api/sub-account-groups/[id] ─────────────────────────────────────────

describe('PUT /api/sub-account-groups/[id]', () => {
  it('updates group name', async () => {
    const res = await PUT(
      createRequest('PUT', `/api/sub-account-groups/${SEED.subAccountGroups.sparGroup1}`, {
        name: 'Neue Rücklagen',
      }),
      createParams({ id: SEED.subAccountGroups.sparGroup1 }),
    )
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.name).toBe('Neue Rücklagen')

    // Restore original name
    await prisma.subAccountGroup.update({
      where: { id: SEED.subAccountGroups.sparGroup1 },
      data: { name: 'Rücklagen' },
    })
  })

  it('updates initialBalance', async () => {
    const res = await PUT(
      createRequest('PUT', `/api/sub-account-groups/${SEED.subAccountGroups.sparGroup1}`, {
        initialBalance: 500,
      }),
      createParams({ id: SEED.subAccountGroups.sparGroup1 }),
    )
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.initialBalance).toBe(500)

    // Restore
    await prisma.subAccountGroup.update({
      where: { id: SEED.subAccountGroups.sparGroup1 },
      data: { initialBalance: 0 },
    })
  })

  it('rejects empty name', async () => {
    const res = await PUT(
      createRequest('PUT', `/api/sub-account-groups/${SEED.subAccountGroups.sparGroup1}`, {
        name: '',
      }),
      createParams({ id: SEED.subAccountGroups.sparGroup1 }),
    )
    expect(res.status).toBe(400)
  })
})

// ── DELETE /api/sub-account-groups/[id] ──────────────────────────────────────

describe('DELETE /api/sub-account-groups/[id]', () => {
  it('deletes group and returns success', async () => {
    // Create a temporary group so we don't destroy seed data
    const tempGroup = await prisma.subAccountGroup.create({
      data: {
        name: 'Temp Group',
        subAccountId: SEED.subAccounts.sparSubAccount,
      },
    })

    const res = await DELETE(
      createRequest('DELETE', `/api/sub-account-groups/${tempGroup.id}`),
      createParams({ id: tempGroup.id }),
    )
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data).toEqual({ success: true })

    // Verify it's gone
    const deleted = await prisma.subAccountGroup.findUnique({
      where: { id: tempGroup.id },
    })
    expect(deleted).toBeNull()
  })

  it('cascades: deletes entries and unlinks transactions', async () => {
    // Create temp group with an entry and linked transaction
    const tempGroup = await prisma.subAccountGroup.create({
      data: {
        name: 'Cascade Group',
        subAccountId: SEED.subAccounts.sparSubAccount,
      },
    })

    const entry = await prisma.subAccountEntry.create({
      data: {
        date: new Date('2026-04-01'),
        description: 'Entry to cascade',
        amount: 100,
        groupId: tempGroup.id,
      },
    })

    const tx = await prisma.transaction.create({
      data: {
        date: new Date('2026-04-01'),
        description: 'Linked TX',
        mainAmount: null,
        mainType: 'INCOME',
        subAmount: 100,
        subType: 'INCOME',
        accountId: SEED.accounts.sparkonto,
        subAccountEntryId: entry.id,
      },
    })

    // Also link a category to this group
    const category = await prisma.category.create({
      data: {
        name: 'Linked Category',
        type: 'EXPENSE',
        groupId: SEED.groups.sparFixkosten,
        subAccountGroupId: tempGroup.id,
      },
    })

    const res = await DELETE(
      createRequest('DELETE', `/api/sub-account-groups/${tempGroup.id}`),
      createParams({ id: tempGroup.id }),
    )
    expect(res.status).toBe(200)

    // Entry should be gone
    const deletedEntry = await prisma.subAccountEntry.findUnique({
      where: { id: entry.id },
    })
    expect(deletedEntry).toBeNull()

    // Transaction should still exist but unlinked
    const unlinkedTx = await prisma.transaction.findUnique({
      where: { id: tx.id },
    })
    expect(unlinkedTx).not.toBeNull()
    expect(unlinkedTx!.subAccountEntryId).toBeNull()

    // Category should still exist but unlinked from group
    const unlinkedCategory = await prisma.category.findUnique({
      where: { id: category.id },
    })
    expect(unlinkedCategory).not.toBeNull()
    expect(unlinkedCategory!.subAccountGroupId).toBeNull()

    // Cleanup
    await prisma.transaction.delete({ where: { id: tx.id } })
    await prisma.category.delete({ where: { id: category.id } })
  })
})

// ── POST /api/sub-account-groups/[id]/entries ────────────────────────────────

describe('POST /api/sub-account-groups/[id]/entries', () => {
  it('creates entry and returns 201', async () => {
    const res = await POST_ENTRY(
      createRequest('POST', `/api/sub-account-groups/${SEED.subAccountGroups.sparGroup1}/entries`, {
        date: '2026-04-01',
        description: 'Monatliche Rücklage',
        amount: 200,
      }),
      createParams({ id: SEED.subAccountGroups.sparGroup1 }),
    )
    expect(res.status).toBe(201)

    const data = await res.json()
    expect(data.description).toBe('Monatliche Rücklage')
    expect(data.amount).toBe(200)
    expect(data.groupId).toBe(SEED.subAccountGroups.sparGroup1)
  })

  it('rejects empty description (400)', async () => {
    const res = await POST_ENTRY(
      createRequest('POST', `/api/sub-account-groups/${SEED.subAccountGroups.sparGroup1}/entries`, {
        date: '2026-04-01',
        description: '',
        amount: 100,
      }),
      createParams({ id: SEED.subAccountGroups.sparGroup1 }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 404 for non-existent group', async () => {
    const res = await POST_ENTRY(
      createRequest('POST', '/api/sub-account-groups/nonexistent/entries', {
        date: '2026-04-01',
        description: 'Should fail',
        amount: 50,
      }),
      createParams({ id: 'nonexistent' }),
    )
    expect(res.status).toBe(404)
  })
})
