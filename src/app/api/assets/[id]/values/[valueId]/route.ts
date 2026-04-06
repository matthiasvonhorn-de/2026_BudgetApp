import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'
import { DomainError } from '@/lib/api/errors'
import { roundCents } from '@/lib/money'

const UpdateValueSchema = z.object({
  date: z.string().optional(),
  value: z.number().nonnegative().optional(),
  notes: z.string().nullable().optional(),
})

export const PUT = withHandler(async (request: Request, ctx) => {
  const { id, valueId } = await (ctx as { params: Promise<{ id: string; valueId: string }> }).params
  const body = await request.json()
  const data = UpdateValueSchema.parse(body)

  const existing = await prisma.assetValue.findUnique({ where: { id: valueId } })
  if (!existing || existing.assetId !== id) throw new DomainError('Not found', 404)

  let dateOnly: Date | undefined
  if (data.date !== undefined) {
    const inputDate = new Date(data.date)
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    if (inputDate > today) {
      throw new DomainError('Date cannot be in the future', 400)
    }

    dateOnly = new Date(data.date)
    dateOnly.setHours(0, 0, 0, 0)

    const existingAtDate = await prisma.assetValue.findUnique({
      where: {
        assetId_date: {
          assetId: id,
          date: dateOnly,
        },
      },
    })
    if (existingAtDate && existingAtDate.id !== valueId) {
      throw new DomainError('A value for this date already exists', 409)
    }
  }

  const updated = await prisma.assetValue.update({
    where: { id: valueId },
    data: {
      ...(dateOnly !== undefined && { date: dateOnly }),
      ...(data.value !== undefined && { value: roundCents(data.value) }),
      ...(data.notes !== undefined && { notes: data.notes }),
    },
  })

  return NextResponse.json({
    id: updated.id,
    date: updated.date.toISOString().slice(0, 10),
    value: updated.value,
    notes: updated.notes,
  })
})

export const DELETE = withHandler(async (_, ctx) => {
  const { id, valueId } = await (ctx as { params: Promise<{ id: string; valueId: string }> }).params

  const existing = await prisma.assetValue.findUnique({ where: { id: valueId } })
  if (!existing || existing.assetId !== id) throw new DomainError('Not found', 404)

  await prisma.assetValue.delete({ where: { id: valueId } })

  return NextResponse.json({ success: true })
})
