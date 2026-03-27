import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const schema = z.object({
  ids: z.array(z.string()).min(1),
})

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { ids } = schema.parse(body)

    const count = await prisma.account.count({ where: { id: { in: ids } } })
    if (count !== ids.length) {
      return NextResponse.json({ error: 'Ungültige Konto-IDs' }, { status: 400 })
    }

    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.account.update({ where: { id }, data: { sortOrder: index } })
      )
    )

    return new NextResponse(null, { status: 200 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: 'Fehler beim Speichern der Reihenfolge' }, { status: 500 })
  }
}
