import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withHandler } from '@/lib/api/handler'
import { DomainError } from '@/lib/api/errors'
import { updateAccountSchema } from '@/lib/schemas/accounts'

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
  const data = updateAccountSchema.parse(body)
  const account = await prisma.account.update({ where: { id }, data })
  return NextResponse.json(account)
})

export const DELETE = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  await prisma.account.update({ where: { id }, data: { isActive: false } })
  return NextResponse.json({ success: true })
})
