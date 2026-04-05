import { z } from 'zod'

const transactionType = z.enum(['INCOME', 'EXPENSE', 'TRANSFER'])
const transactionStatus = z.enum(['PENDING', 'CLEARED', 'RECONCILED'])

export const createTransactionSchema = z.object({
  date: z.string(),
  mainAmount: z.number().optional().nullable(),
  mainType: transactionType.default('INCOME'),
  subAmount: z.number().optional().nullable(),
  subType: transactionType.optional().nullable(),
  description: z.string().min(1),
  payee: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  accountId: z.string(),
  categoryId: z.string().optional().nullable(),
  status: transactionStatus.default('PENDING'),
  skipSubAccountEntry: z.boolean().optional().default(false),
  skipPairedTransfer: z.boolean().optional().default(false),
})

export const updateTransactionSchema = z.object({
  date: z.string().optional(),
  mainAmount: z.number().optional().nullable(),
  mainType: transactionType.optional(),
  description: z.string().min(1).optional(),
  payee: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  status: transactionStatus.optional(),
})

export const importTransactionsSchema = z.object({
  accountId: z.string(),
  transactions: z.array(z.object({
    date: z.string(),
    amount: z.number(),
    description: z.string(),
    payee: z.string().optional().nullable(),
    categoryId: z.string().optional().nullable(),
    hash: z.string(),
  })),
})
