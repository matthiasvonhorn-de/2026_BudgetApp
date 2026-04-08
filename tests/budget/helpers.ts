// tests/budget/helpers.ts

const BASE = 'http://localhost:3000'

/** Creates a checking account via API. Returns the account id. */
export async function apiCreateAccount(name: string): Promise<string> {
  const res = await fetch(`${BASE}/api/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, type: 'CHECKING', currentBalance: 10000 }),
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

/** Creates a category group via API. Returns the group id. */
export async function apiCreateCategoryGroup(name: string, accountId: string): Promise<string> {
  const res = await fetch(`${BASE}/api/category-groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, accountId }),
  })
  if (!res.ok) throw new Error(`createCategoryGroup failed: ${await res.text()}`)
  const data = await res.json()
  return data.id as string
}

/** Deletes a category group via API. */
export async function apiDeleteCategoryGroup(id: string): Promise<void> {
  const res = await fetch(`${BASE}/api/category-groups/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`deleteCategoryGroup failed: ${await res.text()}`)
}

/** Creates a category via API. Returns the category id. */
export async function apiCreateCategory(
  name: string,
  groupId: string,
  opts?: { color?: string; type?: string },
): Promise<string> {
  const res = await fetch(`${BASE}/api/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      groupId,
      color: opts?.color ?? '#6366f1',
      type: opts?.type ?? 'EXPENSE',
    }),
  })
  if (!res.ok) throw new Error(`createCategory failed: ${await res.text()}`)
  const data = await res.json()
  return data.id as string
}

/** Deletes a category via API. */
export async function apiDeleteCategory(id: string): Promise<void> {
  const res = await fetch(`${BASE}/api/categories/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`deleteCategory failed: ${await res.text()}`)
}

/** Sets a budget amount for a category in a given month/year. */
export async function apiSetBudget(
  year: number,
  month: number,
  categoryId: string,
  budgeted: number,
): Promise<void> {
  const res = await fetch(`${BASE}/api/budget/${year}/${month}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([{ categoryId, budgeted }]),
  })
  if (!res.ok) throw new Error(`setBudget failed: ${await res.text()}`)
}
