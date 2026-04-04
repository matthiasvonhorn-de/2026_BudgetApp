import { z } from 'zod'

const accountType = z.enum(['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'CASH', 'INVESTMENT'])

export const createAccountSchema = z.object({
  name: z.string().min(1),
  iban: z.string().optional().nullable(),
  bank: z.string().optional().nullable(),
  type: accountType.default('CHECKING'),
  color: z.string().default('#6366f1'),
  icon: z.string().optional().nullable(),
  currentBalance: z.number().default(0),
})

export const updateAccountSchema = z.object({
  name: z.string().min(1).optional(),
  iban: z.string().optional().nullable(),
  bank: z.string().optional().nullable(),
  type: accountType.optional(),
  color: z.string().optional(),
  icon: z.string().optional().nullable(),
  currentBalance: z.number().optional(),
})

export const reorderAccountsSchema = z.object({
  ids: z.array(z.string()).min(1),
})

export const reconcileAccountSchema = z.object({
  statementBalance: z.number(),
  clearedTransactionIds: z.array(z.string()),
})

export const createSubAccountSchema = z.object({
  name: z.string().min(1),
  color: z.string().default('#6366f1'),
  initialBalance: z.number().default(0),
})
