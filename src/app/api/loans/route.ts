import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { calcAnnuityFromRates, generateSchedule } from '@/lib/loans/amortization'

const CreateLoanSchema = z.object({
  name: z.string().min(1),
  loanType: z.enum(['ANNUITAETENDARLEHEN', 'RATENKREDIT']),
  principal: z.number().positive(),
  interestRate: z.number().min(0),          // p.a. als Dezimal
  initialRepaymentRate: z.number().min(0).optional(),  // p.a. als Dezimal (Annuitätendarlehen)
  termMonths: z.number().int().positive(),
  startDate: z.string(),
  accountId: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  paidUntil: z.string().optional().nullable(),
})

export async function GET() {
  try {
    const loans = await prisma.loan.findMany({
      where: { isActive: true },
      include: {
        account: { select: { id: true, name: true, color: true } },
        payments: { orderBy: { periodNumber: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    })

    const result = loans.map(loan => {
      const paidRows = loan.payments.filter(p => p.paidAt !== null)
      const totalInterestPaid = paidRows.reduce((s, p) => s + p.scheduledInterest, 0)
      const totalPrincipalPaid = paidRows.reduce((s, p) => s + p.scheduledPrincipal, 0)
      const extraPaid = paidRows.reduce((s, p) => s + p.extraPayment, 0)
      const remainingBalance = loan.payments.at(-1)?.scheduledBalance ?? 0
      const nextUnpaid = loan.payments.find(p => p.paidAt === null)

      return {
        ...loan,
        payments: undefined,
        stats: {
          totalInterestPaid: Math.round(totalInterestPaid * 100) / 100,
          totalPrincipalPaid: Math.round((totalPrincipalPaid + extraPaid) * 100) / 100,
          remainingBalance: Math.round(remainingBalance * 100) / 100,
          periodsPaid: paidRows.length,
          totalPeriods: loan.payments.length,
          nextDueDate: nextUnpaid?.dueDate ?? null,
        },
      }
    })

    return NextResponse.json(result)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Fehler beim Laden' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const data = CreateLoanSchema.parse(body)

    const startDate = new Date(data.startDate)
    const annualRate = data.interestRate
    const repaymentRate = data.initialRepaymentRate ?? 0

    // Monatliche Rate berechnen
    let monthlyPayment: number
    if (data.loanType === 'ANNUITAETENDARLEHEN') {
      monthlyPayment = calcAnnuityFromRates(data.principal, annualRate, repaymentRate)
    } else {
      monthlyPayment = 0  // Ratenkredit: variabel
    }

    const loan = await prisma.loan.create({
      data: {
        name: data.name,
        loanType: data.loanType,
        principal: data.principal,
        interestRate: annualRate,
        initialRepaymentRate: repaymentRate,
        termMonths: data.termMonths,
        startDate,
        monthlyPayment: Math.round(monthlyPayment * 100) / 100,
        accountId: data.accountId ?? null,
        categoryId: data.categoryId ?? null,
        notes: data.notes ?? null,
      },
    })

    // Tilgungsplan vorberechnen und speichern
    const schedule = generateSchedule({
      loanType: data.loanType,
      principal: data.principal,
      interestRate: annualRate,
      initialRepaymentRate: repaymentRate,
      termMonths: data.termMonths,
      startDate,
      monthlyPayment,
    }, data.principal, 1, data.termMonths)

    await prisma.loanPayment.createMany({
      data: schedule.map(row => ({
        loanId: loan.id,
        periodNumber: row.periodNumber,
        dueDate: row.dueDate,
        scheduledPrincipal: row.scheduledPrincipal,
        scheduledInterest: row.scheduledInterest,
        scheduledBalance: row.scheduledBalance,
        extraPayment: 0,
      })),
    })

    if (data.paidUntil) {
      await prisma.loanPayment.updateMany({
        where: {
          loanId: loan.id,
          transactionId: null,
          dueDate: { lte: new Date(data.paidUntil) },
        },
        data: { paidAt: new Date() },
      })
    }

    return NextResponse.json(loan, { status: 201 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Fehler beim Erstellen' }, { status: 500 })
  }
}
