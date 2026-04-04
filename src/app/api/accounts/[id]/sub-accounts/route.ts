import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'

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
  const data = z.object({
    name: z.string().min(1),
    color: z.string().default('#6366f1'),
    initialBalance: z.number().default(0),
  }).parse(body)
  const sub = await prisma.subAccount.create({ data: { ...data, accountId: id } })
  return NextResponse.json(sub, { status: 201 })
})
