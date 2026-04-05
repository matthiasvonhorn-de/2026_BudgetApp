import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withHandler } from '@/lib/api/handler'

export const GET = withHandler(async (request: Request) => {
  const { searchParams } = new URL(request.url)
  const now = new Date()
  const year = parseInt(searchParams.get('year') ?? String(now.getFullYear()))
  const month = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1))

  const startOfMonth = new Date(year, month - 1, 1)
  const endOfMonth = new Date(year, month, 0, 23, 59, 59)

  const activityRows = await prisma.$queryRaw<Array<{ categoryId: string; total: number }>>`
    SELECT t.categoryId, SUM(COALESCE(t.mainAmount, 0)) as total
    FROM "Transaction" t
    JOIN Account a ON t.accountId = a.id
    WHERE t.date >= ${startOfMonth}
      AND t.date <= ${endOfMonth}
      AND t.mainType = 'EXPENSE'
      AND t.categoryId IS NOT NULL
      AND a.isActive = 1
      AND a.type NOT IN ('SPARPLAN', 'FESTGELD')
      AND t.transferToId IS NULL
      AND NOT EXISTS (SELECT 1 FROM "Transaction" t2 WHERE t2.transferToId = t.id)
    GROUP BY t.categoryId
  `

  const categoryIds = activityRows.map(a => a.categoryId).filter(Boolean)
  const categories = await prisma.category.findMany({
    where: { id: { in: categoryIds } },
    select: { id: true, name: true, color: true },
  })
  const catMap = new Map(categories.map(c => [c.id, c]))

  const result = activityRows
    .map(a => ({
      categoryId: a.categoryId,
      name: catMap.get(a.categoryId)?.name ?? 'Unbekannt',
      color: catMap.get(a.categoryId)?.color ?? '#6366f1',
      amount: Math.abs(a.total),
    }))
    .filter(r => r.amount > 0)
    .sort((a, b) => b.amount - a.amount)

  return NextResponse.json(result)
})
