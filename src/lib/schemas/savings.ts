import { z } from 'zod'

const savingsType = z.enum(['SPARPLAN', 'FESTGELD'])
const frequency = z.enum(['MONTHLY', 'QUARTERLY', 'ANNUALLY'])

export const createSavingsSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
  savingsType,
  initialBalance: z.number().min(0).optional(),
  upfrontFee: z.number().min(0).optional(),
  accountNumber: z.string().nullable().optional(),
  contributionAmount: z.number().min(0).optional(),
  contributionFrequency: frequency.nullable().optional(),
  interestRate: z.number().min(0),
  interestFrequency: frequency,
  startDate: z.string(),
  termMonths: z.number().int().positive().nullable().optional(),
  linkedAccountId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  initializedUntil: z.string().nullable().optional(),
})

export const updateSavingsSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  accountNumber: z.string().nullable().optional(),
  linkedAccountId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  interestRate: z.number().min(0).optional(),
  upfrontFee: z.number().min(0).optional(),
  contributionAmount: z.number().min(0).optional(),
  initializedUntil: z.string().nullable().optional(),
})

export const paySavingsSchema = z.object({
  paidUntil: z.string(),
})

export const extendSavingsSchema = z.object({
  months: z.number().int().min(1).max(360).default(24),
})
