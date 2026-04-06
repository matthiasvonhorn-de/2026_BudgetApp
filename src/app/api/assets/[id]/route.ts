import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'
import { DomainError } from '@/lib/api/errors'
import { roundCents } from '@/lib/money'

const UpdateAssetSchema = z.object({
  name: z.string().min(1).optional(),
  assetTypeId: z.string().min(1).optional(),
  color: z.string().optional(),
  ownershipPercent: z.number().min(1).max(100).optional(),
  purchaseDate: z.string().optional(),
  purchasePrice: z.number().positive().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

export const GET = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params

  const asset = await prisma.asset.findUnique({
    where: { id },
    include: {
      assetType: { select: { id: true, name: true, icon: true, color: true } },
      values: {
        orderBy: { date: 'desc' },
      },
    },
  })

  if (!asset) throw new DomainError('Not found', 404)

  return NextResponse.json({
    id: asset.id,
    name: asset.name,
    assetTypeId: asset.assetTypeId,
    color: asset.color,
    ownershipPercent: asset.ownershipPercent,
    purchaseDate: asset.purchaseDate.toISOString().slice(0, 10),
    purchasePrice: asset.purchasePrice,
    notes: asset.notes,
    isActive: asset.isActive,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
    assetType: asset.assetType,
    values: asset.values.map(v => ({
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
  const data = UpdateAssetSchema.parse(body)

  const existing = await prisma.asset.findUnique({ where: { id } })
  if (!existing) throw new DomainError('Not found', 404)

  const asset = await prisma.asset.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.assetTypeId !== undefined && { assetTypeId: data.assetTypeId }),
      ...(data.color !== undefined && { color: data.color }),
      ...(data.ownershipPercent !== undefined && { ownershipPercent: data.ownershipPercent }),
      ...(data.purchaseDate !== undefined && { purchaseDate: new Date(data.purchaseDate) }),
      ...(data.purchasePrice !== undefined && { purchasePrice: roundCents(data.purchasePrice) }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
    include: {
      assetType: { select: { id: true, name: true, icon: true, color: true } },
    },
  })

  return NextResponse.json({
    ...asset,
    purchaseDate: asset.purchaseDate.toISOString().slice(0, 10),
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  })
})

export const DELETE = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params

  const existing = await prisma.asset.findUnique({ where: { id } })
  if (!existing) throw new DomainError('Not found', 404)

  await prisma.asset.delete({ where: { id } })

  return NextResponse.json({ success: true })
})
