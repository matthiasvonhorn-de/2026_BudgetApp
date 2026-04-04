import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'
import { DomainError } from '@/lib/api/errors'

const PaySchema = z.object({
  paidUntil: z.string(), // ISO date string "YYYY-MM-DD"
})

export const POST = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const body = await request.json()
  const { paidUntil } = PaySchema.parse(body)
  const cutoff = new Date(paidUntil)
  cutoff.setHours(23, 59, 59, 999)

  const config = await prisma.savingsConfig.findUnique({
    where: { accountId: id },
    include: {
      account: true,
      linkedAccount: true,
      entries: {
        where: { paidAt: null, dueDate: { lte: cutoff } },
        orderBy: [{ dueDate: 'asc' }, { entryType: 'asc' }],
      },
    },
  })
  if (!config) throw new DomainError('Not found', 404)

  const unpaidDue = config.entries

  await prisma.$transaction(async (tx) => {
    for (const entry of unpaidDue) {
      // INCOME-Transaktion auf dem Sparkonto
      const savingsTx = await tx.transaction.create({
        data: {
          accountId: config.accountId,
          type: 'INCOME',
          amount: entry.scheduledAmount,
          description: entry.entryType === 'INTEREST' ? 'Zinsgutschrift' : 'Sparrate',
          date: entry.dueDate,
          status: 'CLEARED',
        },
      })

      await tx.account.update({
        where: { id: config.accountId },
        data: { currentBalance: { increment: entry.scheduledAmount } },
      })

      let giroTxId: string | null = null

      // EXPENSE auf Girokonto — nur für CONTRIBUTION wenn verknüpft
      if (
        entry.entryType === 'CONTRIBUTION' &&
        config.linkedAccountId
      ) {
        const giroTx = await tx.transaction.create({
          data: {
            accountId: config.linkedAccountId,
            type: 'EXPENSE',
            amount: -entry.scheduledAmount,
            description: `Sparrate: ${config.account.name}`,
            date: entry.dueDate,
            categoryId: config.categoryId ?? null,
            status: 'CLEARED',
          },
        })
        await tx.account.update({
          where: { id: config.linkedAccountId },
          data: { currentBalance: { increment: -entry.scheduledAmount } },
        })
        giroTxId = giroTx.id
      }

      await tx.savingsEntry.update({
        where: { id: entry.id },
        data: {
          paidAt: new Date(),
          transactionId: savingsTx.id,
          ...(giroTxId && { giroTransactionId: giroTxId }),
        },
      })
    }
  })

  return NextResponse.json({ paid: unpaidDue.length })
})
