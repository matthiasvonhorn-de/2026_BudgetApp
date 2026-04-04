import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withHandler } from '@/lib/api/handler'

// GET: Alle Kategoriegruppen dieses Kontos
export const GET = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const groups = await prisma.categoryGroup.findMany({
    where: { accountId: id },
    include: {
      categories: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        include: {
          subAccountGroup: {
            select: { id: true, name: true, subAccount: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: { sortOrder: 'asc' },
  })
  return NextResponse.json(groups)
})
