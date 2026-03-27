import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = await request.json()
    const data = z.object({ name: z.string().min(1).optional(), initialBalance: z.number().optional() }).parse(body)
    const group = await prisma.subAccountGroup.update({ where: { id }, data })
    return NextResponse.json(group)
  } catch {
    return NextResponse.json({ error: 'Fehler' }, { status: 500 })
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const entries = await prisma.subAccountEntry.findMany({
      where: { groupId: id },
      select: { id: true },
    })
    const entryIds = entries.map(e => e.id)

    // Verknüpfte Transaktionen lösen
    if (entryIds.length > 0) {
      await prisma.transaction.updateMany({
        where: { subAccountEntryId: { in: entryIds } },
        data: { subAccountEntryId: null },
      })
    }

    // Verknüpfte Kategorien lösen
    await prisma.category.updateMany({
      where: { subAccountGroupId: id },
      data: { subAccountGroupId: null },
    })

    await prisma.subAccountEntry.deleteMany({ where: { groupId: id } })
    await prisma.subAccountGroup.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Fehler beim Löschen' }, { status: 500 })
  }
}
