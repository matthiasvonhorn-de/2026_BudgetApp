import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { DELETE } from '@/app/api/sub-account-entries/[id]/route'
import { createLinkedEntry } from '@/lib/sub-account-entries/service'
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

// ── DELETE /api/sub-account-entries/[id] ─────────────────────────────────────

describe('DELETE /api/sub-account-entries/[id]', () => {
  it('deletes entry via route handler and returns success', async () => {
    // Create entry via service
    const { entry } = await createLinkedEntry({
      groupId: SEED.subAccountGroups.sparGroup1,
      date: '2026-04-01',
      description: 'To delete via route',
      amount: 250,
    })

    const res = await DELETE(
      createRequest('DELETE', `/api/sub-account-entries/${entry.id}`),
      createParams({ id: entry.id }),
    )
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data).toEqual({ success: true })

    // Verify entry is gone
    const deleted = await prisma.subAccountEntry.findUnique({
      where: { id: entry.id },
    })
    expect(deleted).toBeNull()
  })

  it('reverses account balance on delete', async () => {
    const { entry } = await createLinkedEntry({
      groupId: SEED.subAccountGroups.sparGroup1,
      date: '2026-04-01',
      description: 'Balance reversal test',
      amount: 400,
    })
    // Balance after create: 5000 + 400 = 5400

    await DELETE(
      createRequest('DELETE', `/api/sub-account-entries/${entry.id}`),
      createParams({ id: entry.id }),
    )

    const account = await prisma.account.findUnique({
      where: { id: SEED.accounts.sparkonto },
    })
    // Balance restored: 5400 - 400 = 5000
    expect(account!.currentBalance).toBe(5000)
  })

  it('returns error for non-existent entry', async () => {
    const res = await DELETE(
      createRequest('DELETE', '/api/sub-account-entries/nonexistent-id'),
      createParams({ id: 'nonexistent-id' }),
    )
    expect(res.status).toBe(404)

    const data = await res.json()
    expect(data.error).toBeDefined()
  })
})
