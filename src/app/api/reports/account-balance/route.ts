import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withHandler } from '@/lib/api/handler'

export const GET = withHandler(async (request: Request) => {
  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('accountId')
  const months = parseInt(searchParams.get('months') ?? '12')

  if (!accountId) {
    return NextResponse.json({ error: 'accountId required' }, { status: 400 })
  }

  const now = new Date()
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  // 1. Cumulative balance BEFORE the window
  type BalanceRow = { total: number | null }
  const [mainBefore, subBefore] = await Promise.all([
    prisma.$queryRaw<[BalanceRow]>`
      SELECT SUM(COALESCE(mainAmount, 0)) as total
      FROM "Transaction"
      WHERE accountId = ${accountId} AND date < ${startDate}
    `,
    prisma.$queryRaw<[BalanceRow]>`
      SELECT SUM(COALESCE(subAmount, 0)) as total
      FROM "Transaction"
      WHERE accountId = ${accountId} AND date < ${startDate} AND subAmount IS NOT NULL
    `,
  ])
  let runningMain = mainBefore[0]?.total ?? 0
  let runningSub = subBefore[0]?.total ?? 0

  // 2. Monthly deltas within the window
  type DeltaRow = { year: number; month: number; mainDelta: number; subDelta: number }
  const deltas = await prisma.$queryRaw<DeltaRow[]>`
    SELECT
      CAST(strftime('%Y', date) AS INTEGER) as year,
      CAST(strftime('%m', date) AS INTEGER) as month,
      SUM(COALESCE(mainAmount, 0)) as mainDelta,
      SUM(CASE WHEN subAmount IS NOT NULL THEN subAmount ELSE 0 END) as subDelta
    FROM "Transaction"
    WHERE accountId = ${accountId}
      AND date >= ${startDate} AND date <= ${endDate}
    GROUP BY strftime('%Y-%m', date)
    ORDER BY year, month
  `
  const deltaMap = new Map(deltas.map(d => [`${d.year}-${d.month}`, d]))

  // 3. Sub-account group balances — cumulative before window + monthly deltas
  const groups = await prisma.subAccountGroup.findMany({
    where: { subAccount: { accountId } },
    include: { subAccount: { select: { name: true } } },
    orderBy: { sortOrder: 'asc' },
  })

  type GroupDeltaRow = { groupId: string; year: number; month: number; delta: number }
  const groupDeltas = await prisma.$queryRaw<GroupDeltaRow[]>`
    SELECT
      e.groupId,
      CAST(strftime('%Y', e.date) AS INTEGER) as year,
      CAST(strftime('%m', e.date) AS INTEGER) as month,
      SUM(e.amount) as delta
    FROM SubAccountEntry e
    JOIN SubAccountGroup g ON e.groupId = g.id
    JOIN SubAccount sa ON g.subAccountId = sa.id
    WHERE sa.accountId = ${accountId}
      AND e.date >= ${startDate} AND e.date <= ${endDate}
    GROUP BY e.groupId, strftime('%Y-%m', e.date)
  `

  type GroupBeforeRow = { groupId: string; total: number | null }
  const groupBefore = await prisma.$queryRaw<GroupBeforeRow[]>`
    SELECT e.groupId, SUM(e.amount) as total
    FROM SubAccountEntry e
    JOIN SubAccountGroup g ON e.groupId = g.id
    JOIN SubAccount sa ON g.subAccountId = sa.id
    WHERE sa.accountId = ${accountId} AND e.date < ${startDate}
    GROUP BY e.groupId
  `
  const groupBeforeMap = new Map(groupBefore.map(g => [g.groupId, g.total ?? 0]))

  // Build per-group delta map: groupId -> "year-month" -> delta
  const groupDeltaMap = new Map<string, Map<string, number>>()
  for (const gd of groupDeltas) {
    if (!groupDeltaMap.has(gd.groupId)) groupDeltaMap.set(gd.groupId, new Map())
    groupDeltaMap.get(gd.groupId)!.set(`${gd.year}-${gd.month}`, gd.delta)
  }

  // 4. Build monthly snapshots
  const result = []
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - months + 1 + i, 1)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    const key = `${y}-${m}`

    const delta = deltaMap.get(key)
    runningMain += delta?.mainDelta ?? 0
    runningSub += delta?.subDelta ?? 0

    // Group balances for this month
    const groupBalances = groups.map(g => {
      const before = groupBeforeMap.get(g.id) ?? 0
      // Accumulate deltas up to this month
      let cumDelta = before + g.initialBalance
      for (let j = 0; j <= i; j++) {
        const dd = new Date(now.getFullYear(), now.getMonth() - months + 1 + j, 1)
        const gKey = `${dd.getFullYear()}-${dd.getMonth() + 1}`
        cumDelta += groupDeltaMap.get(g.id)?.get(gKey) ?? 0
      }
      return {
        groupId: g.id,
        groupName: g.name,
        subAccountName: g.subAccount.name,
        balance: cumDelta,
      }
    })

    result.push({
      year: y,
      month: m,
      mainBalance: runningMain,
      subBalance: runningSub,
      totalBalance: runningMain + runningSub,
      groups: groupBalances,
    })
  }

  return NextResponse.json(result)
})
