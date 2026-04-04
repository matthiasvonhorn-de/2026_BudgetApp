import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'

export const POST = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const body = await request.json()
  const data = z.object({ name: z.string().min(1), initialBalance: z.number().default(0) }).parse(body)
  const group = await prisma.subAccountGroup.create({ data: { ...data, subAccountId: id } })
  return NextResponse.json(group, { status: 201 })
})
