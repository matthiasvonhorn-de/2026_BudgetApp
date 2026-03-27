import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const subAccounts = await prisma.subAccount.findMany({
      where: { accountId: id },
      include: {
        groups: {
          orderBy: { sortOrder: 'asc' },
          include: {
            entries: { orderBy: { date: 'asc' } },
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    })
    return NextResponse.json(subAccounts)
  } catch {
    return NextResponse.json({ error: 'Fehler beim Laden' }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = await request.json()
    const data = z.object({
      name: z.string().min(1),
      color: z.string().default('#6366f1'),
      initialBalance: z.number().default(0),
    }).parse(body)
    const sub = await prisma.subAccount.create({ data: { ...data, accountId: id } })
    return NextResponse.json(sub, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues }, { status: 400 })
    return NextResponse.json({ error: 'Fehler beim Erstellen' }, { status: 500 })
  }
}
