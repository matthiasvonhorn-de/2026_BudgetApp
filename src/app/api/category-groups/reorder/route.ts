import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const items = z.array(z.object({ id: z.string(), sortOrder: z.number() })).parse(body)
    await Promise.all(
      items.map(({ id, sortOrder }) =>
        prisma.categoryGroup.update({ where: { id }, data: { sortOrder } })
      )
    )
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues }, { status: 400 })
    return NextResponse.json({ error: 'Fehler beim Speichern' }, { status: 500 })
  }
}
