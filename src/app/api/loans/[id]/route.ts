import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { calcAnnuityFromRates, generateSchedule } from '@/lib/loans/amortization'

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

const FINANCIAL_KEYS = ['loanType', 'principal', 'interestRate', 'initialRepaymentRate', 'termMonths', 'startDate'] as const

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const loan = await prisma.loan.findUnique({
      where: { id },
      include: {
        account: { select: { id: true, name: true, color: true } },
        payments: { orderBy: { periodNumber: 'asc' } },
      },
    })
    if (!loan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const paidRows = loan.payments.filter(p => p.paidAt !== null)
    const totalInterestPaid = paidRows.reduce((s, p) => s + p.scheduledInterest, 0)
    const totalPrincipalPaid = paidRows.reduce((s, p) => s + p.scheduledPrincipal + p.extraPayment, 0)

    return NextResponse.json({
      ...loan,
      stats: {
        totalInterestPaid: Math.round(totalInterestPaid * 100) / 100,
        totalPrincipalPaid: Math.round(totalPrincipalPaid * 100) / 100,
        remainingBalance: loan.payments.at(-1)?.scheduledBalance ?? 0,
        periodsPaid: paidRows.length,
        totalPeriods: loan.payments.length,
      },
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Fehler' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const body = await request.json()
    const data = UpdateSchema.parse(body)

    const existing = await prisma.loan.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const financialChanged = FINANCIAL_KEYS.some(k => data[k] !== undefined)

    if (!financialChanged) {
      // Nur Metadaten — atomisches Update
      const loan = await prisma.$transaction(async (tx) => {
        const updated = await tx.loan.update({
          where: { id },
          data: {
            ...(data.name !== undefined && { name: data.name }),
            ...(data.accountId !== undefined && { accountId: data.accountId }),
            ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
            ...(data.notes !== undefined && { notes: data.notes }),
          },
        })

        if (data.paidUntil !== undefined) {
          if (data.paidUntil === null) {
            await tx.loanPayment.updateMany({
              where: { loanId: id, transactionId: null },
              data: { paidAt: null },
            })
          } else {
            const cutoff = new Date(data.paidUntil)
            await tx.loanPayment.updateMany({
              where: { loanId: id, transactionId: null, dueDate: { lte: cutoff } },
              data: { paidAt: new Date() },
            })
            await tx.loanPayment.updateMany({
              where: { loanId: id, transactionId: null, dueDate: { gt: cutoff } },
              data: { paidAt: null },
            })
          }
        }

        return updated
      })

      return NextResponse.json(loan)
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
              data: { currentBalance: { increment: -t.amount } },
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
          monthlyPayment: Math.round(monthlyPayment * 100) / 100,
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
        if (data.paidUntil === null) {
          await tx.loanPayment.updateMany({
            where: { loanId: id, transactionId: null },
            data: { paidAt: null },
          })
        } else {
          const cutoff = new Date(data.paidUntil)
          await tx.loanPayment.updateMany({
            where: { loanId: id, transactionId: null, dueDate: { lte: cutoff } },
            data: { paidAt: new Date() },
          })
          await tx.loanPayment.updateMany({
            where: { loanId: id, transactionId: null, dueDate: { gt: cutoff } },
            data: { paidAt: null },
          })
        }
      }

      return updated
    })

    return NextResponse.json(loan)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Fehler' }, { status: 500 })
  }
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    await prisma.loan.update({ where: { id }, data: { isActive: false } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Fehler' }, { status: 500 })
  }
}
