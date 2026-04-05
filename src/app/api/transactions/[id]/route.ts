import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withHandler } from '@/lib/api/handler'
import { DomainError } from '@/lib/api/errors'
import { updateTransactionSchema } from '@/lib/schemas/transactions'
import { updateEntryFromTransaction, deleteEntryFromTransaction } from '@/lib/sub-account-entries/service'
import { balanceIncrement } from '@/lib/money'

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
    const newMainAmount = data.mainAmount !== undefined ? (data.mainAmount ?? null) : existing.mainAmount
    const newMainType = data.mainType ?? existing.mainType
    const newDate = data.date ? new Date(data.date) : existing.date
    const newDescription = data.description ?? existing.description

    // Calculate balance diff: (newMain + newSub) - (oldMain + oldSub)
    // Note: subAmount may be updated by updateEntryFromTransaction later
    const oldTotal = (existing.mainAmount ?? 0) + (existing.subAmount ?? 0)

    // Update source account balance if mainAmount changed
    if (data.mainAmount !== undefined && (data.mainAmount ?? null) !== existing.mainAmount) {
      const mainDiff = (data.mainAmount ?? 0) - (existing.mainAmount ?? 0)
      await tx.account.update({
        where: { id: existing.accountId },
        data: { currentBalance: balanceIncrement(mainDiff) },
      })
    }

    // Sub-Only-TX: subAmount direkt aktualisieren + Entry synchronisieren
    if (data.subAmount !== undefined && existing.mainAmount == null) {
      const newSubAmount = data.subAmount ?? existing.subAmount ?? 0
      const newSubType = newSubAmount > 0 ? 'INCOME' : 'EXPENSE'
      const subDiff = newSubAmount - (existing.subAmount ?? 0)

      const updated = await tx.transaction.update({
        where: { id },
        data: {
          ...(data.date && { date: newDate }),
          ...(data.description && { description: newDescription }),
          subAmount: newSubAmount,
          subType: newSubType,
          ...(data.status && { status: data.status }),
        },
        include: { account: true, category: { include: { subAccountGroup: true } } },
      })

      // Entry synchronisieren
      if (existing.subAccountEntryId) {
        await tx.subAccountEntry.update({
          where: { id: existing.subAccountEntryId },
          data: {
            amount: newSubAmount,
            ...(data.date && { date: newDate }),
            ...(data.description && { description: newDescription }),
          },
        })
      }

      // Balance aktualisieren
      if (subDiff !== 0) {
        await tx.account.update({
          where: { id: existing.accountId },
          data: { currentBalance: balanceIncrement(subDiff) },
        })
      }

      return updated
    }

    const updated = await tx.transaction.update({
      where: { id },
      data: {
        ...(data.date && { date: newDate }),
        ...(data.mainAmount !== undefined && { mainAmount: data.mainAmount ?? null }),
        ...(data.mainType && { mainType: newMainType }),
        ...(data.description && { description: newDescription }),
        ...(data.payee !== undefined && { payee: data.payee }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
        ...(data.status && { status: data.status }),
      },
      include: { account: true, category: { include: { subAccountGroup: true } } },
    })

    // Delegate entry + TRANSFER sync to service layer (nur für TX mit mainAmount)
    const newCategoryId = data.categoryId !== undefined ? data.categoryId : existing.categoryId
    if (newMainAmount != null) {
      const oldMainForEntry = existing.mainAmount ?? 0

      await updateEntryFromTransaction(tx, {
        newMainAmount: newMainAmount as number,
        oldMainAmount: oldMainForEntry,
        date: newDate,
        description: newDescription,
        newCategoryId,
        existingSubAccountEntryId: existing.subAccountEntryId,
        existingTransferId: existing.transferToId,
        existingStatus: existing.status as any,
        transactionId: id,
      })

      // If entry was synced, subAmount changed too — recalculate balance diff
      const updatedTx = await tx.transaction.findUnique({ where: { id } })
      if (updatedTx) {
        const newTotal = (updatedTx.mainAmount ?? 0) + (updatedTx.subAmount ?? 0)
        const subDiff = newTotal - oldTotal - ((data.mainAmount !== undefined ? ((data.mainAmount ?? 0) - (existing.mainAmount ?? 0)) : 0))
        if (subDiff !== 0) {
          await tx.account.update({
            where: { id: existing.accountId },
            data: { currentBalance: balanceIncrement(subDiff) },
          })
        }
      }
    }

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

    // Reverse source account balance: -(mainAmount + subAmount)
    const totalEffect = (existing.mainAmount ?? 0) + (existing.subAmount ?? 0)
    await tx.account.update({
      where: { id: existing.accountId },
      data: { currentBalance: balanceIncrement(-totalEffect) },
    })

    // Delete paired TRANSFER transaction and reverse its account balance
    if (pairedId) {
      const paired = await tx.transaction.findUnique({ where: { id: pairedId } })
      if (paired) {
        await tx.transaction.delete({ where: { id: pairedId } })
        const pairedEffect = (paired.mainAmount ?? 0) + (paired.subAmount ?? 0)
        await tx.account.update({
          where: { id: paired.accountId },
          data: { currentBalance: balanceIncrement(-pairedEffect) },
        })
      }
    }
  })

  return NextResponse.json({ success: true })
})
