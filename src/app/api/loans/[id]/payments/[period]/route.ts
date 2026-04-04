import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { generateSchedule } from '@/lib/loans/amortization'
import { withHandler } from '@/lib/api/handler'
import { DomainError } from '@/lib/api/errors'

const UpdatePaymentSchema = z.object({
  paid: z.boolean().optional(),
  extraPayment: z.number().min(0).optional(),
  categoryId: z.string().nullable().optional(),  // einmalig setzen → wird dauerhaft am Kredit gespeichert
  notes: z.string().nullable().optional(),
})

export const PUT = withHandler(async (request: Request, ctx) => {
  const { id, period } = await (ctx as { params: Promise<{ id: string; period: string }> }).params
  const periodNumber = parseInt(period)

  const body = await request.json()
  const data = UpdatePaymentSchema.parse(body)

  let loan = await prisma.loan.findUnique({
    where: { id },
    include: { payments: { orderBy: { periodNumber: 'asc' } } },
  })
  if (!loan) throw new DomainError('Not found', 404)

  const currentRow = loan.payments.find(p => p.periodNumber === periodNumber)
  if (!currentRow) throw new DomainError('Period not found', 404)

  const extraPayment = data.extraPayment ?? currentRow.extraPayment
  const wasPaid = currentRow.paidAt !== null
  const paidAt = data.paid === true
    ? (currentRow.paidAt ?? new Date())
    : data.paid === false ? null : currentRow.paidAt
  const nowPaid = paidAt !== null

  // Gesamtbetrag der Rate (Zinsen + Tilgung + Sondertilgung) als negativer Wert (Ausgabe)
  const totalPayment = -(currentRow.scheduledPrincipal + currentRow.scheduledInterest + extraPayment)

  await prisma.$transaction(async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    let loanData = loan!
    // 1. categoryId dauerhaft am Kredit speichern (falls mitgeschickt und noch nicht gesetzt)
    if (data.categoryId !== undefined && data.categoryId !== loanData.categoryId) {
      await tx.loan.update({ where: { id }, data: { categoryId: data.categoryId } })
      loanData = { ...loanData, categoryId: data.categoryId }
    }
    const effectiveCategoryId = loanData.categoryId

    // 2. Aktuelle Zeile updaten
    await tx.loanPayment.update({
      where: { loanId_periodNumber: { loanId: id, periodNumber } },
      data: {
        extraPayment,
        paidAt,
        notes: data.notes !== undefined ? data.notes : currentRow.notes,
      },
    })

    // 3. Transaktion auf verknüpftem Konto buchen / aktualisieren / stornieren
    if (loanData.accountId) {
      if (!wasPaid && nowPaid) {
        // Neu als bezahlt markiert → Transaktion anlegen
        const t = await tx.transaction.create({
          data: {
            date: currentRow.dueDate,
            amount: totalPayment,
            description: `Kredit: ${loanData.name} – Rate ${periodNumber}`,
            notes: `Zinsen: ${currentRow.scheduledInterest.toFixed(2)} | Tilgung: ${(currentRow.scheduledPrincipal + extraPayment).toFixed(2)}`,
            accountId: loanData.accountId,
            categoryId: effectiveCategoryId ?? null,
            type: 'EXPENSE',
            status: 'CLEARED',
          },
        })
        await tx.account.update({
          where: { id: loanData.accountId },
          data: { currentBalance: { increment: totalPayment } },
        })
        await tx.loanPayment.update({
          where: { loanId_periodNumber: { loanId: id, periodNumber } },
          data: { transactionId: t.id },
        })
      } else if (wasPaid && !nowPaid && currentRow.transactionId) {
        // Als offen markiert → Transaktion stornieren
        const existing = await tx.transaction.findUnique({ where: { id: currentRow.transactionId } })
        if (existing) {
          await tx.transaction.delete({ where: { id: existing.id } })
          await tx.account.update({
            where: { id: loanData.accountId },
            data: { currentBalance: { increment: -existing.amount } },
          })
        }
        await tx.loanPayment.update({
          where: { loanId_periodNumber: { loanId: id, periodNumber } },
          data: { transactionId: null },
        })
      } else if (nowPaid && currentRow.transactionId && data.extraPayment !== undefined && data.extraPayment !== currentRow.extraPayment) {
        // Sondertilgung geändert bei bereits bezahlter Rate → Transaktionsbetrag korrigieren
        const existing = await tx.transaction.findUnique({ where: { id: currentRow.transactionId } })
        if (existing) {
          const diff = totalPayment - existing.amount
          await tx.transaction.update({
            where: { id: existing.id },
            data: {
              amount: totalPayment,
              notes: `Zinsen: ${currentRow.scheduledInterest.toFixed(2)} | Tilgung: ${(currentRow.scheduledPrincipal + extraPayment).toFixed(2)}`,
            },
          })
          await tx.account.update({
            where: { id: loanData.accountId },
            data: { currentBalance: { increment: diff } },
          })
        }
      }
    }
  })

  // 3. Folgezeilen neu berechnen wenn Sondertilgung geändert wurde
  if (data.extraPayment !== undefined && data.extraPayment !== currentRow.extraPayment) {
    const newBalance = Math.max(0, currentRow.scheduledBalance - (extraPayment - currentRow.extraPayment))

    if (newBalance > 0.005) {
      const nextPeriod = periodNumber + 1
      const followingRows = loan.payments.filter(p => p.periodNumber >= nextPeriod)

      const newSchedule = generateSchedule(
        {
          loanType: loan.loanType as 'ANNUITAETENDARLEHEN' | 'RATENKREDIT',
          principal: loan.principal,
          interestRate: loan.interestRate,
          initialRepaymentRate: loan.initialRepaymentRate,
          termMonths: loan.termMonths,
          startDate: new Date(loan.startDate),
          monthlyPayment: loan.monthlyPayment,
        },
        newBalance,
        nextPeriod,
        followingRows.length + 10,
      )

      for (const row of newSchedule) {
        const existing = followingRows.find(p => p.periodNumber === row.periodNumber)
        if (existing) {
          await prisma.loanPayment.update({
            where: { loanId_periodNumber: { loanId: id, periodNumber: row.periodNumber } },
            data: {
              scheduledPrincipal: row.scheduledPrincipal,
              scheduledInterest: row.scheduledInterest,
              scheduledBalance: row.scheduledBalance,
            },
          })
        }
      }

      const lastNewPeriod = newSchedule.at(-1)?.periodNumber ?? nextPeriod - 1
      const orphans = followingRows.filter(p => p.periodNumber > lastNewPeriod)
      if (orphans.length > 0) {
        await prisma.loanPayment.deleteMany({
          where: { loanId: id, periodNumber: { in: orphans.map(o => o.periodNumber) } },
        })
      }
    } else {
      await prisma.loanPayment.deleteMany({
        where: { loanId: id, periodNumber: { gte: periodNumber + 1 } },
      })
    }
  }

  const updated = await prisma.loan.findUnique({
    where: { id },
    include: { payments: { orderBy: { periodNumber: 'asc' } } },
  })
  return NextResponse.json(updated)
})
