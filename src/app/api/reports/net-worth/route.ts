import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { withHandler } from '@/lib/api/handler'
import { roundCents } from '@/lib/money'

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

  const accountIds = accounts.map(a => a.id)
  let futureRows: Array<{ accountId: string; total: number }> = []
  if (accountIds.length > 0) {
    futureRows = await prisma.$queryRaw<Array<{ accountId: string; total: number }>>`
      SELECT accountId, SUM(COALESCE(mainAmount, 0) + COALESCE(subAmount, 0)) as total
      FROM "Transaction"
      WHERE accountId IN (${Prisma.join(accountIds)})
        AND date > ${endOfMonth}
      GROUP BY accountId
    `.catch(() => [] as Array<{ accountId: string; total: number }>)
  }

  const futureMap = new Map(futureRows.map(t => [t.accountId, t.total]))

  const totalAssets = accounts.reduce(
    (sum, a) => sum + a.currentBalance - (futureMap.get(a.id) ?? 0),
    0,
  )

  // 2. Loan balances at end of month:
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
    if (loan.startDate > endOfMonth) return sum
    const remaining = loan.payments[0]?.scheduledBalance ?? loan.principal
    return sum + remaining
  }, 0)

  // 3. Portfolio values: latest value per active portfolio
  const portfolioValues = await prisma.portfolio.findMany({
    where: { isActive: true },
    select: {
      values: {
        orderBy: { date: 'desc' },
        take: 1,
        select: { value: true },
      },
    },
  })

  const totalPortfolios = portfolioValues.reduce(
    (sum, p) => sum + (p.values[0]?.value ?? 0),
    0,
  )

  // 4. Asset (Sachwerte) values: latest value per active asset × ownership
  const assetValues = await prisma.asset.findMany({
    where: { isActive: true },
    select: {
      ownershipPercent: true,
      values: {
        orderBy: { date: 'desc' },
        take: 1,
        select: { value: true },
      },
    },
  })

  const totalRealAssets = assetValues.reduce(
    (sum, a) => sum + (a.values[0]?.value ?? 0) * (a.ownershipPercent / 100),
    0,
  )

  return NextResponse.json({
    totalAssets: roundCents(totalAssets),
    totalPortfolios: roundCents(totalPortfolios),
    totalRealAssets: roundCents(totalRealAssets),
    totalDebts: roundCents(totalDebts),
    netWorth: roundCents(totalAssets + totalPortfolios + totalRealAssets - totalDebts),
  })
})
