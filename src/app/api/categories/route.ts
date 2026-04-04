import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'

const categorySchema = z.object({
  name: z.string().min(1),
  color: z.string().default('#6366f1'),
  icon: z.string().optional().nullable(),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).default('EXPENSE'),
  groupId: z.string().optional().nullable(),
  sortOrder: z.number().default(0),
  subAccountGroupId: z.string().optional().nullable(),
  subAccountLinkType: z.enum(['BOOKING', 'TRANSFER']).default('BOOKING'),
  rolloverEnabled: z.boolean().default(true),
})

export const GET = withHandler(async () => {
  const groups = await prisma.categoryGroup.findMany({
    include: {
      categories: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        include: { subAccountGroup: { select: { id: true, name: true, subAccount: { select: { name: true } } } } },
      },
    },
    orderBy: { sortOrder: 'asc' },
  })

  const ungrouped = await prisma.category.findMany({
    where: { isActive: true, groupId: null },
    orderBy: { sortOrder: 'asc' },
  })

  return NextResponse.json({ groups, ungrouped })
})

export const POST = withHandler(async (request: Request) => {
  const body = await request.json()
  const data = categorySchema.parse(body)
  const category = await prisma.category.create({ data })
  return NextResponse.json(category, { status: 201 })
})
