import { NextResponse } from 'next/server'
import { withHandler } from '@/lib/api/handler'
import { createSavingsSchema } from '@/lib/schemas/savings'
import { listSavings, createSavings } from '@/lib/savings/service'

export const GET = withHandler(async () => {
  return NextResponse.json(await listSavings())
})

export const POST = withHandler(async (request: Request) => {
  const data = createSavingsSchema.parse(await request.json())
  return NextResponse.json(await createSavings(data), { status: 201 })
})
