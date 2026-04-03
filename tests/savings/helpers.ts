// tests/savings/helpers.ts

const BASE = 'http://localhost:3000'

export interface SavingsCreatePayload {
  name: string
  savingsType: 'SPARPLAN' | 'FESTGELD'
  color?: string
  initialBalance?: number
  accountNumber?: string
  interestRate: number            // als Dezimal, z.B. 0.035
  interestFrequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY'
  startDate: string               // 'YYYY-MM-DD'
  termMonths?: number | null
  contributionAmount?: number
  contributionFrequency?: 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY'
  linkedAccountId?: string | null
  categoryId?: string | null
  notes?: string | null
}

/** Legt ein Sparkonto via API an. Gibt die account.id zurück. */
export async function apiCreateSavings(payload: SavingsCreatePayload): Promise<string> {
  const res = await fetch(`${BASE}/api/savings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`createSavings failed: ${await res.text()}`)
  const data = await res.json()
  return data.account.id as string
}

/** Soft-löscht ein Sparkonto via API. */
export async function apiDeleteSavings(accountId: string): Promise<void> {
  const res = await fetch(`${BASE}/api/savings/${accountId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`deleteSavings failed: ${await res.text()}`)
}

/** Legt ein Girokonto via API an. Gibt die id zurück. */
export async function apiCreateGiro(name: string): Promise<string> {
  const res = await fetch(`${BASE}/api/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, type: 'CHECKING', currentBalance: 5000 }),
  })
  if (!res.ok) throw new Error(`createGiro failed: ${await res.text()}`)
  const data = await res.json()
  return data.id as string
}

/** Soft-löscht ein Konto via API. */
export async function apiDeleteAccount(id: string): Promise<void> {
  const res = await fetch(`${BASE}/api/accounts/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`deleteAccount failed: ${await res.text()}`)
}

export interface SavingsEntry {
  id: string
  entryType: 'CONTRIBUTION' | 'INTEREST'
  periodNumber: number
  dueDate: string
  scheduledAmount: number
  scheduledBalance: number
  paidAt: string | null
  transactionId: string | null
  giroTransactionId: string | null
}

export interface SavingsData {
  id: string
  accountId: string
  interestRate: number
  interestFrequency: string
  contributionAmount: number
  contributionFrequency: string | null
  initialBalance: number
  accountNumber: string | null
  termMonths: number | null
  linkedAccountId: string | null
  categoryId: string | null
  notes: string | null
  account: { id: string; name: string; color: string; type: string; currentBalance: number }
  entries: SavingsEntry[]
  stats: {
    totalInterestPaid: number
    totalContributionsPaid: number
    nextDueDate: string | null
    lastScheduledDate: string | null
    totalEntries: number
    paidEntries: number
  }
}

/** Holt SavingsConfig inkl. Entries für ein Konto. */
export async function apiGetSavings(accountId: string): Promise<SavingsData> {
  const res = await fetch(`${BASE}/api/savings/${accountId}`)
  if (!res.ok) throw new Error(`getSavings failed: ${await res.text()}`)
  return res.json()
}

/** ISO-Datum von heute + n Monaten als 'YYYY-MM-DD'. Setzt Tag auf 1 um Monats-Overflow zu vermeiden. */
export function monthsFromNow(n: number): string {
  const d = new Date()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 10)
}

/** ISO-Datum von heute - n Monaten als 'YYYY-MM-DD'. */
export function monthsAgo(n: number): string {
  return monthsFromNow(-n)
}

/** Heutiges Datum als 'YYYY-MM-DD'. */
export function today(): string {
  return new Date().toISOString().slice(0, 10)
}
