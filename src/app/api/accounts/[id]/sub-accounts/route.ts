import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withHandler } from '@/lib/api/handler'
import { createSubAccountSchema } from '@/lib/schemas/accounts'

export const GET = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const subAccounts = await prisma.subAccount.findMany({
    where: { accountId: id },
    include: {
      groups: {
        orderBy: { sortOrder: 'asc' },
        include: {
          entries: { orderBy: { date: 'asc' } },
        },
      },
    },
    orderBy: { sortOrder: 'asc' },
  })
  return NextResponse.json(subAccounts)
})

export const POST = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const body = await request.json()
  const data = createSubAccountSchema.parse(body)
  const sub = await prisma.subAccount.create({ data: { ...data, accountId: id } })
  return NextResponse.json(sub, { status: 201 })
})
