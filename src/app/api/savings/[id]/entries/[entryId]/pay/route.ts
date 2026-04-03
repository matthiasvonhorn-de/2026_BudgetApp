import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const { id, entryId } = await params
  try {
    const entry = await prisma.savingsEntry.findUnique({
      where: { id: entryId },
      include: { savingsConfig: { include: { account: true } } },
    })
    if (!entry || entry.savingsConfig.accountId !== id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (!entry.paidAt) {
      return NextResponse.json({ error: 'Not paid' }, { status: 400 })
    }

    await prisma.$transaction(async (tx) => {
      // INCOME-Transaktion auf Sparkonto rückgängig
      if (entry.transactionId) {
        await tx.transaction.delete({ where: { id: entry.transactionId } })
        await tx.account.update({
          where: { id: entry.savingsConfig.accountId },
          data: { currentBalance: { increment: -entry.scheduledAmount } },
        })
      }

      // EXPENSE-Transaktion auf Girokonto rückgängig
      if (entry.giroTransactionId) {
        const giroTx = await tx.transaction.findUnique({ where: { id: entry.giroTransactionId } })
        if (giroTx) {
          await tx.transaction.delete({ where: { id: giroTx.id } })
          await tx.account.update({
            where: { id: giroTx.accountId },
            data: { currentBalance: { increment: entry.scheduledAmount } },
          })
        }
      }

      await tx.savingsEntry.update({
        where: { id: entryId },
        data: { paidAt: null, transactionId: null, giroTransactionId: null },
      })
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Fehler' }, { status: 500 })
  }
}
