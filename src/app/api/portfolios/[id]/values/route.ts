import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'
import { DomainError } from '@/lib/api/errors'
import { roundCents } from '@/lib/money'

const CreateValueSchema = z.object({
  date: z.string(),
  value: z.number(),
  notes: z.string().nullable().optional(),
})

export const POST = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const body = await request.json()
  const data = CreateValueSchema.parse(body)

  const portfolio = await prisma.portfolio.findUnique({ where: { id } })
  if (!portfolio) throw new DomainError('Not found', 404)

  // Validate date <= today
  const inputDate = new Date(data.date)
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  if (inputDate > today) {
    throw new DomainError('Date cannot be in the future', 400)
  }

  // Normalize to start of day for uniqueness check
  const dateOnly = new Date(data.date)
  dateOnly.setHours(0, 0, 0, 0)

  // Check unique constraint (portfolioId, date)
  const existing = await prisma.portfolioValue.findUnique({
    where: {
      portfolioId_date: {
        portfolioId: id,
        date: dateOnly,
      },
    },
  })
  if (existing) {
    throw new DomainError('A value for this date already exists', 409)
  }

  const entry = await prisma.portfolioValue.create({
    data: {
      portfolioId: id,
      date: dateOnly,
      value: roundCents(data.value),
      notes: data.notes ?? null,
    },
  })

  return NextResponse.json(
    {
      id: entry.id,
      date: entry.date.toISOString().slice(0, 10),
      value: entry.value,
      notes: entry.notes,
    },
    { status: 201 },
  )
})
