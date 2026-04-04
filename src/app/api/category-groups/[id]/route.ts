import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'

const groupSchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().optional(),
})

export const PUT = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const body = await request.json()
  const data = groupSchema.parse(body)
  const group = await prisma.categoryGroup.update({ where: { id }, data })
  return NextResponse.json(group)
})

export const DELETE = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  // Soft-delete categories in group first
  await prisma.category.updateMany({ where: { groupId: id }, data: { isActive: false } })
  await prisma.categoryGroup.delete({ where: { id } })
  return NextResponse.json({ success: true })
})
