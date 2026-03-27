import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const updateSchema = z.object({
  date: z.string().optional(),
  amount: z.number().optional(),
  description: z.string().min(1).optional(),
  payee: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  status: z.enum(['PENDING', 'CLEARED', 'RECONCILED']).optional(),
})

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = await request.json()
    const data = updateSchema.parse(body)

    const existing = await prisma.transaction.findUnique({
      where: { id },
      include: { category: { include: { subAccountGroup: true } } },
    })
    if (!existing) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })

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

      // Sync sub-account entry
      const newCategoryId = data.categoryId !== undefined ? data.categoryId : existing.categoryId
      let newSubGroupId: string | null = null
      let newLinkType = 'BOOKING'
      if (newCategoryId) {
        const cat = await tx.category.findUnique({
          where: { id: newCategoryId },
          select: { subAccountGroupId: true, subAccountLinkType: true },
        })
        newSubGroupId = cat?.subAccountGroupId ?? null
        newLinkType = cat?.subAccountLinkType ?? 'BOOKING'
      }

      const hadEntry = !!existing.subAccountEntryId

      if (hadEntry && newSubGroupId) {
        // Update existing sub-account entry
        await tx.subAccountEntry.update({
          where: { id: existing.subAccountEntryId! },
          data: { date: newDate, description: newDescription, amount: -newAmount, groupId: newSubGroupId },
        })
      } else if (hadEntry && !newSubGroupId) {
        // Remove sub-account entry
        await tx.transaction.update({ where: { id }, data: { subAccountEntryId: null } })
        await tx.subAccountEntry.delete({ where: { id: existing.subAccountEntryId! } })
      } else if (!hadEntry && newSubGroupId) {
        // Create new sub-account entry
        const entry = await tx.subAccountEntry.create({
          data: { date: newDate, description: newDescription, amount: -newAmount, fromBudget: false, groupId: newSubGroupId },
        })
        await tx.transaction.update({ where: { id }, data: { subAccountEntryId: entry.id } })
      }

      // Sync paired TRANSFER transaction
      if (existing.transferToId) {
        const paired = await tx.transaction.findUnique({ where: { id: existing.transferToId } })
        if (paired) {
          const pairedDiff = -(newAmount - existing.amount)
          if (data.amount !== undefined && data.amount !== existing.amount) {
            await tx.account.update({
              where: { id: paired.accountId },
              data: { currentBalance: { increment: pairedDiff } },
            })
          }
          await tx.transaction.update({
            where: { id: existing.transferToId },
            data: {
              ...(data.date && { date: newDate }),
              ...(data.description && { description: newDescription }),
              ...(data.amount !== undefined && { amount: -newAmount }),
            },
          })
        }
      } else if (!existing.transferToId && newSubGroupId && newLinkType === 'TRANSFER') {
        // Category changed to a TRANSFER-linked category — create paired transaction
        const group = await tx.subAccountGroup.findUnique({
          where: { id: newSubGroupId },
          include: { subAccount: true },
        })
        if (group) {
          const targetAccountId = group.subAccount.accountId
          const paired = await tx.transaction.create({
            data: {
              date: newDate,
              amount: -newAmount,
              description: newDescription,
              accountId: targetAccountId,
              categoryId: newCategoryId,
              type: 'TRANSFER',
              status: existing.status,
            },
          })
          await tx.account.update({
            where: { id: targetAccountId },
            data: { currentBalance: { increment: -newAmount } },
          })
          await tx.transaction.update({ where: { id }, data: { transferToId: paired.id } })
        }
      }

      return updated
    })

    return NextResponse.json(transaction)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: 'Fehler beim Aktualisieren' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const revertLoan = searchParams.get('revertLoan') === 'true'

  try {
    const existing = await prisma.transaction.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })

    // Prüfen ob eine Kreditrate mit dieser Transaktion verknüpft ist
    const linkedPayment = await prisma.loanPayment.findFirst({
      where: { transactionId: id },
    })

    await prisma.$transaction(async (tx) => {
      const pairedId = existing.transferToId

      // Kreditrate: transactionId immer bereinigen; paidAt nur bei revertLoan zurücksetzen
      if (linkedPayment) {
        await tx.loanPayment.update({
          where: { loanId_periodNumber: { loanId: linkedPayment.loanId, periodNumber: linkedPayment.periodNumber } },
          data: {
            transactionId: null,
            ...(revertLoan && { paidAt: null }),
          },
        })
      }

      // Unlink sub-account entry before deleting
      await tx.transaction.update({ where: { id }, data: { subAccountEntryId: null, transferToId: null } })
      await tx.transaction.delete({ where: { id } })

      // Reverse source account balance
      await tx.account.update({
        where: { id: existing.accountId },
        data: { currentBalance: { increment: -existing.amount } },
      })

      // Delete linked sub-account entry
      if (existing.subAccountEntryId) {
        await tx.subAccountEntry.delete({ where: { id: existing.subAccountEntryId } })
      }

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
  } catch {
    return NextResponse.json({ error: 'Fehler beim Löschen' }, { status: 500 })
  }
}
