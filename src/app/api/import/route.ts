import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withHandler } from '@/lib/api/handler'
import { importTransactionsSchema } from '@/lib/schemas/transactions'

export const POST = withHandler(async (request: Request) => {
  const body = await request.json()
  const { accountId, transactions } = importTransactionsSchema.parse(body)

  // Existierende Hashes prüfen (Duplikate)
  const existingHashes = await prisma.transaction.findMany({
    where: { importHash: { in: transactions.map(t => t.hash) } },
    select: { importHash: true },
  })
  const existingHashSet = new Set(existingHashes.map(t => t.importHash))

  const toImport = transactions.filter(t => !existingHashSet.has(t.hash))
  const duplicates = transactions.length - toImport.length

  if (toImport.length === 0) {
    return NextResponse.json({ imported: 0, duplicates, skipped: 0 })
  }

  // Transaktionen importieren und Kontostand aktualisieren
  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.transaction.createMany({
      data: toImport.map(t => ({
        date: new Date(t.date),
        mainAmount: t.amount,
        mainType: t.amount >= 0 ? 'INCOME' : 'EXPENSE',
        description: t.description,
        payee: t.payee || null,
        categoryId: t.categoryId || null,
        accountId,
        importHash: t.hash,
        status: 'CLEARED',
      })),
    })

    // Kontostand aktualisieren
    const totalAmount = toImport.reduce((sum, t) => sum + t.amount, 0)
    await tx.account.update({
      where: { id: accountId },
      data: { currentBalance: { increment: totalAmount } },
    })

    return created
  })

  return NextResponse.json({
    imported: result.count,
    duplicates,
    skipped: 0,
  })
})
