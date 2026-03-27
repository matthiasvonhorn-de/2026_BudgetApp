import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  iban: z.string().optional().nullable(),
  bank: z.string().optional().nullable(),
  type: z.enum(['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'CASH', 'INVESTMENT']).optional(),
  color: z.string().optional(),
  icon: z.string().optional().nullable(),
  currentBalance: z.number().optional(),
})

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const account = await prisma.account.findUnique({
      where: { id },
      include: {
        transactions: {
          orderBy: { date: 'desc' },
          take: 50,
          include: { category: true },
        },
      },
    })
    if (!account) return NextResponse.json({ error: 'Konto nicht gefunden' }, { status: 404 })

    // Subtract internal allocation transactions — they don't affect the physical balance:
    //   - TRANSFER: moves between own accounts
    //   - EXPENSE with subAccountEntryId: BOOKING into a sub-account envelope
    const internalEffect = await prisma.transaction.aggregate({
      where: {
        accountId: id,
        OR: [
          { type: 'TRANSFER' },
          { type: 'EXPENSE', subAccountEntryId: { not: null } },
        ],
      },
      _sum: { amount: true },
    })
    const correctedBalance = account.currentBalance - (internalEffect._sum.amount ?? 0)

    return NextResponse.json({ ...account, currentBalance: correctedBalance })
  } catch {
    return NextResponse.json({ error: 'Fehler' }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = await request.json()
    const data = updateSchema.parse(body)
    const account = await prisma.account.update({ where: { id }, data })
    return NextResponse.json(account)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: 'Fehler beim Aktualisieren' }, { status: 500 })
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    await prisma.account.update({ where: { id }, data: { isActive: false } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Fehler beim Löschen' }, { status: 500 })
  }
}
