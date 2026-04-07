import { prisma } from '@/lib/prisma'

/**
 * Build a Request object for calling route handlers directly.
 * No HTTP server needed — route handlers accept standard Request objects.
 */
export function createRequest(
  method: string,
  path: string,
  body?: unknown,
): Request {
  const url = `http://test${path}`
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
  }
  return new Request(url, init)
}

/**
 * Build a route context with params (for [id] routes).
 * Next.js App Router passes params as a Promise.
 */
export function createParams(params: Record<string, string>) {
  return { params: Promise.resolve(params) }
}

/**
 * Seed a test account directly via Prisma. Returns the created account.
 */
export async function seedAccount(overrides: {
  name?: string
  type?: 'CHECKING' | 'SAVINGS' | 'CREDIT_CARD' | 'CASH' | 'INVESTMENT'
  currentBalance?: number
  sortOrder?: number
  iban?: string | null
  bank?: string | null
  color?: string
  isActive?: boolean
} = {}) {
  return prisma.account.create({
    data: {
      name: overrides.name ?? 'Test Account',
      type: overrides.type ?? 'CHECKING',
      currentBalance: overrides.currentBalance ?? 0,
      sortOrder: overrides.sortOrder ?? 0,
      iban: overrides.iban ?? null,
      bank: overrides.bank ?? null,
      color: overrides.color ?? '#6366f1',
      isActive: overrides.isActive ?? true,
    },
  })
}

/**
 * Seed a category group directly via Prisma.
 */
export async function seedCategoryGroup(accountId: string, overrides: {
  name?: string
  sortOrder?: number
} = {}) {
  return prisma.categoryGroup.create({
    data: {
      name: overrides.name ?? 'Test Group',
      sortOrder: overrides.sortOrder ?? 0,
      accountId,
    },
  })
}

/**
 * Seed a category directly via Prisma.
 */
export async function seedCategory(overrides: {
  name?: string
  type?: 'INCOME' | 'EXPENSE' | 'TRANSFER'
  groupId?: string | null
  color?: string
  sortOrder?: number
} = {}) {
  return prisma.category.create({
    data: {
      name: overrides.name ?? 'Test Category',
      type: overrides.type ?? 'EXPENSE',
      groupId: overrides.groupId ?? null,
      color: overrides.color ?? '#6366f1',
      sortOrder: overrides.sortOrder ?? 0,
    },
  })
}

/**
 * Seed a transaction directly via Prisma (does NOT update account balance).
 * For tests that need correct balance, use the POST route handler instead.
 */
export async function seedTransaction(accountId: string, overrides: {
  date?: Date
  mainAmount?: number | null
  mainType?: 'INCOME' | 'EXPENSE' | 'TRANSFER'
  subAmount?: number | null
  subType?: 'INCOME' | 'EXPENSE' | 'TRANSFER' | null
  description?: string
  payee?: string | null
  categoryId?: string | null
  status?: 'PENDING' | 'CLEARED' | 'RECONCILED'
  importHash?: string | null
} = {}) {
  return prisma.transaction.create({
    data: {
      date: overrides.date ?? new Date('2026-04-01'),
      mainAmount: overrides.mainAmount ?? -50,
      mainType: overrides.mainType ?? 'EXPENSE',
      subAmount: overrides.subAmount ?? null,
      subType: overrides.subType ?? null,
      description: overrides.description ?? 'Test transaction',
      payee: overrides.payee ?? null,
      categoryId: overrides.categoryId ?? null,
      status: overrides.status ?? 'PENDING',
      importHash: overrides.importHash ?? null,
      accountId,
    },
  })
}

/**
 * Seed a category rule directly via Prisma.
 */
export async function seedRule(categoryId: string, overrides: {
  name?: string
  field?: 'DESCRIPTION' | 'PAYEE' | 'AMOUNT'
  operator?: 'CONTAINS' | 'STARTS_WITH' | 'ENDS_WITH' | 'EQUALS' | 'GREATER_THAN' | 'LESS_THAN' | 'REGEX'
  value?: string
  priority?: number
  isActive?: boolean
} = {}) {
  return prisma.categoryRule.create({
    data: {
      name: overrides.name ?? 'Test Rule',
      field: overrides.field ?? 'DESCRIPTION',
      operator: overrides.operator ?? 'CONTAINS',
      value: overrides.value ?? 'test',
      categoryId,
      priority: overrides.priority ?? 0,
      isActive: overrides.isActive ?? true,
    },
  })
}

/**
 * Delete all rows from a table.
 * Uses deleteMany to respect Prisma's type safety.
 */
export async function cleanTable(table: 'transaction' | 'account' | 'category' | 'categoryGroup' | 'categoryRule' | 'appSetting' | 'csvProfile' | 'loanPayment' | 'loan' | 'subAccountEntry' | 'subAccountGroup' | 'subAccount') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma[table] as any).deleteMany()
}

/**
 * Clean ALL data from the database. Use in beforeAll/beforeEach to reset state.
 * Order matters — delete children before parents to avoid FK violations.
 */
export async function cleanAll() {
  // Children first, parents last
  await prisma.loanPayment.deleteMany()
  await prisma.loan.deleteMany()
  await prisma.savingsEntry.deleteMany()
  await prisma.savingsConfig.deleteMany()
  await prisma.portfolioValue.deleteMany()
  await prisma.portfolio.deleteMany()
  await prisma.assetValue.deleteMany()
  await prisma.asset.deleteMany()
  await prisma.assetType.deleteMany()
  await prisma.reconciliation.deleteMany()
  await prisma.budgetEntry.deleteMany()
  await prisma.transaction.deleteMany()
  await prisma.subAccountEntry.deleteMany()
  await prisma.subAccountGroup.deleteMany()
  await prisma.subAccount.deleteMany()
  await prisma.categoryRule.deleteMany()
  await prisma.category.deleteMany()
  await prisma.categoryGroup.deleteMany()
  await prisma.account.deleteMany()
  await prisma.csvProfile.deleteMany()
  await prisma.appSetting.deleteMany()
}
