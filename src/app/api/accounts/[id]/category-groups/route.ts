import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET: Alle Kategoriegruppen dieses Kontos
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const groups = await prisma.categoryGroup.findMany({
      where: { accountId: id },
      include: {
        categories: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: {
            subAccountGroup: {
              select: { id: true, name: true, subAccount: { select: { name: true } } },
            },
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    })
    return NextResponse.json(groups)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Fehler' }, { status: 500 })
  }
}
