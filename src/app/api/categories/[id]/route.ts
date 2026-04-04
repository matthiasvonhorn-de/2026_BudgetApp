import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'

const categorySchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).optional(),
  groupId: z.string().nullable().optional(),
  sortOrder: z.number().optional(),
  isActive: z.boolean().optional(),
  subAccountGroupId: z.string().nullable().optional(),
  subAccountLinkType: z.enum(['BOOKING', 'TRANSFER']).optional(),
  rolloverEnabled: z.boolean().optional(),
})

export const PUT = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const body = await request.json()
  const data = categorySchema.parse(body)
  const category = await prisma.category.update({ where: { id }, data })
  return NextResponse.json(category)
})

export const DELETE = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  // Soft delete
  await prisma.category.update({ where: { id }, data: { isActive: false } })
  return NextResponse.json({ success: true })
})
