import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'
import { DomainError } from '@/lib/api/errors'

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  iban: z.string().optional().nullable(),
  bank: z.string().optional().nullable(),
  type: z.enum(['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'CASH', 'INVESTMENT']).optional(),
  color: z.string().optional(),
  icon: z.string().optional().nullable(),
  currentBalance: z.number().optional(),
})

export const GET = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const account = await prisma.account.findUnique({
    where: { id },
    include: {
      transactions: { orderBy: { date: 'desc' }, take: 50, include: { category: true } },
    },
  })
  if (!account) throw new DomainError('Konto nicht gefunden', 404)
  return NextResponse.json(account)
})

export const PUT = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const body = await request.json()
  const data = updateSchema.parse(body)
  const account = await prisma.account.update({ where: { id }, data })
  return NextResponse.json(account)
})

export const DELETE = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  await prisma.account.update({ where: { id }, data: { isActive: false } })
  return NextResponse.json({ success: true })
})
