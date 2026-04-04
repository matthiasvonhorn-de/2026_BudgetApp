import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withHandler } from '@/lib/api/handler'
import { createAccountSchema } from '@/lib/schemas/accounts'

export const GET = withHandler(async () => {
  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    include: { _count: { select: { transactions: true } } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
  return NextResponse.json(accounts.map(a => ({ ...a })))
})

export const POST = withHandler(async (request: Request) => {
  const body = await request.json()
  const data = createAccountSchema.parse(body)
  const maxOrder = await prisma.account.aggregate({ _max: { sortOrder: true } })
  const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1
  const account = await prisma.account.create({ data: { ...data, sortOrder } })
  return NextResponse.json(account, { status: 201 })
})
