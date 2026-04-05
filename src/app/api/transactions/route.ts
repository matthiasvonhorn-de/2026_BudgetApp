import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withHandler } from '@/lib/api/handler'
import { createTransactionSchema } from '@/lib/schemas/transactions'
import { createEntryFromTransaction } from '@/lib/sub-account-entries/service'

export const GET = withHandler(async (request: Request) => {
  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('accountId')
  const categoryId = searchParams.get('categoryId')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const search = searchParams.get('search')
  const page = parseInt(searchParams.get('page') ?? '1')
  const pageSize = parseInt(searchParams.get('pageSize') ?? '0') // 0 = all

  const where = {
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
  }

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        account: { select: { id: true, name: true, color: true } },
        category: { select: { id: true, name: true, color: true, type: true } },
      },
      orderBy: { date: 'desc' },
      ...(pageSize > 0 && { skip: (page - 1) * pageSize, take: pageSize }),
    }),
    prisma.transaction.count({ where }),
  ])

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

  const data = transactions.map(t => ({
    ...t,
    loanPayment: lpMap.get(t.id) ?? null,
  }))

  return NextResponse.json({ data, total, page, pageSize })
})

export const POST = withHandler(async (request: Request) => {
  const body = await request.json()
  const data = createTransactionSchema.parse(body)

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
    const txMainType = linkedGroup && linkType === 'TRANSFER' && !data.skipSubAccountEntry
      ? 'TRANSFER'
      : data.mainType

    // Create source transaction
    const { skipSubAccountEntry: _skip1, skipPairedTransfer: _skip2, ...txData } = data
    const t = await tx.transaction.create({
      data: {
        date: new Date(data.date),
        mainAmount: txData.mainAmount ?? null,
        mainType: txMainType,
        subAmount: txData.subAmount ?? null,
        subType: txData.subType ?? null,
        description: txData.description,
        payee: txData.payee || null,
        notes: txData.notes || null,
        accountId: txData.accountId,
        categoryId: data.categoryId || null,
        status: txData.status ?? 'PENDING',
      },
      include: { account: true, category: true },
    })

    // Update source account balance: mainAmount + subAmount
    const balanceIncrement = (data.mainAmount ?? 0) + (data.subAmount ?? 0)
    if (balanceIncrement !== 0) {
      await tx.account.update({
        where: { id: data.accountId },
        data: { currentBalance: { increment: balanceIncrement } },
      })
    }

    // Delegate entry + TRANSFER pair creation to service layer
    if (linkedGroup && !data.skipSubAccountEntry && data.mainAmount != null) {
      const result = await createEntryFromTransaction(tx, {
        transactionId: t.id,
        transactionMainAmount: data.mainAmount,
        date: new Date(data.date),
        description: data.description,
        status: (data.status ?? 'PENDING') as any,
        categoryId: data.categoryId || null,
        linkedGroupId: linkedGroup.id,
        linkType,
        skipPairedTransfer: data.skipPairedTransfer,
      })

      // createEntryFromTransaction sets subAmount on the transaction, recalculate balance
      const subAmount = -data.mainAmount
      await tx.account.update({
        where: { id: data.accountId },
        data: { currentBalance: { increment: subAmount } },
      })

      return {
        ...t,
        subAccountEntryId: result.entry.id,
        subAmount,
        subType: subAmount >= 0 ? 'INCOME' : 'EXPENSE',
        ...(result.pairedTransactionId && { transferToId: result.pairedTransactionId }),
      }
    }

    return t
  })

  return NextResponse.json(transaction, { status: 201 })
})
