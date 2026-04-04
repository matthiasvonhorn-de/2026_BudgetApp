import { NextResponse } from 'next/server'
import { withHandler } from '@/lib/api/handler'
import { unpayEntry } from '@/lib/savings/service'

export const DELETE = withHandler(async (_, ctx) => {
  const { id, entryId } = await (ctx as { params: Promise<{ id: string; entryId: string }> }).params
  await unpayEntry(id, entryId)
  return NextResponse.json({ success: true })
})
