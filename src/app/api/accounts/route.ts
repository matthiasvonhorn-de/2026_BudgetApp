import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const accountSchema = z.object({
  name: z.string().min(1),
  iban: z.string().optional().nullable(),
  bank: z.string().optional().nullable(),
  type: z.enum(['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'CASH', 'INVESTMENT']).default('CHECKING'),
  color: z.string().default('#6366f1'),
  icon: z.string().optional().nullable(),
  currentBalance: z.number().default(0),
})

export async function GET() {
  try {
    const accounts = await prisma.account.findMany({
      where: { isActive: true },
      include: {
        _count: { select: { transactions: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })

    const result = accounts.map(a => ({ ...a }))

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Fehler beim Laden der Konten' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const data = accountSchema.parse(body)

    const maxOrder = await prisma.account.aggregate({ _max: { sortOrder: true } })
    const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1

    const account = await prisma.account.create({ data: { ...data, sortOrder } })
    return NextResponse.json(account, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: 'Fehler beim Erstellen des Kontos' }, { status: 500 })
  }
}
