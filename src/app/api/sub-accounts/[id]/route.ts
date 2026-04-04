import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'

export const PUT = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const body = await request.json()
  const data = z.object({
    name: z.string().min(1).optional(),
    color: z.string().optional(),
    initialBalance: z.number().optional(),
  }).parse(body)
  const sub = await prisma.subAccount.update({ where: { id }, data })
  return NextResponse.json(sub)
})

export const DELETE = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const groups = await prisma.subAccountGroup.findMany({
    where: { subAccountId: id },
    select: { id: true },
  })
  const groupIds = groups.map(g => g.id)

  const entries = await prisma.subAccountEntry.findMany({
    where: { groupId: { in: groupIds } },
    select: { id: true },
  })
  const entryIds = entries.map(e => e.id)

  // Verknüpfte Transaktionen lösen
  if (entryIds.length > 0) {
    await prisma.transaction.updateMany({
      where: { subAccountEntryId: { in: entryIds } },
      data: { subAccountEntryId: null },
    })
  }

  // Verknüpfte Kategorien lösen
  if (groupIds.length > 0) {
    await prisma.category.updateMany({
      where: { subAccountGroupId: { in: groupIds } },
      data: { subAccountGroupId: null },
    })
  }

  await prisma.subAccountEntry.deleteMany({ where: { groupId: { in: groupIds } } })
  await prisma.subAccountGroup.deleteMany({ where: { subAccountId: id } })
  await prisma.subAccount.delete({ where: { id } })

  return NextResponse.json({ success: true })
})
