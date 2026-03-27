import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const schema = z.object({
  statementBalance: z.number(),
  clearedTransactionIds: z.array(z.string()),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = await request.json()
    const { statementBalance, clearedTransactionIds } = schema.parse(body)

    const result = await prisma.$transaction(async (tx) => {
      // Transaktionen als RECONCILED markieren
      await tx.transaction.updateMany({
        where: { id: { in: clearedTransactionIds }, accountId: id },
        data: { status: 'RECONCILED', isReconciled: true },
      })

      // Summe der abgeglichenen Transaktionen
      const cleared = await tx.transaction.aggregate({
        where: { accountId: id, isReconciled: true },
        _sum: { amount: true },
      })
      const clearedBalance = cleared._sum.amount ?? 0
      const difference = statementBalance - clearedBalance

      // Reconciliation-Eintrag erstellen
      const reconciliation = await tx.reconciliation.create({
        data: {
          accountId: id,
          date: new Date(),
          statementBalance,
          clearedBalance,
          difference,
        },
      })

      // Kontostand auf statement balance setzen
      await tx.account.update({
        where: { id },
        data: { currentBalance: statementBalance },
      })

      return { reconciliation, difference }
    })

    return NextResponse.json(result)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Fehler beim Reconciliation' }, { status: 500 })
  }
}
