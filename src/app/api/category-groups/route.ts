import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const groupSchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().default(0),
  accountId: z.string().min(1),
})

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('accountId')

  try {
    const groups = await prisma.categoryGroup.findMany({
      where: accountId ? { accountId } : undefined,
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
  } catch {
    return NextResponse.json({ error: 'Fehler beim Laden' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const data = groupSchema.parse(body)
    const group = await prisma.categoryGroup.create({ data })
    return NextResponse.json(group, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: 'Fehler beim Erstellen' }, { status: 500 })
  }
}
