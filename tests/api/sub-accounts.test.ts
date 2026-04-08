import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { GET } from '@/app/api/sub-accounts/route'
import { PUT, DELETE } from '@/app/api/sub-accounts/[id]/route'
import { POST as POST_GROUP } from '@/app/api/sub-accounts/[id]/groups/route'
import { seedDatabase, SEED } from './seed'
import { createRequest, createParams } from './helpers'
import { prisma } from '@/lib/prisma'

beforeAll(async () => {
  await seedDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('GET /api/sub-accounts', () => {
  it('returns sub-accounts with balance info', async () => {
    const res = await GET(createRequest('GET', '/api/sub-accounts'))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.subAccounts).toBeDefined()
    expect(Array.isArray(data.subAccounts)).toBe(true)
    expect(data.subAccounts).toHaveLength(1)
    expect(typeof data.categorizedAccountsBalance).toBe('number')
  })

  it('returns correct shape for each sub-account', async () => {
    const res = await GET(createRequest('GET', '/api/sub-accounts'))
    const data = await res.json()
    const sub = data.subAccounts[0]
    expect(sub.id).toBe(SEED.subAccounts.sparSubAccount)
    expect(sub.name).toBe('Spar-Unterkonto')
    expect(sub.color).toBe('#10b981')
    expect(sub.accountId).toBe(SEED.accounts.sparkonto)
    expect(sub.accountName).toBe('Sparkonto')
    expect(typeof sub.balance).toBe('number')
  })

  it('computes balance from group entries', async () => {
    // Add entries to the seed group
    await prisma.subAccountEntry.createMany({
      data: [
        { groupId: SEED.subAccountGroups.sparGroup1, amount: 100, description: 'Entry 1' },
        { groupId: SEED.subAccountGroups.sparGroup1, amount: 250, description: 'Entry 2' },
      ],
    })

    const res = await GET(createRequest('GET', '/api/sub-accounts'))
    const data = await res.json()
    const sub = data.subAccounts.find((s: { id: string }) => s.id === SEED.subAccounts.sparSubAccount)
    expect(sub.balance).toBe(350)

    // cleanup
    await prisma.subAccountEntry.deleteMany({ where: { groupId: SEED.subAccountGroups.sparGroup1 } })
  })
})

describe('PUT /api/sub-accounts/[id]', () => {
  it('updates name and color', async () => {
    const res = await PUT(
      createRequest('PUT', `/api/sub-accounts/${SEED.subAccounts.sparSubAccount}`, {
        name: 'Neuer Name',
        color: '#ef4444',
      }),
      createParams({ id: SEED.subAccounts.sparSubAccount }),
    )
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.name).toBe('Neuer Name')
    expect(data.color).toBe('#ef4444')

    // restore
    await prisma.subAccount.update({
      where: { id: SEED.subAccounts.sparSubAccount },
      data: { name: 'Spar-Unterkonto', color: '#10b981' },
    })
  })

  it('updates only name when color is not provided', async () => {
    const res = await PUT(
      createRequest('PUT', `/api/sub-accounts/${SEED.subAccounts.sparSubAccount}`, {
        name: 'Nur Name',
      }),
      createParams({ id: SEED.subAccounts.sparSubAccount }),
    )
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.name).toBe('Nur Name')
    expect(data.color).toBe('#10b981') // unchanged

    // restore
    await prisma.subAccount.update({
      where: { id: SEED.subAccounts.sparSubAccount },
      data: { name: 'Spar-Unterkonto' },
    })
  })

  it('rejects empty name (min length 1)', async () => {
    const res = await PUT(
      createRequest('PUT', `/api/sub-accounts/${SEED.subAccounts.sparSubAccount}`, {
        name: '',
      }),
      createParams({ id: SEED.subAccounts.sparSubAccount }),
    )
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBeDefined()
  })
})

describe('DELETE /api/sub-accounts/[id]', () => {
  it('deletes sub-account and cascades correctly', async () => {
    // Create a temporary sub-account with group and entry so we don't destroy seed data
    const tempSub = await prisma.subAccount.create({
      data: {
        name: 'Temp Sub',
        color: '#999999',
        accountId: SEED.accounts.sparkonto,
      },
    })
    const tempGroup = await prisma.subAccountGroup.create({
      data: {
        name: 'Temp Group',
        subAccountId: tempSub.id,
      },
    })
    const tempEntry = await prisma.subAccountEntry.create({
      data: {
        groupId: tempGroup.id,
        amount: 50,
        description: 'Temp Entry',
      },
    })

    // Create a transaction linked to the entry
    const tempTx = await prisma.transaction.create({
      data: {
        date: new Date('2026-04-01'),
        mainAmount: -50,
        mainType: 'EXPENSE',
        description: 'Linked TX',
        accountId: SEED.accounts.sparkonto,
        subAccountEntryId: tempEntry.id,
        status: 'PENDING',
      },
    })

    // Delete the sub-account
    const res = await DELETE(
      createRequest('DELETE', `/api/sub-accounts/${tempSub.id}`),
      createParams({ id: tempSub.id }),
    )
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)

    // Verify sub-account is gone
    const deletedSub = await prisma.subAccount.findUnique({ where: { id: tempSub.id } })
    expect(deletedSub).toBeNull()

    // Verify groups are gone
    const deletedGroup = await prisma.subAccountGroup.findUnique({ where: { id: tempGroup.id } })
    expect(deletedGroup).toBeNull()

    // Verify entries are gone
    const deletedEntry = await prisma.subAccountEntry.findUnique({ where: { id: tempEntry.id } })
    expect(deletedEntry).toBeNull()

    // Verify transaction is unlinked but still exists
    const updatedTx = await prisma.transaction.findUnique({ where: { id: tempTx.id } })
    expect(updatedTx).not.toBeNull()
    expect(updatedTx!.subAccountEntryId).toBeNull()

    // cleanup transaction
    await prisma.transaction.delete({ where: { id: tempTx.id } })
  })
})

describe('POST /api/sub-accounts/[id]/groups', () => {
  it('creates a group under a sub-account', async () => {
    const res = await POST_GROUP(
      createRequest('POST', `/api/sub-accounts/${SEED.subAccounts.sparSubAccount}/groups`, {
        name: 'Neue Rücklage',
      }),
      createParams({ id: SEED.subAccounts.sparSubAccount }),
    )
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.name).toBe('Neue Rücklage')
    expect(data.subAccountId).toBe(SEED.subAccounts.sparSubAccount)
    expect(data.id).toBeDefined()

    // cleanup
    await prisma.subAccountGroup.delete({ where: { id: data.id } })
  })

  it('creates a group with initialBalance', async () => {
    const res = await POST_GROUP(
      createRequest('POST', `/api/sub-accounts/${SEED.subAccounts.sparSubAccount}/groups`, {
        name: 'Mit Startguthaben',
        initialBalance: 500,
      }),
      createParams({ id: SEED.subAccounts.sparSubAccount }),
    )
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.name).toBe('Mit Startguthaben')
    expect(data.initialBalance).toBe(500)

    // cleanup
    await prisma.subAccountGroup.delete({ where: { id: data.id } })
  })

  it('rejects empty name', async () => {
    const res = await POST_GROUP(
      createRequest('POST', `/api/sub-accounts/${SEED.subAccounts.sparSubAccount}/groups`, {
        name: '',
      }),
      createParams({ id: SEED.subAccounts.sparSubAccount }),
    )
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBeDefined()
  })
})
