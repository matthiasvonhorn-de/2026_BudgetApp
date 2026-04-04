import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withHandler } from '@/lib/api/handler'

export const DELETE = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  await prisma.$transaction(async (tx) => {
    // Verknüpfte Transaktion löschen (falls vorhanden)
    await tx.transaction.deleteMany({ where: { subAccountEntryId: id } })
    await tx.subAccountEntry.delete({ where: { id } })
  })
  return NextResponse.json({ success: true })
})
