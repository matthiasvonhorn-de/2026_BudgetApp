import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'

const CreateAssetTypeSchema = z.object({
  name: z.string().min(1),
  icon: z.string().optional(),
  color: z.string().optional(),
})

export const GET = withHandler(async () => {
  const types = await prisma.assetType.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { assets: true } } },
  })

  return NextResponse.json(
    types.map(t => ({
      id: t.id,
      name: t.name,
      icon: t.icon,
      color: t.color,
      sortOrder: t.sortOrder,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      _count: t._count,
    })),
  )
})

export const POST = withHandler(async (request: Request) => {
  const body = await request.json()
  const data = CreateAssetTypeSchema.parse(body)

  const maxOrder = await prisma.assetType.aggregate({ _max: { sortOrder: true } })
  const nextOrder = (maxOrder._max.sortOrder ?? -1) + 1

  const assetType = await prisma.assetType.create({
    data: {
      name: data.name,
      icon: data.icon ?? 'Package',
      color: data.color ?? '#6366f1',
      sortOrder: nextOrder,
    },
  })

  return NextResponse.json(
    {
      ...assetType,
      createdAt: assetType.createdAt.toISOString(),
      updatedAt: assetType.updatedAt.toISOString(),
    },
    { status: 201 },
  )
})
