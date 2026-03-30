import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    await prisma.$transaction(async (tx) => {
      // Verknüpfte Transaktion löschen (falls vorhanden)
      await tx.transaction.deleteMany({ where: { subAccountEntryId: id } })
      await tx.subAccountEntry.delete({ where: { id } })
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Fehler beim Löschen' }, { status: 500 })
  }
}
