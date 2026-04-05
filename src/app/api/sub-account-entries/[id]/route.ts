import { NextResponse } from 'next/server'
import { withHandler } from '@/lib/api/handler'
import { deleteLinkedEntry } from '@/lib/sub-account-entries/service'

export const DELETE = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  await deleteLinkedEntry(id)
  return NextResponse.json({ success: true })
})
