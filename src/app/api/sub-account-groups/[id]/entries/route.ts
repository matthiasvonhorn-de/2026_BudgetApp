import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'

export const POST = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const body = await request.json()
  const data = z.object({
    date: z.string(),
    description: z.string().min(1),
    amount: z.coerce.number(),
    fromBudget: z.boolean().default(false),
  }).parse(body)
  const entry = await prisma.subAccountEntry.create({
    data: { ...data, date: new Date(data.date), groupId: id },
  })
  return NextResponse.json(entry, { status: 201 })
})
