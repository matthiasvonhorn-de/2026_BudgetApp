// tests/transactions/02-filter-search.spec.ts
import { test, expect } from '@playwright/test'
import { apiCreateAccount, apiDeleteAccount, apiCreateTransaction, apiDeleteTransaction, today } from './helpers'

let accountId: string
const txIds: string[] = []
const marker = `SEARCH-${Date.now()}`

test.beforeAll(async () => {
  accountId = await apiCreateAccount(`E2E-Search-Konto-${Date.now()}`)

  // Create 3 transactions: 2 with the marker, 1 without
  txIds.push(
    await apiCreateTransaction({
      date: today(),
      description: `${marker}-Einkauf-A`,
      mainAmount: -25,
      mainType: 'EXPENSE',
      accountId,
    }),
  )
  txIds.push(
    await apiCreateTransaction({
      date: today(),
      description: `${marker}-Einkauf-B`,
      mainAmount: -50,
      mainType: 'EXPENSE',
      accountId,
    }),
  )
  txIds.push(
    await apiCreateTransaction({
      date: today(),
      description: `Andere-TX-${Date.now()}`,
      mainAmount: -10,
      mainType: 'EXPENSE',
      accountId,
    }),
  )
})

test.afterAll(async () => {
  for (const id of txIds) {
    await apiDeleteTransaction(id).catch(() => {})
  }
  if (accountId) await apiDeleteAccount(accountId).catch(() => {})
})

test('2.1 Search filters transactions by description', async ({ page }) => {
  await page.goto('/transactions')
  await page.waitForLoadState('networkidle')

  // Type the marker into the search field
  const searchInput = page.getByPlaceholder('Suchen nach Beschreibung oder Empfänger...')
  await searchInput.fill(marker)

  // Wait for debounce and results to update
  await page.waitForTimeout(500)
  await page.waitForLoadState('networkidle')

  // Both marker transactions should be visible
  await expect(page.getByText(`${marker}-Einkauf-A`)).toBeVisible({ timeout: 5000 })
  await expect(page.getByText(`${marker}-Einkauf-B`)).toBeVisible({ timeout: 5000 })

  // The "Andere" transaction should NOT be visible
  await expect(page.getByText('Andere-TX-')).not.toBeVisible()
})

test('2.2 Clearing search shows all transactions again', async ({ page }) => {
  await page.goto('/transactions')
  await page.waitForLoadState('networkidle')

  const searchInput = page.getByPlaceholder('Suchen nach Beschreibung oder Empfänger...')

  // First search for the marker
  await searchInput.fill(marker)
  await page.waitForTimeout(500)
  await page.waitForLoadState('networkidle')

  // Then clear
  await searchInput.clear()
  await page.waitForTimeout(500)
  await page.waitForLoadState('networkidle')

  // The "Andere" transaction should now be visible again
  await expect(page.getByText('Andere-TX-')).toBeVisible({ timeout: 5000 })
})
