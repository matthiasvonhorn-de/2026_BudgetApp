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

    // Internal allocations should NOT affect the physical account balance:
    //   - TRANSFER transactions (money moves between own accounts)
    //   - EXPENSE transactions linked to a sub-account entry (BOOKING = internal earmarking)
    // INCOME transactions always represent real money received, so they stay.
    const internalSums = await prisma.transaction.groupBy({
      by: ['accountId'],
      where: {
        accountId: { in: accounts.map(a => a.id) },
        OR: [
          { type: 'TRANSFER' },
          { type: 'EXPENSE', subAccountEntryId: { not: null } },
        ],
      },
      _sum: { amount: true },
    })
    const internalMap = new Map(internalSums.map(t => [t.accountId, t._sum.amount ?? 0]))

    const result = accounts.map(a => ({
      ...a,
      currentBalance: a.currentBalance - (internalMap.get(a.id) ?? 0),
    }))

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Fehler beim Laden der Konten' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const data = accountSchema.parse(body)
    const account = await prisma.account.create({ data })
    return NextResponse.json(account, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: 'Fehler beim Erstellen des Kontos' }, { status: 500 })
  }
}
