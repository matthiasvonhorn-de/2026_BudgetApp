import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'

const CreatePortfolioSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
  notes: z.string().nullable().optional(),
})

export const GET = withHandler(async () => {
  const portfolios = await prisma.portfolio.findMany({
    where: { isActive: true },
    include: {
      values: {
        orderBy: { date: 'desc' },
        take: 30,
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  const result = portfolios.map(p => {
    const sortedValues = [...p.values].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    )
    const newest = p.values[0] // already ordered desc
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      notes: p.notes,
      isActive: p.isActive,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      currentValue: newest ? newest.value : null,
      sparklineData: sortedValues.map(v => ({
        date: v.date.toISOString().slice(0, 10),
        value: v.value,
      })),
    }
  })

  return NextResponse.json(result)
})

export const POST = withHandler(async (request: Request) => {
  const body = await request.json()
  const data = CreatePortfolioSchema.parse(body)

  const portfolio = await prisma.portfolio.create({
    data: {
      name: data.name,
      color: data.color ?? '#6366f1',
      notes: data.notes ?? null,
    },
  })

  return NextResponse.json(
    {
      ...portfolio,
      createdAt: portfolio.createdAt.toISOString(),
      updatedAt: portfolio.updatedAt.toISOString(),
    },
    { status: 201 },
  )
})
