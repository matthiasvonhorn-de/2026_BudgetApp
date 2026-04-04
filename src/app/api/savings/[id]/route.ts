import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateSavingsSchedule, addMonths } from '@/lib/savings/schedule'
import { withHandler } from '@/lib/api/handler'
import { DomainError } from '@/lib/api/errors'
import { updateSavingsSchema } from '@/lib/schemas/savings'

export const GET = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const config = await prisma.savingsConfig.findUnique({
    where: { accountId: id },
    include: {
      account: { select: { id: true, name: true, color: true, type: true, currentBalance: true } },
      linkedAccount: { select: { id: true, name: true } },
      entries: { orderBy: [{ dueDate: 'asc' }, { entryType: 'asc' }] },
    },
  })
  if (!config) throw new DomainError('Not found', 404)

  // Lazy-extend: for unlimited plans, ensure entries cover today + 24 months
  if (config.termMonths === null) {
    const horizon = addMonths(new Date(), 24)
    const lastEntry = config.entries[config.entries.length - 1]

    if (!lastEntry || lastEntry.dueDate < horizon) {
      const interestPeriodMonths =
        config.interestFrequency === 'MONTHLY' ? 1
        : config.interestFrequency === 'QUARTERLY' ? 3
        : 12

      const extendFrom = lastEntry
        ? addMonths(lastEntry.dueDate, interestPeriodMonths)
        : config.startDate

      const monthsNeeded = Math.ceil(
        (horizon.getTime() - extendFrom.getTime()) / (30.44 * 24 * 60 * 60 * 1000)
      ) + interestPeriodMonths

      if (monthsNeeded > 0) {
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
          termMonths: monthsNeeded,
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
          })

          // Reload config with new entries
          const updated = await prisma.savingsConfig.findUnique({
            where: { accountId: id },
            include: {
              account: { select: { id: true, name: true, color: true, type: true, currentBalance: true } },
              linkedAccount: { select: { id: true, name: true } },
              entries: { orderBy: [{ dueDate: 'asc' }, { entryType: 'asc' }] },
            },
          })
          if (updated) Object.assign(config, updated)
        }
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
  const lastEntry = config.entries[config.entries.length - 1]

  return NextResponse.json({
    ...config,
    stats: {
      totalInterestPaid: Math.round(totalInterest * 100) / 100,
      totalContributionsPaid: Math.round(totalContributions * 100) / 100,
      nextDueDate: nextUnpaidContrib?.dueDate ?? null,
      lastScheduledDate: lastEntry?.dueDate ?? null,
      totalEntries: config.entries.length,
      paidEntries: paidEntries.length,
    },
  })
})

export const PUT = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const body = await request.json()
  const data = updateSavingsSchema.parse(body)

  const config = await prisma.savingsConfig.findUnique({
    where: { accountId: id },
    include: {
      account: { select: { type: true } },
      entries: true,
    },
  })
  if (!config) throw new DomainError('Not found', 404)

  const interestRateChanged =
    data.interestRate !== undefined &&
    Math.abs(data.interestRate - config.interestRate) > 1e-9

  await prisma.$transaction(async (tx) => {
    if (data.name !== undefined || data.color !== undefined) {
      await tx.account.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.color !== undefined && { color: data.color }),
        },
      })
    }

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

    const newRate = data.interestRate!

    const lastPaidInterest = config.entries
      .filter(e => e.entryType === 'INTEREST' && e.paidAt !== null)
      .sort((a, b) => b.periodNumber - a.periodNumber)[0]

    await tx.savingsEntry.deleteMany({
      where: { savingsConfigId: config.id, entryType: 'INTEREST', paidAt: null },
    })

    const allPaidSorted = config.entries
      .filter(e => e.paidAt !== null)
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || (a.entryType === 'INTEREST' ? -1 : 1))
    const balanceAfterPaid = allPaidSorted.length > 0
      ? allPaidSorted[allPaidSorted.length - 1].scheduledBalance
      : config.initialBalance

    const firstUnpaidContrib = config.entries
      .filter(e => e.entryType === 'CONTRIBUTION' && e.paidAt === null)
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0]
    const rebuildFrom = firstUnpaidContrib?.dueDate ?? lastPaidInterest?.dueDate ?? config.startDate

    // For unlimited plans: rebuild as many months as there are unpaid contributions remaining
    const unpaidContribs = config.entries.filter(e => e.entryType === 'CONTRIBUTION' && e.paidAt === null)
    const lastEntry = config.entries[config.entries.length - 1]
    const remainingMonths = config.termMonths !== null
      ? Math.max(Math.round((lastEntry?.dueDate.getTime() ?? rebuildFrom.getTime()) - rebuildFrom.getTime()) / (30.44 * 24 * 60 * 60 * 1000), 0)
      : unpaidContribs.length > 0
        ? Math.round((unpaidContribs[unpaidContribs.length - 1].dueDate.getTime() - rebuildFrom.getTime()) / (30.44 * 24 * 60 * 60 * 1000)) + 1
        : 0

    if (remainingMonths > 0) {
      const newSchedule = generateSavingsSchedule({
        savingsType: (config.account?.type ?? 'SPARPLAN') as 'SPARPLAN' | 'FESTGELD',
        initialBalance: balanceAfterPaid,
        contributionAmount: config.contributionAmount,
        contributionFrequency: config.contributionFrequency as 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY' | null,
        interestRate: newRate,
        interestFrequency: config.interestFrequency as 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY',
        startDate: rebuildFrom,
        termMonths: remainingMonths + 1,
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

      const allUnpaid = [
        ...interestOnly.map(r => ({ ...r, id: null as string | null })),
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
})

export const DELETE = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  await prisma.account.update({ where: { id }, data: { isActive: false } })
  return NextResponse.json({ success: true })
})
