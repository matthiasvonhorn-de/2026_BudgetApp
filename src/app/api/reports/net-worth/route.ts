import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withHandler } from '@/lib/api/handler'

export const GET = withHandler(async (request: Request) => {
  const { searchParams } = new URL(request.url)
  const now = new Date()
  const year = parseInt(searchParams.get('year') ?? String(now.getFullYear()))
  const month = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1))

  const endOfMonth = new Date(year, month, 0, 23, 59, 59)

  // 1. Account balances at end of month:
  //    currentBalance - sum(transactions after endOfMonth)
  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    select: { id: true, currentBalance: true },
  })

  const futureTransactions = await prisma.transaction.groupBy({
    by: ['accountId'],
    where: {
      accountId: { in: accounts.map(a => a.id) },
      date: { gt: endOfMonth },
    },
    _sum: { amount: true },
  })
  const futureMap = new Map(futureTransactions.map(t => [t.accountId, t._sum.amount ?? 0]))

  const totalAssets = accounts.reduce(
    (sum, a) => sum + a.currentBalance - (futureMap.get(a.id) ?? 0),
    0,
  )

  // 2. Loan balances at end of month:
  //    For each active loan, find the scheduled balance at the last payment row <= endOfMonth.
  //    If no payment row exists yet, use the principal.
  const loans = await prisma.loan.findMany({
    where: { isActive: true },
    select: {
      id: true,
      principal: true,
      startDate: true,
      payments: {
        where: { dueDate: { lte: endOfMonth } },
        orderBy: { periodNumber: 'desc' },
        take: 1,
        select: { scheduledBalance: true },
      },
    },
  })

  const totalDebts = loans.reduce((sum, loan) => {
    // Loan not started yet in this month
    if (loan.startDate > endOfMonth) return sum
    const remaining = loan.payments[0]?.scheduledBalance ?? loan.principal
    return sum + remaining
  }, 0)

  return NextResponse.json({
    totalAssets: Math.round(totalAssets * 100) / 100,
    totalDebts: Math.round(totalDebts * 100) / 100,
    netWorth: Math.round((totalAssets - totalDebts) * 100) / 100,
  })
})
