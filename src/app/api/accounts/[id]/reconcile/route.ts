import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withHandler } from '@/lib/api/handler'
import { reconcileAccountSchema } from '@/lib/schemas/accounts'

export const POST = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const body = await request.json()
  const { statementBalance, clearedTransactionIds } = reconcileAccountSchema.parse(body)

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
})
