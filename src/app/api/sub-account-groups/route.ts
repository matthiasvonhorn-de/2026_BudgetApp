import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withHandler } from '@/lib/api/handler'

export const GET = withHandler(async () => {
  const groups = await prisma.subAccountGroup.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      subAccount: {
        select: {
          id: true,
          name: true,
          account: { select: { id: true, name: true } },
        },
      },
    },
  })
  return NextResponse.json(groups)
})
