import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'
import { createLinkedEntry } from '@/lib/sub-account-entries/service'

export const POST = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const body = await request.json()
  const data = z.object({
    date: z.string(),
    description: z.string().min(1),
    amount: z.coerce.number(),
    fromBudget: z.boolean().default(false),
    categoryId: z.string().min(1).optional(),
  }).parse(body)

  const result = await createLinkedEntry({
    groupId: id,
    categoryId: data.categoryId,
    date: data.date,
    description: data.description,
    amount: data.amount,
    fromBudget: data.fromBudget,
  })

  return NextResponse.json(result.entry, { status: 201 })
})
