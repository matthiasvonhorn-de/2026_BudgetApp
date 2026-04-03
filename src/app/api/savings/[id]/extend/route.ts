import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { generateSavingsSchedule, addMonths } from '@/lib/savings/schedule'

const ExtendSchema = z.object({
  months: z.number().int().min(1).max(360).default(24),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const body = await request.json().catch(() => ({}))
    const { months } = ExtendSchema.parse(body)

    const config = await prisma.savingsConfig.findUnique({
      where: { accountId: id },
      include: {
        account: { select: { type: true } },
        entries: { orderBy: [{ dueDate: 'asc' }, { entryType: 'asc' }] },
      },
    })
    if (!config) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (config.termMonths !== null) {
      return NextResponse.json({ error: 'Festlaufzeit-Konten können nicht verlängert werden' }, { status: 400 })
    }

    const lastEntry = config.entries[config.entries.length - 1]
    const interestPeriodMonths =
      config.interestFrequency === 'MONTHLY' ? 1
      : config.interestFrequency === 'QUARTERLY' ? 3
      : 12

    const extendFrom = lastEntry
      ? addMonths(lastEntry.dueDate, interestPeriodMonths)
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
      termMonths: months,
    })

    if (extension.length === 0) return NextResponse.json({ added: 0 })

    const result = await prisma.savingsEntry.createMany({
      data: extension.map(row => ({
        savingsConfigId: config.id,
        entryType: row.entryType,
        periodNumber: row.periodNumber + (row.entryType === 'INTEREST' ? maxInterestPeriod : maxContribPeriod),
        dueDate: row.dueDate,
        scheduledAmount: row.scheduledAmount,
        scheduledBalance: row.scheduledBalance,
      })),
    })

    return NextResponse.json({ added: result.count })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Fehler' }, { status: 500 })
  }
}
