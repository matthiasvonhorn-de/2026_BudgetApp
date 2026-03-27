import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    // Verknüpfte Transaktion lösen, bevor der Eintrag gelöscht wird
    await prisma.transaction.updateMany({
      where: { subAccountEntryId: id },
      data: { subAccountEntryId: null },
    })
    await prisma.subAccountEntry.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Fehler beim Löschen' }, { status: 500 })
  }
}
