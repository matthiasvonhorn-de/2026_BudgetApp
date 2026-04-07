import { NextResponse } from 'next/server'
import { TransactionStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { withHandler } from '@/lib/api/handler'
import { createTransactionSchema } from '@/lib/schemas/transactions'
import { createEntryFromTransaction } from '@/lib/sub-account-entries/service'
import { balanceIncrement, roundCents } from '@/lib/money'

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
        subAccountEntry: {
          select: {
            group: { select: { id: true, name: true, subAccount: { select: { id: true, name: true } } } },
          },
        },
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

    // Create source transaction (omit service-layer flags from the DB create payload)
    const t = await tx.transaction.create({
      data: {
        date: new Date(data.date),
        mainAmount: data.mainAmount ?? null,
        mainType: txMainType,
        subAmount: data.subAmount ?? null,
        subType: data.subType ?? null,
        description: data.description,
        payee: data.payee || null,
        notes: data.notes || null,
        accountId: data.accountId,
        categoryId: data.categoryId || null,
        status: data.status ?? 'PENDING',
      },
      include: { account: true, category: true },
    })

    // Update source account balance: mainAmount + subAmount
    const balanceDelta = (data.mainAmount ?? 0) + (data.subAmount ?? 0)
    if (balanceDelta !== 0) {
      await tx.account.update({
        where: { id: data.accountId },
        data: { currentBalance: balanceIncrement(balanceDelta) },
      })
    }

    // === NEW TRANSFER HANDLING ===
    if (data.transferTargetAccountId && data.sourceType && data.transferTargetType) {
      const amount = roundCents(Math.abs(data.mainAmount ?? data.subAmount ?? 0))

      // Source side — always TRANSFER type
      const srcMain = data.sourceType === 'MAIN' ? -amount : null
      const srcMainType = 'TRANSFER' as const
      const srcSub = data.sourceType === 'SUB' ? -amount : null
      const srcSubType = data.sourceType === 'SUB' ? 'TRANSFER' as const : null

      // Determine source categoryId
      let srcCategoryId = data.sourceCategoryId || data.categoryId || null
      if (data.sourceType === 'SUB' && data.sourceGroupId && !srcCategoryId) {
        const srcCat = await tx.category.findFirst({
          where: { subAccountGroupId: data.sourceGroupId, groupId: { not: null } },
          orderBy: { id: 'asc' },
          select: { id: true },
        })
        srcCategoryId = srcCat?.id ?? null
      }

      // Update source transaction
      await tx.transaction.update({
        where: { id: t.id },
        data: {
          mainAmount: srcMain,
          mainType: srcMainType,
          subAmount: srcSub,
          subType: srcSubType,
          categoryId: srcCategoryId,
        },
      })

      // Source sub-account entry
      if (data.sourceType === 'SUB' && data.sourceGroupId) {
        const srcEntry = await tx.subAccountEntry.create({
          data: {
            date: new Date(data.date),
            description: data.description,
            amount: srcSub!,
            fromBudget: false,
            groupId: data.sourceGroupId,
          },
        })
        await tx.transaction.update({
          where: { id: t.id },
          data: { subAccountEntryId: srcEntry.id },
        })
      }

      // Fix source balance (initial update used raw data, we need correct values)
      const initialDelta = (data.mainAmount ?? 0) + (data.subAmount ?? 0)
      const correctSrcDelta = (srcMain ?? 0) + (srcSub ?? 0)
      if (initialDelta !== correctSrcDelta) {
        await tx.account.update({
          where: { id: data.accountId },
          data: { currentBalance: balanceIncrement(correctSrcDelta - initialDelta) },
        })
      }

      // Target side — always TRANSFER type
      const tgtMain = data.transferTargetType === 'MAIN' ? amount : null
      const tgtMainType = 'TRANSFER' as const
      const tgtSub = data.transferTargetType === 'SUB' ? amount : null
      const tgtSubType = data.transferTargetType === 'SUB' ? 'TRANSFER' as const : null

      // Determine target categoryId
      let tgtCategoryId = data.transferTargetCategoryId || null
      if (data.transferTargetType === 'SUB' && data.transferTargetGroupId && !tgtCategoryId) {
        const tgtCat = await tx.category.findFirst({
          where: { subAccountGroupId: data.transferTargetGroupId, groupId: { not: null } },
          orderBy: { id: 'asc' },
          select: { id: true },
        })
        tgtCategoryId = tgtCat?.id ?? null
      }

      const paired = await tx.transaction.create({
        data: {
          date: new Date(data.date),
          mainAmount: tgtMain,
          mainType: tgtMainType,
          subAmount: tgtSub,
          subType: tgtSubType,
          description: data.description,
          accountId: data.transferTargetAccountId,
          categoryId: tgtCategoryId,
          status: data.status ?? 'PENDING',
        },
      })

      // Target sub-account entry
      if (data.transferTargetType === 'SUB' && data.transferTargetGroupId) {
        const tgtEntry = await tx.subAccountEntry.create({
          data: {
            date: new Date(data.date),
            description: data.description,
            amount: tgtSub!,
            fromBudget: false,
            groupId: data.transferTargetGroupId,
          },
        })
        await tx.transaction.update({
          where: { id: paired.id },
          data: { subAccountEntryId: tgtEntry.id },
        })
      }

      // Link pair
      await tx.transaction.update({
        where: { id: t.id },
        data: { transferToId: paired.id },
      })

      // Target balance
      const tgtDelta = (tgtMain ?? 0) + (tgtSub ?? 0)
      if (tgtDelta !== 0) {
        await tx.account.update({
          where: { id: data.transferTargetAccountId },
          data: { currentBalance: balanceIncrement(tgtDelta) },
        })
      }

      return { ...t, mainAmount: srcMain, mainType: srcMainType, subAmount: srcSub, subType: srcSubType, transferToId: paired.id }
    }

    // Delegate entry + TRANSFER pair creation to service layer
    if (linkedGroup && !data.skipSubAccountEntry && data.mainAmount != null) {
      const result = await createEntryFromTransaction(tx, {
        transactionId: t.id,
        transactionMainAmount: data.mainAmount,
        date: new Date(data.date),
        description: data.description,
        status: (data.status ?? 'PENDING') as TransactionStatus,
        categoryId: data.categoryId || null,
        linkedGroupId: linkedGroup.id,
        linkType,
        skipPairedTransfer: data.skipPairedTransfer,
      })

      // createEntryFromTransaction sets subAmount on the transaction, recalculate balance
      const subAmount = -data.mainAmount
      await tx.account.update({
        where: { id: data.accountId },
        data: { currentBalance: balanceIncrement(subAmount) },
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
