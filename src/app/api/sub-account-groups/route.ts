import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const groups = await prisma.subAccountGroup.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        subAccount: {
          select: {
            id: true,
            name: true,
            account: { select: { id: true, name: true } },
          },
        },
      },
    })
    return NextResponse.json(groups)
  } catch {
    return NextResponse.json({ error: 'Fehler beim Laden' }, { status: 500 })
  }
}
