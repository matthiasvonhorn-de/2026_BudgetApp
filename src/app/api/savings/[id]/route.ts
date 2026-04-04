import { NextResponse } from 'next/server'
import { withHandler } from '@/lib/api/handler'
import { updateSavingsSchema } from '@/lib/schemas/savings'
import { getSavingsDetail, updateSavings, deleteSavings } from '@/lib/savings/service'

export const GET = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  return NextResponse.json(await getSavingsDetail(id))
})

export const PUT = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const data = updateSavingsSchema.parse(await request.json())
  await updateSavings(id, data)
  return NextResponse.json({ success: true })
})

export const DELETE = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  await deleteSavings(id)
  return NextResponse.json({ success: true })
})
