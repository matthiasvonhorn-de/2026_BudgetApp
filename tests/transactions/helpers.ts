// tests/transactions/helpers.ts

const BASE = 'http://localhost:3000'

/** Creates a checking account via API. Returns the account id. */
export async function apiCreateAccount(name: string, balance = 5000): Promise<string> {
  const res = await fetch(`${BASE}/api/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, type: 'CHECKING', currentBalance: balance }),
  })
  if (!res.ok) throw new Error(`createAccount failed: ${await res.text()}`)
  const data = await res.json()
  return data.id as string
}

/** Soft-deletes an account via API. */
export async function apiDeleteAccount(id: string): Promise<void> {
  const res = await fetch(`${BASE}/api/accounts/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`deleteAccount failed: ${await res.text()}`)
}

export interface TransactionPayload {
  date: string
  description: string
  mainAmount: number
  mainType: 'EXPENSE' | 'INCOME'
  accountId: string
  categoryId?: string
}

/** Creates a transaction via API. Returns the transaction id. */
export async function apiCreateTransaction(payload: TransactionPayload): Promise<string> {
  const res = await fetch(`${BASE}/api/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`createTransaction failed: ${await res.text()}`)
  const data = await res.json()
  return data.id as string
}

/** Deletes a transaction via API. */
export async function apiDeleteTransaction(id: string): Promise<void> {
  const res = await fetch(`${BASE}/api/transactions/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`deleteTransaction failed: ${await res.text()}`)
}

/** Returns today as 'YYYY-MM-DD'. */
export function today(): string {
  return new Date().toISOString().slice(0, 10)
}
