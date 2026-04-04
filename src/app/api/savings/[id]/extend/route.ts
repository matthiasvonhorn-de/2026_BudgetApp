import { NextResponse } from 'next/server'
import { withHandler } from '@/lib/api/handler'
import { extendSavingsSchema } from '@/lib/schemas/savings'
import { extendSavings } from '@/lib/savings/service'

export const POST = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const { months } = extendSavingsSchema.parse(await request.json().catch(() => ({})))
  return NextResponse.json(await extendSavings(id, months))
})
