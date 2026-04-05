import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'
import { DomainError } from '@/lib/api/errors'

const UpdatePortfolioSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

export const GET = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params

  const portfolio = await prisma.portfolio.findUnique({
    where: { id },
    include: {
      values: {
        orderBy: { date: 'desc' },
      },
    },
  })

  if (!portfolio) throw new DomainError('Not found', 404)

  return NextResponse.json({
    id: portfolio.id,
    name: portfolio.name,
    color: portfolio.color,
    notes: portfolio.notes,
    isActive: portfolio.isActive,
    createdAt: portfolio.createdAt.toISOString(),
    updatedAt: portfolio.updatedAt.toISOString(),
    values: portfolio.values.map(v => ({
      id: v.id,
      date: v.date.toISOString().slice(0, 10),
      value: v.value,
      notes: v.notes,
    })),
  })
})

export const PUT = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const body = await request.json()
  const data = UpdatePortfolioSchema.parse(body)

  const existing = await prisma.portfolio.findUnique({ where: { id } })
  if (!existing) throw new DomainError('Not found', 404)

  const portfolio = await prisma.portfolio.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.color !== undefined && { color: data.color }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  })

  return NextResponse.json({
    ...portfolio,
    createdAt: portfolio.createdAt.toISOString(),
    updatedAt: portfolio.updatedAt.toISOString(),
  })
})

export const DELETE = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params

  const existing = await prisma.portfolio.findUnique({ where: { id } })
  if (!existing) throw new DomainError('Not found', 404)

  await prisma.portfolio.delete({ where: { id } })

  return NextResponse.json({ success: true })
})
