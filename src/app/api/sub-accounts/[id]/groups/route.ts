import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = await request.json()
    const data = z.object({ name: z.string().min(1), initialBalance: z.number().default(0) }).parse(body)
    const group = await prisma.subAccountGroup.create({ data: { ...data, subAccountId: id } })
    return NextResponse.json(group, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues }, { status: 400 })
    return NextResponse.json({ error: 'Fehler beim Erstellen' }, { status: 500 })
  }
}
