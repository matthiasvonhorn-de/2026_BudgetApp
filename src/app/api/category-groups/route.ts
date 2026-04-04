import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'

const groupSchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().default(0),
  accountId: z.string().min(1),
})

export const GET = withHandler(async (request: Request) => {
  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('accountId')

  const groups = await prisma.categoryGroup.findMany({
    where: accountId ? { accountId } : undefined,
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

export const POST = withHandler(async (request: Request) => {
  const body = await request.json()
  const data = groupSchema.parse(body)
  const group = await prisma.categoryGroup.create({ data })
  return NextResponse.json(group, { status: 201 })
})
