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

    // Summe der abgeglichenen Transaktionen: SUM(mainAmount + subAmount)
    const clearedRows = await tx.$queryRaw<[{ total: number | null }]>`
      SELECT SUM(COALESCE(mainAmount, 0) + COALESCE(subAmount, 0)) as total
      FROM "Transaction"
      WHERE accountId = ${id} AND isReconciled = 1
    `
    const clearedBalance = clearedRows[0]?.total ?? 0
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
