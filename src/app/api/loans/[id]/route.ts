import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { calcAnnuityFromRates, generateSchedule } from '@/lib/loans/amortization'
import { withHandler } from '@/lib/api/handler'
import { DomainError } from '@/lib/api/errors'
import { roundCents, balanceIncrement } from '@/lib/money'

const UpdateSchema = z.object({
  // Metadaten — änderbar ohne Plan-Neuberechnung
  name: z.string().min(1).optional(),
  accountId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  paidUntil: z.string().nullable().optional(),
  // Finanzparameter — bei Änderung wird Tilgungsplan neu berechnet
  loanType: z.enum(['ANNUITAETENDARLEHEN', 'RATENKREDIT']).optional(),
  principal: z.number().positive().optional(),
  interestRate: z.number().min(0).optional(),
  initialRepaymentRate: z.number().min(0).optional(),
  termMonths: z.number().int().positive().optional(),
  startDate: z.string().optional(),
})

// Schneidet paidUntil auf das nächst kleinere vorhandene Payment-Datum
async function resolveEffectivePaidUntil(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], loanId: string, paidUntil: string | null): Promise<Date | null> {
  if (!paidUntil) return null
  const cutoff = new Date(paidUntil)
  const latest = await tx.loanPayment.findFirst({
    where: { loanId, dueDate: { lte: cutoff } },
    orderBy: { dueDate: 'desc' },
    select: { dueDate: true },
  })
  return latest?.dueDate ?? null
}

export const GET = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const loan = await prisma.loan.findUnique({
    where: { id },
    include: {
      account: { select: { id: true, name: true, color: true } },
      payments: { orderBy: { periodNumber: 'asc' } },
    },
  })
  if (!loan) throw new DomainError('Not found', 404)

  const paidRows = loan.payments.filter(p => p.paidAt !== null)
  const totalInterestPaid = paidRows.reduce((s, p) => s + p.scheduledInterest, 0)
  const totalPrincipalPaid = paidRows.reduce((s, p) => s + p.scheduledPrincipal + p.extraPayment, 0)

  return NextResponse.json({
    ...loan,
    paidUntil: loan.paidUntil ? loan.paidUntil.toISOString().slice(0, 10) : null,
    stats: {
      totalInterestPaid: roundCents(totalInterestPaid),
      totalPrincipalPaid: roundCents(totalPrincipalPaid),
      remainingBalance: loan.payments.at(-1)?.scheduledBalance ?? 0,
      periodsPaid: paidRows.length,
      totalPeriods: loan.payments.length,
    },
  })
})

export const PUT = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const body = await request.json()
  const data = UpdateSchema.parse(body)

  const existing = await prisma.loan.findUnique({ where: { id } })
  if (!existing) throw new DomainError('Not found', 404)

  // Echter Wertevergleich statt nur "ist vorhanden"
  const existingStartDate = new Date(existing.startDate).toISOString().slice(0, 10)
  const financialChanged =
    (data.loanType !== undefined && data.loanType !== existing.loanType) ||
    (data.principal !== undefined && data.principal !== existing.principal) ||
    (data.interestRate !== undefined && Math.abs(data.interestRate - existing.interestRate) > 1e-9) ||
    (data.initialRepaymentRate !== undefined && Math.abs((data.initialRepaymentRate ?? 0) - existing.initialRepaymentRate) > 1e-9) ||
    (data.termMonths !== undefined && data.termMonths !== existing.termMonths) ||
    (data.startDate !== undefined && data.startDate !== existingStartDate)

  if (!financialChanged) {
    // Nur Metadaten — atomisches Update
    const loan = await prisma.$transaction(async (tx) => {
      const effectivePaidUntil = data.paidUntil !== undefined
        ? await resolveEffectivePaidUntil(tx, id, data.paidUntil)
        : undefined

      const updated = await tx.loan.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.accountId !== undefined && { accountId: data.accountId }),
          ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
          ...(data.notes !== undefined && { notes: data.notes }),
          ...(effectivePaidUntil !== undefined && { paidUntil: effectivePaidUntil }),
        },
      })

      if (data.paidUntil !== undefined) {
        if (effectivePaidUntil === null) {
          await tx.loanPayment.updateMany({
            where: { loanId: id, transactionId: null },
            data: { paidAt: null },
          })
        } else {
          await tx.loanPayment.updateMany({
            where: { loanId: id, transactionId: null, dueDate: { lte: effectivePaidUntil } },
            data: { paidAt: new Date() },
          })
          await tx.loanPayment.updateMany({
            where: { loanId: id, transactionId: null, dueDate: { gt: effectivePaidUntil } },
            data: { paidAt: null },
          })
        }
      }

      return updated
    })

    return NextResponse.json({
      ...loan,
      paidUntil: loan.paidUntil ? loan.paidUntil.toISOString().slice(0, 10) : null,
    })
  }

  // Finanzparameter geändert → Tilgungsplan neu berechnen
  const loanType = (data.loanType ?? existing.loanType) as 'ANNUITAETENDARLEHEN' | 'RATENKREDIT'
  const principal = data.principal ?? existing.principal
  const interestRate = data.interestRate ?? existing.interestRate
  const repaymentRate = data.initialRepaymentRate ?? existing.initialRepaymentRate
  const termMonths = data.termMonths ?? existing.termMonths
  const startDate = data.startDate ? new Date(data.startDate) : new Date(existing.startDate)

  const monthlyPayment = loanType === 'ANNUITAETENDARLEHEN'
    ? calcAnnuityFromRates(principal, interestRate, repaymentRate)
    : 0

  const loan = await prisma.$transaction(async (tx) => {
    // Alle bestehenden Raten löschen (inkl. ggf. verknüpfte Transaktionen via transactionId)
    const existingPayments = await tx.loanPayment.findMany({ where: { loanId: id } })
    for (const p of existingPayments) {
      if (p.transactionId) {
        const t = await tx.transaction.findUnique({ where: { id: p.transactionId } })
        if (t) {
          await tx.transaction.delete({ where: { id: t.id } })
          await tx.account.update({
            where: { id: t.accountId },
            data: { currentBalance: balanceIncrement(-((t.mainAmount ?? 0) + (t.subAmount ?? 0))) },
          })
        }
      }
    }
    await tx.loanPayment.deleteMany({ where: { loanId: id } })

    // Kredit updaten
    const updated = await tx.loan.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.accountId !== undefined && { accountId: data.accountId }),
        ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
        ...(data.notes !== undefined && { notes: data.notes }),
        loanType,
        principal,
        interestRate,
        initialRepaymentRate: repaymentRate,
        termMonths,
        startDate,
        monthlyPayment: roundCents(monthlyPayment),
      },
    })

    // Neuen Tilgungsplan berechnen und speichern
    const schedule = generateSchedule(
      { loanType, principal, interestRate, initialRepaymentRate: repaymentRate, termMonths, startDate, monthlyPayment },
      principal, 1, termMonths,
    )
    await tx.loanPayment.createMany({
      data: schedule.map(row => ({
        loanId: id,
        periodNumber: row.periodNumber,
        dueDate: row.dueDate,
        scheduledPrincipal: row.scheduledPrincipal,
        scheduledInterest: row.scheduledInterest,
        scheduledBalance: row.scheduledBalance,
        extraPayment: 0,
      })),
    })

    if (data.paidUntil !== undefined) {
      const effectivePaidUntil = await resolveEffectivePaidUntil(tx, id, data.paidUntil)

      // paidUntil im Kredit-Datensatz speichern
      await tx.loan.update({
        where: { id },
        data: { paidUntil: effectivePaidUntil },
      })

      if (effectivePaidUntil === null) {
        await tx.loanPayment.updateMany({
          where: { loanId: id, transactionId: null },
          data: { paidAt: null },
        })
      } else {
        await tx.loanPayment.updateMany({
          where: { loanId: id, transactionId: null, dueDate: { lte: effectivePaidUntil } },
          data: { paidAt: new Date() },
        })
        await tx.loanPayment.updateMany({
          where: { loanId: id, transactionId: null, dueDate: { gt: effectivePaidUntil } },
          data: { paidAt: null },
        })
      }
    }

    return updated
  })

  return NextResponse.json({
    ...loan,
    paidUntil: loan.paidUntil ? loan.paidUntil.toISOString().slice(0, 10) : null,
  })
})

export const DELETE = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  await prisma.loan.update({ where: { id }, data: { isActive: false } })
  return NextResponse.json({ success: true })
})
