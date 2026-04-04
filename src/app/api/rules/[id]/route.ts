import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  field: z.enum(['DESCRIPTION', 'PAYEE', 'AMOUNT']).optional(),
  operator: z.enum(['CONTAINS', 'STARTS_WITH', 'ENDS_WITH', 'EQUALS', 'GREATER_THAN', 'LESS_THAN', 'REGEX']).optional(),
  value: z.string().min(1).optional(),
  categoryId: z.string().optional(),
  priority: z.number().optional(),
  isActive: z.boolean().optional(),
})

export const PUT = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const body = await request.json()
  const data = updateSchema.parse(body)
  const rule = await prisma.categoryRule.update({
    where: { id },
    data,
    include: { category: true },
  })
  return NextResponse.json(rule)
})

export const DELETE = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  await prisma.categoryRule.delete({ where: { id } })
  return NextResponse.json({ success: true })
})
