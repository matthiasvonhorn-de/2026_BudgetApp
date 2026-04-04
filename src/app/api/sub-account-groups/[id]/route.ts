import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'

export const PUT = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const body = await request.json()
  const data = z.object({ name: z.string().min(1).optional(), initialBalance: z.number().optional() }).parse(body)
  const group = await prisma.subAccountGroup.update({ where: { id }, data })
  return NextResponse.json(group)
})

export const DELETE = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const entries = await prisma.subAccountEntry.findMany({
    where: { groupId: id },
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
  await prisma.category.updateMany({
    where: { subAccountGroupId: id },
    data: { subAccountGroupId: null },
  })

  await prisma.subAccountEntry.deleteMany({ where: { groupId: id } })
  await prisma.subAccountGroup.delete({ where: { id } })

  return NextResponse.json({ success: true })
})
