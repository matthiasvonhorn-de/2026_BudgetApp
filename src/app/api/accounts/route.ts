import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'

const accountSchema = z.object({
  name: z.string().min(1),
  iban: z.string().optional().nullable(),
  bank: z.string().optional().nullable(),
  type: z.enum(['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'CASH', 'INVESTMENT']).default('CHECKING'),
  color: z.string().default('#6366f1'),
  icon: z.string().optional().nullable(),
  currentBalance: z.number().default(0),
})

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
  const data = accountSchema.parse(body)
  const maxOrder = await prisma.account.aggregate({ _max: { sortOrder: true } })
  const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1
  const account = await prisma.account.create({ data: { ...data, sortOrder } })
  return NextResponse.json(account, { status: 201 })
})
