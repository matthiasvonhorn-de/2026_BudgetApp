import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withHandler } from '@/lib/api/handler'
import { DomainError } from '@/lib/api/errors'
import { updateTransactionSchema } from '@/lib/schemas/transactions'
import { updateEntryFromTransaction, deleteEntryFromTransaction } from '@/lib/sub-account-entries/service'

export const PUT = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const body = await request.json()
  const data = updateTransactionSchema.parse(body)

  const existing = await prisma.transaction.findUnique({
    where: { id },
    include: { category: { include: { subAccountGroup: true } } },
  })
  if (!existing) throw new DomainError('Nicht gefunden', 404)

  const transaction = await prisma.$transaction(async (tx) => {
    const newAmount = data.amount ?? existing.amount
    const newDate = data.date ? new Date(data.date) : existing.date
    const newDescription = data.description ?? existing.description

    // Update source account balance if amount changed
    if (data.amount !== undefined && data.amount !== existing.amount) {
      const diff = data.amount - existing.amount
      await tx.account.update({
        where: { id: existing.accountId },
        data: { currentBalance: { increment: diff } },
      })
    }

    const updated = await tx.transaction.update({
      where: { id },
      data: {
        ...data,
        ...(data.date && { date: newDate }),
      },
      include: { account: true, category: { include: { subAccountGroup: true } } },
    })

    // Delegate entry + TRANSFER sync to service layer
    const newCategoryId = data.categoryId !== undefined ? data.categoryId : existing.categoryId
    await updateEntryFromTransaction(tx, {
      newAmount,
      oldAmount: existing.amount,
      date: newDate,
      description: newDescription,
      newCategoryId,
      existingSubAccountEntryId: existing.subAccountEntryId,
      existingTransferId: existing.transferToId,
      existingStatus: existing.status as any,
      transactionId: id,
    })

    return updated
  })

  return NextResponse.json(transaction)
})

export const DELETE = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const { searchParams } = new URL(request.url)
  const revertLoan = searchParams.get('revertLoan') === 'true'

  const existing = await prisma.transaction.findUnique({ where: { id } })
  if (!existing) throw new DomainError('Nicht gefunden', 404)

  const linkedPayment = await prisma.loanPayment.findFirst({
    where: { transactionId: id },
  })

  await prisma.$transaction(async (tx) => {
    const pairedId = existing.transferToId

    // Loan payment cleanup
    if (linkedPayment) {
      await tx.loanPayment.update({
        where: { loanId_periodNumber: { loanId: linkedPayment.loanId, periodNumber: linkedPayment.periodNumber } },
        data: {
          transactionId: null,
          ...(revertLoan && { paidAt: null }),
        },
      })
    }

    // Delete linked sub-account entry via service
    await deleteEntryFromTransaction(tx, existing.subAccountEntryId)

    // Unlink transfer and delete transaction
    if (pairedId) {
      await tx.transaction.update({ where: { id }, data: { transferToId: null } })
    }
    await tx.transaction.delete({ where: { id } })

    // Reverse source account balance
    await tx.account.update({
      where: { id: existing.accountId },
      data: { currentBalance: { increment: -existing.amount } },
    })

    // Delete paired TRANSFER transaction and reverse its account balance
    if (pairedId) {
      const paired = await tx.transaction.findUnique({ where: { id: pairedId } })
      if (paired) {
        await tx.transaction.delete({ where: { id: pairedId } })
        await tx.account.update({
          where: { id: paired.accountId },
          data: { currentBalance: { increment: -paired.amount } },
        })
      }
    }
  })

  return NextResponse.json({ success: true })
})
