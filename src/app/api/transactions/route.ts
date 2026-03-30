import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const transactionSchema = z.object({
  date: z.string(),
  amount: z.number(),
  description: z.string().min(1),
  payee: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  accountId: z.string(),
  categoryId: z.string().optional().nullable(),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).default('EXPENSE'),
  status: z.enum(['PENDING', 'CLEARED', 'RECONCILED']).default('PENDING'),
  skipSubAccountEntry: z.boolean().optional().default(false),
  skipPairedTransfer: z.boolean().optional().default(false),
})

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('accountId')
  const categoryId = searchParams.get('categoryId')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const search = searchParams.get('search')
  const limit = parseInt(searchParams.get('limit') ?? '100')

  try {
    const transactions = await prisma.transaction.findMany({
      where: {
        account: { isActive: true },
        ...(accountId && { accountId }),
        ...(categoryId && { categoryId }),
        ...(from || to ? {
          date: {
            ...(from && { gte: new Date(from) }),
            ...(to && { lte: new Date(to) }),
          }
        } : {}),
        ...(search && {
          OR: [
            { description: { contains: search } },
            { payee: { contains: search } },
          ],
        }),
      },
      include: {
        account: { select: { id: true, name: true, color: true } },
        category: { select: { id: true, name: true, color: true, type: true } },
      },
      orderBy: { date: 'desc' },
      take: limit,
    })

    // Kredit-Verknüpfung ermitteln (LoanPayment.transactionId → Transaction)
    const ids = transactions.map(t => t.id)
    const loanPayments = ids.length > 0
      ? await prisma.loanPayment.findMany({
          where: { transactionId: { in: ids } },
          select: {
            transactionId: true,
            loanId: true,
            periodNumber: true,
            loan: { select: { name: true } },
          },
        })
      : []
    const lpMap = new Map(loanPayments.map(lp => [lp.transactionId, lp]))

    const result = transactions.map(t => ({
      ...t,
      loanPayment: lpMap.get(t.id) ?? null,
    }))

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Fehler beim Laden' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const data = transactionSchema.parse(body)

    const transaction = await prisma.$transaction(async (tx) => {
      // Load category with sub-account link info
      const category = data.categoryId
        ? await tx.category.findUnique({
            where: { id: data.categoryId },
            include: {
              subAccountGroup: {
                include: { subAccount: { include: { account: true } } },
              },
            },
          })
        : null

      const linkedGroup = category?.subAccountGroup ?? null
      const linkType = category?.subAccountLinkType ?? 'BOOKING'

      // For TRANSFER link type, override the transaction type
      const txType = linkedGroup && linkType === 'TRANSFER' && !data.skipSubAccountEntry ? 'TRANSFER' : data.type

      // Create source transaction
      const t = await tx.transaction.create({
        data: {
          ...data,
          type: txType,
          date: new Date(data.date),
          categoryId: data.categoryId || null,
        },
        include: { account: true, category: true },
      })

      // Update source account balance
      await tx.account.update({
        where: { id: data.accountId },
        data: { currentBalance: { increment: data.amount } },
      })

      if (linkedGroup && !data.skipSubAccountEntry) {
        // Sub-account entry: expense on main account → income in sub-account
        const entryAmount = -data.amount
        const entry = await tx.subAccountEntry.create({
          data: {
            date: new Date(data.date),
            description: data.description,
            amount: entryAmount,
            fromBudget: true,
            groupId: linkedGroup.id,
          },
        })
        await tx.transaction.update({
          where: { id: t.id },
          data: { subAccountEntryId: entry.id },
        })

        if (linkType === 'TRANSFER' && !data.skipPairedTransfer) {
          // Create paired TRANSFER transaction on the target account
          const targetAccountId = linkedGroup.subAccount.accountId
          const pairedAmount = -data.amount  // opposite sign

          const paired = await tx.transaction.create({
            data: {
              date: new Date(data.date),
              amount: pairedAmount,
              description: data.description,
              accountId: targetAccountId,
              categoryId: data.categoryId || null,
              type: 'TRANSFER',
              status: data.status,
            },
          })

          // Update target account balance
          await tx.account.update({
            where: { id: targetAccountId },
            data: { currentBalance: { increment: pairedAmount } },
          })

          // Link both transactions as a transfer pair
          await tx.transaction.update({
            where: { id: t.id },
            data: { transferToId: paired.id },
          })

          return { ...t, transferToId: paired.id, subAccountEntryId: entry.id }
        }

        return { ...t, subAccountEntryId: entry.id }
      }

      return t
    })

    return NextResponse.json(transaction, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: 'Fehler beim Erstellen' }, { status: 500 })
  }
}
