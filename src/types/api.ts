// Shared TypeScript interfaces for API responses.
// These mirror the Prisma models + includes used in the API routes.

export type AccountType = 'CHECKING' | 'SAVINGS' | 'CREDIT_CARD' | 'CASH' | 'INVESTMENT' | 'SPARPLAN' | 'FESTGELD'
export type CategoryType = 'INCOME' | 'EXPENSE' | 'TRANSFER'
export type TransactionStatus = 'PENDING' | 'CLEARED' | 'RECONCILED'
export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER'

// ── Account ──────────────────────────────────────────────────────────

export interface Account {
  id: string
  name: string
  iban: string | null
  bank: string | null
  type: AccountType
  color: string
  icon: string | null
  currentBalance: number
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
  _count?: { transactions: number }
}

export interface AccountRef {
  id: string
  name: string
  color: string
}

// ── Category ─────────────────────────────────────────────────────────

export interface Category {
  id: string
  name: string
  color: string
  icon: string | null
  type: CategoryType
  groupId: string | null
  sortOrder: number
  isActive: boolean
  rolloverEnabled: boolean
  subAccountGroupId: string | null
  subAccountLinkType: string
}

export interface CategoryRef {
  id: string
  name: string
  color: string
  type?: CategoryType
}

export interface CategoryGroup {
  id: string
  name: string
  sortOrder: number
  accountId: string
  categories: Category[]
}

// ── Transaction ──────────────────────────────────────────────────────

export interface Transaction {
  id: string
  date: string
  mainAmount: number | null
  mainType: TransactionType
  subAmount: number | null
  subType: TransactionType | null
  description: string
  payee: string | null
  notes: string | null
  accountId: string
  categoryId: string | null
  status: TransactionStatus
  importHash: string | null
  isReconciled: boolean
  subAccountEntryId: string | null
  transferToId: string | null
  createdAt: string
  updatedAt: string
  account?: AccountRef
  category?: CategoryRef | null
  loanPayment?: LoanPaymentRef | null
}

export interface TransactionPage {
  data: Transaction[]
  total: number
  page: number
  pageSize: number
}

// ── Budget ───────────────────────────────────────────────────────────

export interface BudgetCategory {
  id: string
  name: string
  color: string
  type: CategoryType
  rolloverEnabled: boolean
  budgeted: number
  rolledOver: number
  activity: number
  available: number
}

export interface BudgetGroup {
  id: string
  name: string
  sortOrder: number
  accountId: string
  categories: BudgetCategory[]
}

export interface BudgetSummary {
  totalBudgeted: number
  totalActivity: number
  totalAvailable: number
  readyToAssign: number
  totalIncome: number
}

export interface BudgetData {
  year: number
  month: number
  groups: BudgetGroup[]
  summary: BudgetSummary
}

// ── Loan ─────────────────────────────────────────────────────────────

export interface LoanPaymentRef {
  loanId: string
  periodNumber: number
  loan: { name: string }
  transactionId?: string | null
}

export interface LoanPayment {
  id: string
  loanId: string
  periodNumber: number
  dueDate: string
  scheduledPrincipal: number
  scheduledInterest: number
  scheduledBalance: number
  extraPayment: number
  paidAt: string | null
  transactionId: string | null
  notes: string | null
}

export interface Loan {
  id: string
  name: string
  loanType: string
  principal: number
  interestRate: number
  initialRepaymentRate: number
  termMonths: number
  startDate: string
  monthlyPayment: number
  accountId: string | null
  categoryId: string | null
  paidUntil: string | null
  notes: string | null
  isActive: boolean
  account?: AccountRef | null
  payments?: LoanPayment[]
  stats?: {
    totalInterestPaid: number
    totalPrincipalPaid: number
    remainingBalance: number
    periodsPaid: number
    totalPeriods: number
    nextDueDate: string | null
  }
}

// ── Savings ──────────────────────────────────────────────────────────

export interface SavingsEntry {
  id: string
  savingsConfigId: string
  entryType: 'CONTRIBUTION' | 'INTEREST' | 'FEE'
  periodNumber: number
  dueDate: string
  scheduledAmount: number
  scheduledBalance: number
  paidAt: string | null
  transactionId: string | null
  giroTransactionId: string | null
}

export interface SavingsConfig {
  id: string
  accountId: string
  account: { id: string; name: string; color: string; type: AccountType; currentBalance: number }
  linkedAccount?: { id: string; name: string } | null
  initialBalance: number
  upfrontFee: number
  accountNumber: string | null
  contributionAmount: number
  contributionFrequency: string | null
  interestRate: number
  interestFrequency: string
  startDate: string
  termMonths: number | null
  linkedAccountId: string | null
  categoryId: string | null
  notes: string | null
  entries?: SavingsEntry[]
  stats?: {
    totalInterestPaid: number
    totalContributionsPaid: number
    nextDueDate: string | null
    lastScheduledDate?: string | null
    totalEntries: number
    paidEntries: number
  }
}

// ── Reports ──────────────────────────────────────────────────────────

export interface MonthlySummary {
  year: number
  month: number
  income: number
  expenses: number
}

export interface CategorySpending {
  categoryId: string
  name: string
  color: string
  amount: number
}

export interface NetWorth {
  totalAssets: number
  totalDebts: number
  netWorth: number
}
