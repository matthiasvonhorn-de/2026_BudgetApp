import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { generateSavingsSchedule, addMonths } from '@/lib/savings/schedule'

const CreateSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
  savingsType: z.enum(['SPARPLAN', 'FESTGELD']),
  initialBalance: z.number().min(0).optional(),
  accountNumber: z.string().nullable().optional(),
  contributionAmount: z.number().min(0).optional(),
  contributionFrequency: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUALLY']).nullable().optional(),
  interestRate: z.number().min(0),
  interestFrequency: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUALLY']),
  startDate: z.string(),
  termMonths: z.number().int().positive().nullable().optional(),
  linkedAccountId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  initializedUntil: z.string().nullable().optional(), // initialization cutoff date — no transactions created
})

/**
 * For fixed-term plans: use termMonths exactly.
 * For unlimited plans: generate from startDate through today + 24 months,
 * so past history is covered and there are always at least 24 months ahead.
 */
function computeScheduleMonths(startDate: Date, termMonths: number | null): number {
  if (termMonths !== null) return termMonths
  const horizon = addMonths(new Date(), 24)
  const diffMs = Math.max(0, horizon.getTime() - startDate.getTime())
  const months = Math.ceil(diffMs / (30.44 * 24 * 60 * 60 * 1000))
  return Math.max(months, 24)
}

export async function GET() {
  try {
    const configs = await prisma.savingsConfig.findMany({
      where: { account: { isActive: true } },
      include: {
        account: { select: { id: true, name: true, color: true, type: true, currentBalance: true } },
        entries: { orderBy: [{ dueDate: 'asc' }, { entryType: 'asc' }] },
      },
      orderBy: { createdAt: 'asc' },
    })

    const result = configs.map(cfg => {
      const paidEntries = cfg.entries.filter(e => e.paidAt !== null)
      const totalInterest = paidEntries
        .filter(e => e.entryType === 'INTEREST')
        .reduce((s, e) => s + e.scheduledAmount, 0)
      const totalContributions = paidEntries
        .filter(e => e.entryType === 'CONTRIBUTION')
        .reduce((s, e) => s + e.scheduledAmount, 0)
      const nextUnpaidContrib = cfg.entries.find(
        e => e.entryType === 'CONTRIBUTION' && e.paidAt === null
      )

      return {
        ...cfg,
        entries: undefined,
        stats: {
          totalInterestPaid: Math.round(totalInterest * 100) / 100,
          totalContributionsPaid: Math.round(totalContributions * 100) / 100,
          nextDueDate: nextUnpaidContrib?.dueDate ?? null,
          totalEntries: cfg.entries.length,
          paidEntries: paidEntries.length,
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
    const data = CreateSchema.parse(body)

    const startDate = new Date(data.startDate)
    const initialBalance = data.initialBalance ?? 0
    const contributionAmount = data.savingsType === 'SPARPLAN' ? (data.contributionAmount ?? 0) : 0
    const contributionFrequency = data.savingsType === 'SPARPLAN'
      ? (data.contributionFrequency ?? null)
      : null

    const scheduleMonths = computeScheduleMonths(startDate, data.termMonths ?? null)

    const result = await prisma.$transaction(async (tx) => {
      // 1. Account anlegen (currentBalance wird ggf. nach Initialisierung aktualisiert)
      const account = await tx.account.create({
        data: {
          name: data.name,
          type: data.savingsType,
          color: data.color ?? '#10b981',
          currentBalance: initialBalance,
          isActive: true,
        },
      })

      // 2. SavingsConfig anlegen
      const config = await tx.savingsConfig.create({
        data: {
          accountId: account.id,
          initialBalance,
          accountNumber: data.accountNumber ?? null,
          contributionAmount,
          contributionFrequency: contributionFrequency ?? null,
          interestRate: data.interestRate,
          interestFrequency: data.interestFrequency,
          startDate,
          termMonths: data.termMonths ?? null,
          linkedAccountId: data.linkedAccountId ?? null,
          categoryId: data.categoryId ?? null,
          notes: data.notes ?? null,
        },
      })

      // 3. Zahlungsplan berechnen und speichern
      const schedule = generateSavingsSchedule({
        savingsType: data.savingsType,
        initialBalance,
        contributionAmount,
        contributionFrequency: contributionFrequency ?? null,
        interestRate: data.interestRate,
        interestFrequency: data.interestFrequency,
        startDate,
        termMonths: scheduleMonths,
      })

      await tx.savingsEntry.createMany({
        data: schedule.map(row => ({
          savingsConfigId: config.id,
          entryType: row.entryType,
          periodNumber: row.periodNumber,
          dueDate: row.dueDate,
          scheduledAmount: row.scheduledAmount,
          scheduledBalance: row.scheduledBalance,
        })),
      })

      // 4. Vergangene Einträge initialisieren:
      //    paidAt wird gesetzt, aber KEINE Transaktionen angelegt (auch keine Gegenbuchungen).
      //    Der Kontostand wird direkt auf den kumulierten Saldo gesetzt.
      const today = new Date()
      today.setHours(23, 59, 59, 999)
      const initCutoff = data.initializedUntil
        ? (() => { const d = new Date(data.initializedUntil!); d.setHours(23, 59, 59, 999); return d })()
        : today

      const pastRows = schedule
        .filter(row => row.dueDate <= initCutoff)
        .sort((a, b) =>
          a.dueDate.getTime() - b.dueDate.getTime() ||
          (a.entryType === 'INTEREST' ? -1 : 1)
        )

      if (pastRows.length > 0) {
        await tx.savingsEntry.updateMany({
          where: { savingsConfigId: config.id, dueDate: { lte: initCutoff } },
          data: { paidAt: new Date() },
          // transactionId bleibt null → kennzeichnet "initialisiert ohne Buchung"
        })

        const lastRow = pastRows[pastRows.length - 1]
        await tx.account.update({
          where: { id: account.id },
          data: { currentBalance: lastRow.scheduledBalance },
        })
      }

      return { account, config }
    })

    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Fehler beim Erstellen' }, { status: 500 })
  }
}
