import { NextResponse } from 'next/server'
import { withHandler } from '@/lib/api/handler'
import { paySavingsSchema } from '@/lib/schemas/savings'
import { payEntries } from '@/lib/savings/service'

export const POST = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const { paidUntil } = paySavingsSchema.parse(await request.json())
  return NextResponse.json(await payEntries(id, paidUntil))
})
