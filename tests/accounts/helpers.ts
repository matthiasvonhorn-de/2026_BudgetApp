// tests/accounts/helpers.ts

const BASE = 'http://localhost:3000'

export interface AccountPayload {
  name: string
  type: string
  color?: string
  currentBalance?: number
  bank?: string
  iban?: string
}

/** Creates an account via API. Returns the account id. */
export async function apiCreateAccount(payload: AccountPayload): Promise<string> {
  const res = await fetch(`${BASE}/api/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
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

/** Fetches all active accounts via API. */
export async function apiGetAccounts(): Promise<{ id: string; name: string; type: string }[]> {
  const res = await fetch(`${BASE}/api/accounts`)
  if (!res.ok) throw new Error(`getAccounts failed: ${await res.text()}`)
  return res.json()
}
