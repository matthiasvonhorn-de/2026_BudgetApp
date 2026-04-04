import { prisma } from '@/lib/prisma'
import { DomainError } from '@/lib/api/errors'
import { roundCents } from '@/lib/money'
import { generateSavingsSchedule, addMonths } from './schedule'
import type { z } from 'zod'
import type { createSavingsSchema, updateSavingsSchema } from '@/lib/schemas/savings'

type CreateInput = z.infer<typeof createSavingsSchema>
type UpdateInput = z.infer<typeof updateSavingsSchema>

/**
 * For fixed-term plans: use termMonths exactly.
 * For unlimited plans: generate from startDate through today + 24 months.
 */
function computeScheduleMonths(startDate: Date, termMonths: number | null): number {
  if (termMonths !== null) return termMonths
  const horizon = addMonths(new Date(), 24)
  const diffMs = Math.max(0, horizon.getTime() - startDate.getTime())
  const months = Math.ceil(diffMs / (30.44 * 24 * 60 * 60 * 1000))
  return Math.max(months, 24)
}

// ── List ──────────────────────────────────────────────────────────────

export async function listSavings() {
  const configs = await prisma.savingsConfig.findMany({
    where: { account: { isActive: true } },
    include: {
      account: { select: { id: true, name: true, color: true, type: true, currentBalance: true } },
      entries: { orderBy: [{ dueDate: 'asc' }, { entryType: 'asc' }] },
    },
    orderBy: { createdAt: 'asc' },
  })

  return configs.map(cfg => {
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
        totalInterestPaid: roundCents(totalInterest),
        totalContributionsPaid: roundCents(totalContributions),
        nextDueDate: nextUnpaidContrib?.dueDate ?? null,
        totalEntries: cfg.entries.length,
        paidEntries: paidEntries.length,
      },
    }
  })
}

// ── Get Detail ────────────────────────────────────────────────────────

export async function getSavingsDetail(accountId: string) {
  const config = await prisma.savingsConfig.findUnique({
    where: { accountId },
    include: {
      account: { select: { id: true, name: true, color: true, type: true, currentBalance: true } },
      linkedAccount: { select: { id: true, name: true } },
      entries: { orderBy: [{ dueDate: 'asc' }, { entryType: 'asc' }] },
    },
  })
  if (!config) throw new DomainError('Not found', 404)

  // Read-only: no lazy-extend, just compute stats
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

  return {
    ...config,
    stats: {
      totalInterestPaid: roundCents(totalInterest),
      totalContributionsPaid: roundCents(totalContributions),
      nextDueDate: nextUnpaidContrib?.dueDate ?? null,
      lastScheduledDate: lastEntry?.dueDate ?? null,
      totalEntries: config.entries.length,
      paidEntries: paidEntries.length,
    },
  }
}

// ── Create ────────────────────────────────────────────────────────────

export async function createSavings(data: CreateInput) {
  const startDate = new Date(data.startDate)
  const initialBalance = data.initialBalance ?? 0
  const upfrontFee = data.upfrontFee ?? 0
  const contributionAmount = data.savingsType === 'SPARPLAN' ? (data.contributionAmount ?? 0) : 0
  const contributionFrequency = data.savingsType === 'SPARPLAN'
    ? (data.contributionFrequency ?? null)
    : null

  const scheduleMonths = computeScheduleMonths(startDate, data.termMonths ?? null)

  return prisma.$transaction(async (tx) => {
    const account = await tx.account.create({
      data: {
        name: data.name,
        type: data.savingsType,
        color: data.color ?? '#10b981',
        currentBalance: roundCents(initialBalance - upfrontFee),
        isActive: true,
      },
    })

    const config = await tx.savingsConfig.create({
      data: {
        accountId: account.id,
        initialBalance,
        upfrontFee,
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

    const schedule = generateSavingsSchedule({
      savingsType: data.savingsType,
      initialBalance,
      upfrontFee,
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

    // Initialize past entries (paidAt set, but no transactions created)
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
      })

      const lastRow = pastRows[pastRows.length - 1]
      await tx.account.update({
        where: { id: account.id },
        data: { currentBalance: lastRow.scheduledBalance },
      })
    }

    return { account, config }
  })
}

// ── Update ────────────────────────────────────────────────────────────

export async function updateSavings(accountId: string, data: UpdateInput) {
  const config = await prisma.savingsConfig.findUnique({
    where: { accountId },
    include: {
      account: { select: { type: true } },
      entries: true,
    },
  })
  if (!config) throw new DomainError('Not found', 404)

  const interestRateChanged =
    data.interestRate !== undefined &&
    Math.abs(data.interestRate - config.interestRate) > 1e-9

  const feeChanged =
    data.upfrontFee !== undefined &&
    Math.abs(data.upfrontFee - config.upfrontFee) > 1e-9

  const contributionChanged =
    data.contributionAmount !== undefined &&
    Math.abs(data.contributionAmount - config.contributionAmount) > 1e-9

  const needsRebuild = interestRateChanged || feeChanged || contributionChanged

  await prisma.$transaction(async (tx) => {
    if (data.name !== undefined || data.color !== undefined) {
      await tx.account.update({
        where: { id: accountId },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.color !== undefined && { color: data.color }),
        },
      })
    }

    await tx.savingsConfig.update({
      where: { accountId },
      data: {
        ...(data.accountNumber !== undefined && { accountNumber: data.accountNumber }),
        ...(data.linkedAccountId !== undefined && { linkedAccountId: data.linkedAccountId }),
        ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.interestRate !== undefined && { interestRate: data.interestRate }),
        ...(data.upfrontFee !== undefined && { upfrontFee: data.upfrontFee }),
        ...(data.contributionAmount !== undefined && { contributionAmount: data.contributionAmount }),
      },
    })

    if (!needsRebuild) return

    const newRate = data.interestRate ?? config.interestRate
    const newFee = data.upfrontFee ?? config.upfrontFee
    const newContribution = data.contributionAmount ?? config.contributionAmount

    // Find the last interest entry that was actually booked (has a real transaction).
    // Initialized entries (paidAt set but no transactionId) can be safely rebuilt.
    const lastBookedInterest = config.entries
      .filter(e => e.entryType === 'INTEREST' && e.paidAt !== null && e.transactionId !== null)
      .sort((a, b) => b.periodNumber - a.periodNumber)[0]

    // Delete all interest entries that can be rebuilt:
    // - unpaid entries (paidAt === null)
    // - initialized entries (paidAt set but no transactionId)
    // Delete all rebuildable entries (no real transaction attached)
    await tx.savingsEntry.deleteMany({
      where: {
        savingsConfigId: config.id,
        OR: [
          { paidAt: null },
          { paidAt: { not: null }, transactionId: null },
        ],
      },
    })

    // Determine rebuild starting point
    const bookedEntries = config.entries
      .filter(e => e.paidAt !== null && e.transactionId !== null)
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    const balanceAfterBooked = bookedEntries.length > 0
      ? bookedEntries[bookedEntries.length - 1].scheduledBalance
      : config.initialBalance

    // For the full rebuild: use the initial balance minus fee as the starting point
    // if no entries were actually booked with transactions
    const effectiveStartBalance = bookedEntries.length > 0
      ? balanceAfterBooked
      : config.initialBalance

    const rebuildFrom = bookedEntries.length > 0
      ? bookedEntries[bookedEntries.length - 1].dueDate
      : config.startDate

    // Determine how many months to regenerate
    const allContribs = config.entries.filter(e => e.entryType === 'CONTRIBUTION')
    const lastContrib = allContribs[allContribs.length - 1]
    const lastEntryDate = lastContrib?.dueDate ?? config.entries[config.entries.length - 1]?.dueDate

    const remainingMonths = lastEntryDate
      ? Math.max(Math.round((lastEntryDate.getTime() - rebuildFrom.getTime()) / (30.44 * 24 * 60 * 60 * 1000)), 1) + 1
      : 24

    if (remainingMonths > 0) {
      const newSchedule = generateSavingsSchedule({
        savingsType: (config.account?.type ?? 'SPARPLAN') as 'SPARPLAN' | 'FESTGELD',
        initialBalance: effectiveStartBalance,
        upfrontFee: bookedEntries.length > 0 ? 0 : newFee,
        contributionAmount: newContribution,
        contributionFrequency: config.contributionFrequency as 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY' | null,
        interestRate: newRate,
        interestFrequency: config.interestFrequency as 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY',
        startDate: rebuildFrom,
        termMonths: remainingMonths,
      })

      // Get all non-contribution entries (FEE + INTEREST)
      // Count existing booked entries per type to continue numbering
      const bookedInterestCount = bookedEntries.filter(e => e.entryType === 'INTEREST').length
      const bookedContribCount = bookedEntries.filter(e => e.entryType === 'CONTRIBUTION').length
      const counters: Record<string, number> = {
        INTEREST: bookedInterestCount,
        CONTRIBUTION: bookedContribCount,
        FEE: 0,
      }

      const toCreate = newSchedule.map(row => ({
        savingsConfigId: config.id,
        entryType: row.entryType,
        periodNumber: ++counters[row.entryType],
        dueDate: row.dueDate,
        scheduledAmount: row.scheduledAmount,
        scheduledBalance: row.scheduledBalance,
      }))

      if (toCreate.length > 0) {
        await tx.savingsEntry.createMany({ data: toCreate })
      }

      // Re-initialize past entries that were rebuilt (mark as paid without transaction)
      const today = new Date()
      today.setHours(23, 59, 59, 999)
      await tx.savingsEntry.updateMany({
        where: {
          savingsConfigId: config.id,
          paidAt: null,
          transactionId: null,
          dueDate: { lte: today },
          entryType: { in: ['INTEREST', 'FEE', 'CONTRIBUTION'] },
        },
        data: { paidAt: new Date() },
      })

      // Recalculate running balances for all contribution entries
      const rebuiltEntries = await tx.savingsEntry.findMany({
        where: { savingsConfigId: config.id },
        orderBy: [{ dueDate: 'asc' }, { entryType: 'asc' }],
      })

      let runningBalance = config.initialBalance - newFee
      for (const entry of rebuiltEntries) {
        runningBalance = roundCents(runningBalance + entry.scheduledAmount)
        if (Math.abs(entry.scheduledBalance - runningBalance) > 0.001) {
          await tx.savingsEntry.update({
            where: { id: entry.id },
            data: { scheduledBalance: runningBalance },
          })
        }
      }

      // Update account balance to match the last paid entry
      const lastPaid = rebuiltEntries
        .filter(e => e.paidAt !== null)
        .sort((a, b) => b.dueDate.getTime() - a.dueDate.getTime())[0]
      if (lastPaid) {
        // Recalculate the correct balance for the last paid entry
        let bal = config.initialBalance - newFee
        for (const e of rebuiltEntries) {
          bal = roundCents(bal + e.scheduledAmount)
          if (e.id === lastPaid.id) break
        }
        await tx.account.update({
          where: { id: accountId },
          data: { currentBalance: bal },
        })
      }
    }

    // Initialize past entries (paidAt set, no transactions) — same as creation
    if (data.initializedUntil) {
      const initCutoff = new Date(data.initializedUntil)
      initCutoff.setHours(23, 59, 59, 999)

      // Only mark entries that are unpaid AND have no transaction
      const initialized = await tx.savingsEntry.updateMany({
        where: { savingsConfigId: config.id, paidAt: null, dueDate: { lte: initCutoff } },
        data: { paidAt: new Date() },
      })

      if (initialized.count > 0) {
        // Update account balance to the last initialized entry's scheduled balance
        const allEntries = await tx.savingsEntry.findMany({
          where: { savingsConfigId: config.id, paidAt: { not: null } },
          orderBy: [{ dueDate: 'desc' }, { entryType: 'desc' }],
          take: 1,
        })
        if (allEntries.length > 0) {
          await tx.account.update({
            where: { id: accountId },
            data: { currentBalance: allEntries[0].scheduledBalance },
          })
        }
      }
    }
  })
}

// ── Delete ────────────────────────────────────────────────────────────

export async function deleteSavings(accountId: string) {
  await prisma.account.update({ where: { id: accountId }, data: { isActive: false } })
}

// ── Pay entries ───────────────────────────────────────────────────────

export async function payEntries(accountId: string, paidUntil: string) {
  const cutoff = new Date(paidUntil)
  cutoff.setHours(23, 59, 59, 999)

  const config = await prisma.savingsConfig.findUnique({
    where: { accountId },
    include: {
      account: true,
      linkedAccount: true,
      entries: {
        where: { paidAt: null, dueDate: { lte: cutoff } },
        orderBy: [{ dueDate: 'asc' }, { entryType: 'asc' }],
      },
    },
  })
  if (!config) throw new DomainError('Not found', 404)

  const unpaidDue = config.entries

  await prisma.$transaction(async (tx) => {
    for (const entry of unpaidDue) {
      const savingsTx = await tx.transaction.create({
        data: {
          accountId: config.accountId,
          type: 'INCOME',
          amount: entry.scheduledAmount,
          description: entry.entryType === 'INTEREST' ? 'Zinsgutschrift' : 'Sparrate',
          date: entry.dueDate,
          status: 'CLEARED',
        },
      })

      await tx.account.update({
        where: { id: config.accountId },
        data: { currentBalance: { increment: entry.scheduledAmount } },
      })

      let giroTxId: string | null = null

      if (entry.entryType === 'CONTRIBUTION' && config.linkedAccountId) {
        const giroTx = await tx.transaction.create({
          data: {
            accountId: config.linkedAccountId,
            type: 'EXPENSE',
            amount: -entry.scheduledAmount,
            description: `Sparrate: ${config.account.name}`,
            date: entry.dueDate,
            categoryId: config.categoryId ?? null,
            status: 'CLEARED',
          },
        })
        await tx.account.update({
          where: { id: config.linkedAccountId },
          data: { currentBalance: { increment: -entry.scheduledAmount } },
        })
        giroTxId = giroTx.id
      }

      await tx.savingsEntry.update({
        where: { id: entry.id },
        data: {
          paidAt: new Date(),
          transactionId: savingsTx.id,
          ...(giroTxId && { giroTransactionId: giroTxId }),
        },
      })
    }
  })

  return { paid: unpaidDue.length }
}

// ── Unpay single entry ───────────────────────────────────────────────

export async function unpayEntry(accountId: string, entryId: string) {
  const entry = await prisma.savingsEntry.findUnique({
    where: { id: entryId },
    include: { savingsConfig: { include: { account: true } } },
  })
  if (!entry || entry.savingsConfig.accountId !== accountId) {
    throw new DomainError('Not found', 404)
  }
  if (!entry.paidAt) {
    throw new DomainError('Not paid', 400)
  }

  await prisma.$transaction(async (tx) => {
    if (entry.transactionId) {
      await tx.transaction.delete({ where: { id: entry.transactionId } })
      await tx.account.update({
        where: { id: entry.savingsConfig.accountId },
        data: { currentBalance: { increment: -entry.scheduledAmount } },
      })
    }

    if (entry.giroTransactionId) {
      const giroTx = await tx.transaction.findUnique({ where: { id: entry.giroTransactionId } })
      if (giroTx) {
        await tx.transaction.delete({ where: { id: giroTx.id } })
        await tx.account.update({
          where: { id: giroTx.accountId },
          data: { currentBalance: { increment: entry.scheduledAmount } },
        })
      }
    }

    await tx.savingsEntry.update({
      where: { id: entryId },
      data: { paidAt: null, transactionId: null, giroTransactionId: null },
    })
  })
}

// ── Extend ────────────────────────────────────────────────────────────

/**
 * Idempotent: ensures entries cover at least `today + months` ahead.
 * If entries already reach the horizon, returns { added: 0 }.
 */
export async function extendSavings(accountId: string, months: number) {
  const config = await prisma.savingsConfig.findUnique({
    where: { accountId },
    include: {
      account: { select: { type: true } },
      entries: { orderBy: [{ dueDate: 'asc' }, { entryType: 'asc' }] },
    },
  })
  if (!config) throw new DomainError('Not found', 404)
  if (config.termMonths !== null) {
    throw new DomainError('Festlaufzeit-Konten können nicht verlängert werden', 400)
  }

  const lastEntry = config.entries[config.entries.length - 1]
  const horizon = addMonths(new Date(), months)

  // Idempotent: already covered
  if (lastEntry && lastEntry.dueDate >= horizon) {
    return { added: 0 }
  }

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

  if (monthsNeeded <= 0) return { added: 0 }

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

  if (extension.length === 0) return { added: 0 }

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

  return { added: result.count }
}
