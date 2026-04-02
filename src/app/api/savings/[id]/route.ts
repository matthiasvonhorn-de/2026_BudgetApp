import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { generateSavingsSchedule } from '@/lib/savings/schedule'

const UpdateSchema = z.object({
  // Metadaten
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  accountNumber: z.string().nullable().optional(),
  linkedAccountId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  // Nur Zinssatz darf nachträglich geändert werden (→ Neuberechnung INTEREST-Einträge)
  interestRate: z.number().min(0).optional(),
})

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const config = await prisma.savingsConfig.findUnique({
      where: { accountId: id },
      include: {
        account: { select: { id: true, name: true, color: true, type: true, currentBalance: true } },
        linkedAccount: { select: { id: true, name: true } },
        entries: { orderBy: [{ dueDate: 'asc' }, { entryType: 'asc' }] },
      },
    })
    if (!config) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Lazy-extend schedule for unlimited savings plans when entries run out
    if (config.termMonths === null) {
      const lastEntry = config.entries[config.entries.length - 1]
      const twoYearsFromNow = new Date()
      twoYearsFromNow.setFullYear(twoYearsFromNow.getFullYear() + 2)

      if (!lastEntry || lastEntry.dueDate <= twoYearsFromNow) {
        const interestPeriodMonths =
          config.interestFrequency === 'MONTHLY' ? 1
          : config.interestFrequency === 'QUARTERLY' ? 3
          : 12

        const extendFrom = lastEntry
          ? new Date(new Date(lastEntry.dueDate).setMonth(new Date(lastEntry.dueDate).getMonth() + interestPeriodMonths))
          : config.startDate

        const maxInterestPeriod = config.entries
          .filter(e => e.entryType === 'INTEREST')
          .reduce((m, e) => Math.max(m, e.periodNumber), 0)
        const maxContribPeriod = config.entries
          .filter(e => e.entryType === 'CONTRIBUTION')
          .reduce((m, e) => Math.max(m, e.periodNumber), 0)

        const extension = generateSavingsSchedule({
          savingsType: config.account.type as 'SPARPLAN' | 'FESTGELD',
          initialBalance: lastEntry?.scheduledBalance ?? config.initialBalance,
          contributionAmount: config.contributionAmount,
          contributionFrequency: config.contributionFrequency as 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY' | null,
          interestRate: config.interestRate,
          interestFrequency: config.interestFrequency as 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY',
          startDate: extendFrom,
          termMonths: 600,
        })

        if (extension.length > 0) {
          await prisma.savingsEntry.createMany({
            data: extension.map(row => ({
              savingsConfigId: config.id,
              entryType: row.entryType,
              periodNumber: row.periodNumber + (row.entryType === 'INTEREST' ? maxInterestPeriod : maxContribPeriod),
              dueDate: row.dueDate,
              scheduledAmount: row.scheduledAmount,
              scheduledBalance: row.scheduledBalance,
            })),
            skipDuplicates: true,
          })

          const extended = await prisma.savingsEntry.findMany({
            where: { savingsConfigId: config.id },
            orderBy: [{ dueDate: 'asc' }, { entryType: 'asc' }],
          })
          ;(config as any).entries = extended
        }
      }
    }

    const paidEntries = config.entries.filter(e => e.paidAt !== null)
    const totalInterest = paidEntries
      .filter(e => e.entryType === 'INTEREST')
      .reduce((s, e) => s + e.scheduledAmount, 0)
    const totalContributions = paidEntries
      .filter(e => e.entryType === 'CONTRIBUTION')
      .reduce((s, e) => s + e.scheduledAmount, 0)
    const nextUnpaidContrib = config.entries.find(
      e => e.entryType === 'CONTRIBUTION' && e.paidAt === null
    )

    return NextResponse.json({
      ...config,
      stats: {
        totalInterestPaid: Math.round(totalInterest * 100) / 100,
        totalContributionsPaid: Math.round(totalContributions * 100) / 100,
        nextDueDate: nextUnpaidContrib?.dueDate ?? null,
        totalEntries: config.entries.length,
        paidEntries: paidEntries.length,
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

    const config = await prisma.savingsConfig.findUnique({
      where: { accountId: id },
      include: {
        account: { select: { type: true } },
        entries: true,
      },
    })
    if (!config) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const interestRateChanged =
      data.interestRate !== undefined &&
      Math.abs(data.interestRate - config.interestRate) > 1e-9

    await prisma.$transaction(async (tx) => {
      // Account-Name und Farbe aktualisieren
      if (data.name !== undefined || data.color !== undefined) {
        await tx.account.update({
          where: { id },
          data: {
            ...(data.name !== undefined && { name: data.name }),
            ...(data.color !== undefined && { color: data.color }),
          },
        })
      }

      // SavingsConfig Metadaten
      await tx.savingsConfig.update({
        where: { accountId: id },
        data: {
          ...(data.accountNumber !== undefined && { accountNumber: data.accountNumber }),
          ...(data.linkedAccountId !== undefined && { linkedAccountId: data.linkedAccountId }),
          ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
          ...(data.notes !== undefined && { notes: data.notes }),
          ...(data.interestRate !== undefined && { interestRate: data.interestRate }),
        },
      })

      if (!interestRateChanged) return

      // Zinssatz geändert: unbezahlte INTEREST-Einträge neu berechnen
      const newRate = data.interestRate!

      // Letzten bezahlten INTEREST-Eintrag finden (Startpunkt)
      const lastPaidInterest = config.entries
        .filter(e => e.entryType === 'INTEREST' && e.paidAt !== null)
        .sort((a, b) => b.periodNumber - a.periodNumber)[0]

      // Alle unbezahlten INTEREST-Einträge löschen
      await tx.savingsEntry.deleteMany({
        where: { savingsConfigId: config.id, entryType: 'INTEREST', paidAt: null },
      })

      // Saldo nach dem letzten bezahlten Eintrag ermitteln
      const allPaidSorted = config.entries
        .filter(e => e.paidAt !== null)
        .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || (a.entryType === 'INTEREST' ? -1 : 1))
      const balanceAfterPaid = allPaidSorted.length > 0
        ? allPaidSorted[allPaidSorted.length - 1].scheduledBalance
        : config.initialBalance

      // Startdatum für neue Einträge = Tag nach dem letzten bezahlten Eintrag
      const firstUnpaidContrib = config.entries
        .filter(e => e.entryType === 'CONTRIBUTION' && e.paidAt === null)
        .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0]
      const rebuildFrom = firstUnpaidContrib?.dueDate ?? lastPaidInterest?.dueDate ?? config.startDate

      // Verbleibende Monate berechnen
      const totalMonths = config.termMonths ?? 60
      const elapsedMs = rebuildFrom.getTime() - config.startDate.getTime()
      const elapsedMonths = Math.round(elapsedMs / (1000 * 60 * 60 * 24 * 30.44))
      const remainingMonths = Math.max(totalMonths - elapsedMonths, 0)

      if (remainingMonths > 0) {
        const newSchedule = generateSavingsSchedule({
          savingsType: (config.account?.type ?? 'SPARPLAN') as 'SPARPLAN' | 'FESTGELD',
          initialBalance: balanceAfterPaid,
          contributionAmount: config.contributionAmount,
          contributionFrequency: config.contributionFrequency as 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY' | null,
          interestRate: newRate,
          interestFrequency: config.interestFrequency as 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY',
          startDate: rebuildFrom,
          termMonths: remainingMonths,
        })

        const interestOnly = newSchedule.filter(r => r.entryType === 'INTEREST')
        let interestCounter = (lastPaidInterest?.periodNumber ?? 0)

        await tx.savingsEntry.createMany({
          data: interestOnly.map(row => ({
            savingsConfigId: config.id,
            entryType: 'INTEREST' as const,
            periodNumber: ++interestCounter,
            dueDate: row.dueDate,
            scheduledAmount: row.scheduledAmount,
            scheduledBalance: row.scheduledBalance,
          })),
        })

        // scheduledBalance der unbezahlten CONTRIBUTION-Einträge neu berechnen
        const unpaidContribs = config.entries
          .filter(e => e.entryType === 'CONTRIBUTION' && e.paidAt === null)
          .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())

        // Alle neuen Einträge zusammenführen und Saldo neu durchrechnen
        const allUnpaid = [
          ...interestOnly.map(r => ({ ...r, id: null })),
          ...unpaidContribs.map(r => ({ entryType: 'CONTRIBUTION' as const, dueDate: r.dueDate, scheduledAmount: r.scheduledAmount, id: r.id })),
        ].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || (a.entryType === 'INTEREST' ? -1 : 1))

        let runningBalance = balanceAfterPaid
        for (const entry of allUnpaid) {
          runningBalance = Math.round((runningBalance + entry.scheduledAmount) * 100) / 100
          if (entry.entryType === 'CONTRIBUTION' && entry.id) {
            await tx.savingsEntry.update({
              where: { id: entry.id },
              data: { scheduledBalance: runningBalance },
            })
          }
        }
      }
    })

    return NextResponse.json({ success: true })
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
    await prisma.account.update({ where: { id }, data: { isActive: false } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Fehler' }, { status: 500 })
  }
}
