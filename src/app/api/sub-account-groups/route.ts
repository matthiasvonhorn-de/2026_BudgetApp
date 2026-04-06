import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withHandler } from '@/lib/api/handler'

export const GET = withHandler(async (request: Request) => {
  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('accountId')

  const groups = await prisma.subAccountGroup.findMany({
    where: accountId ? { subAccount: { accountId } } : undefined,
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
