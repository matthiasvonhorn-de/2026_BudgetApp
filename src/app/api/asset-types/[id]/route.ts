import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'
import { DomainError } from '@/lib/api/errors'

const UpdateAssetTypeSchema = z.object({
  name: z.string().min(1).optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  sortOrder: z.number().int().optional(),
})

export const PUT = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const body = await request.json()
  const data = UpdateAssetTypeSchema.parse(body)

  const existing = await prisma.assetType.findUnique({ where: { id } })
  if (!existing) throw new DomainError('Not found', 404)

  const updated = await prisma.assetType.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.icon !== undefined && { icon: data.icon }),
      ...(data.color !== undefined && { color: data.color }),
      ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
    },
  })

  return NextResponse.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  })
})

export const DELETE = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params

  const existing = await prisma.assetType.findUnique({
    where: { id },
    include: { _count: { select: { assets: true } } },
  })
  if (!existing) throw new DomainError('Not found', 404)

  if (existing._count.assets > 0) {
    throw new DomainError(
      `Typ "${existing.name}" wird von ${existing._count.assets} Sachwert(en) verwendet und kann nicht gelöscht werden.`,
      409,
    )
  }

  await prisma.assetType.delete({ where: { id } })

  return NextResponse.json({ success: true })
})
