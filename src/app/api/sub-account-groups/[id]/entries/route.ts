import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = await request.json()
    const data = z.object({
      date: z.string(),
      description: z.string().min(1),
      amount: z.coerce.number(),
      fromBudget: z.boolean().default(false),
    }).parse(body)
    const entry = await prisma.subAccountEntry.create({
      data: { ...data, date: new Date(data.date), groupId: id },
    })
    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues }, { status: 400 })
    return NextResponse.json({ error: 'Fehler beim Erstellen' }, { status: 500 })
  }
}
