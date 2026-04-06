import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'
import { roundCents } from '@/lib/money'

const CreateAssetSchema = z.object({
  name: z.string().min(1),
  assetTypeId: z.string().min(1),
  color: z.string().optional(),
  ownershipPercent: z.number().min(1).max(100).optional(),
  purchaseDate: z.string(),
  purchasePrice: z.number().positive(),
  notes: z.string().nullable().optional(),
})

export const GET = withHandler(async () => {
  const assets = await prisma.asset.findMany({
    where: { isActive: true },
    include: {
      assetType: { select: { id: true, name: true, icon: true, color: true } },
      values: {
        orderBy: { date: 'desc' },
        take: 30,
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  const result = assets.map(a => {
    const sortedValues = [...a.values].sort(
      (x, y) => new Date(x.date).getTime() - new Date(y.date).getTime(),
    )
    const newest = a.values[0]
    return {
      id: a.id,
      name: a.name,
      assetTypeId: a.assetTypeId,
      color: a.color,
      ownershipPercent: a.ownershipPercent,
      purchaseDate: a.purchaseDate.toISOString().slice(0, 10),
      purchasePrice: a.purchasePrice,
      notes: a.notes,
      isActive: a.isActive,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
      assetType: a.assetType,
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
  const data = CreateAssetSchema.parse(body)

  const asset = await prisma.asset.create({
    data: {
      name: data.name,
      assetTypeId: data.assetTypeId,
      color: data.color ?? '#6366f1',
      ownershipPercent: data.ownershipPercent ?? 100,
      purchaseDate: new Date(data.purchaseDate),
      purchasePrice: roundCents(data.purchasePrice),
      notes: data.notes ?? null,
    },
    include: {
      assetType: { select: { id: true, name: true, icon: true, color: true } },
    },
  })

  return NextResponse.json(
    {
      ...asset,
      purchaseDate: asset.purchaseDate.toISOString().slice(0, 10),
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt.toISOString(),
    },
    { status: 201 },
  )
})
