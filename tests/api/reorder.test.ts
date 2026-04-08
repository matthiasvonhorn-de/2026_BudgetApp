import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { PATCH as PATCH_ACCOUNTS } from '@/app/api/accounts/reorder/route'
import { PATCH as PATCH_GROUPS } from '@/app/api/category-groups/reorder/route'
import { PUT, DELETE } from '@/app/api/category-groups/[id]/route'
import { seedDatabase, SEED } from './seed'
import { createRequest, createParams, seedCategoryGroup, seedCategory } from './helpers'
import { prisma } from '@/lib/prisma'

beforeAll(async () => {
  await seedDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

afterEach(async () => {
  // Restore original sortOrders
  await prisma.account.update({
    where: { id: SEED.accounts.girokonto },
    data: { sortOrder: 0 },
  })
  await prisma.account.update({
    where: { id: SEED.accounts.sparkonto },
    data: { sortOrder: 1 },
  })
  await prisma.categoryGroup.update({
    where: { id: SEED.groups.giroFixkosten },
    data: { sortOrder: 0 },
  })
  await prisma.categoryGroup.update({
    where: { id: SEED.groups.giroVariable },
    data: { sortOrder: 1 },
  })
})

describe('PATCH /api/accounts/reorder', () => {
  it('updates sortOrder correctly', async () => {
    // Reverse the order: sparkonto first, girokonto second
    const res = await PATCH_ACCOUNTS(
      createRequest('PATCH', '/api/accounts/reorder', {
        ids: [SEED.accounts.sparkonto, SEED.accounts.girokonto],
      }),
    )
    expect(res.status).toBe(200)

    const sparkonto = await prisma.account.findUnique({ where: { id: SEED.accounts.sparkonto } })
    const girokonto = await prisma.account.findUnique({ where: { id: SEED.accounts.girokonto } })
    expect(sparkonto!.sortOrder).toBe(0)
    expect(girokonto!.sortOrder).toBe(1)
  })

  it('rejects invalid IDs (400)', async () => {
    const res = await PATCH_ACCOUNTS(
      createRequest('PATCH', '/api/accounts/reorder', {
        ids: [SEED.accounts.girokonto, 'nonexistent-id'],
      }),
    )
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Ungültige Konto-IDs')
  })
})

describe('PATCH /api/category-groups/reorder', () => {
  it('updates sortOrder', async () => {
    const res = await PATCH_GROUPS(
      createRequest('PATCH', '/api/category-groups/reorder', [
        { id: SEED.groups.giroFixkosten, sortOrder: 5 },
        { id: SEED.groups.giroVariable, sortOrder: 3 },
      ]),
    )
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)

    const fixkosten = await prisma.categoryGroup.findUnique({ where: { id: SEED.groups.giroFixkosten } })
    const variable = await prisma.categoryGroup.findUnique({ where: { id: SEED.groups.giroVariable } })
    expect(fixkosten!.sortOrder).toBe(5)
    expect(variable!.sortOrder).toBe(3)
  })
})

describe('PUT /api/category-groups/[id]', () => {
  it('updates name', async () => {
    const res = await PUT(
      createRequest('PUT', `/api/category-groups/${SEED.groups.giroFixkosten}`, {
        name: 'Fixkosten Aktualisiert',
      }),
      createParams({ id: SEED.groups.giroFixkosten }),
    )
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.name).toBe('Fixkosten Aktualisiert')

    // Restore name
    await prisma.categoryGroup.update({
      where: { id: SEED.groups.giroFixkosten },
      data: { name: 'Fixkosten' },
    })
  })
})

describe('DELETE /api/category-groups/[id]', () => {
  it('deletes group and soft-deletes categories', async () => {
    // Create a temporary group with a category for deletion test
    const tempGroup = await seedCategoryGroup(SEED.accounts.girokonto, {
      name: 'Temp Delete Group',
      sortOrder: 99,
    })
    const tempCategory = await seedCategory({
      name: 'Temp Category',
      type: 'EXPENSE',
      groupId: tempGroup.id,
      sortOrder: 0,
    })

    const res = await DELETE(
      createRequest('DELETE', `/api/category-groups/${tempGroup.id}`),
      createParams({ id: tempGroup.id }),
    )
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)

    // Group should be hard-deleted
    const deletedGroup = await prisma.categoryGroup.findUnique({ where: { id: tempGroup.id } })
    expect(deletedGroup).toBeNull()

    // Category should be soft-deleted (isActive = false)
    const softDeletedCat = await prisma.category.findUnique({ where: { id: tempCategory.id } })
    expect(softDeletedCat).not.toBeNull()
    expect(softDeletedCat!.isActive).toBe(false)

    // Clean up the soft-deleted category
    await prisma.category.delete({ where: { id: tempCategory.id } })
  })
})
