import { test, expect } from '@playwright/test'
import { apiCreateAccount, apiDeleteAccount } from './helpers'

let accountId: string

test.beforeAll(async () => {
  accountId = await apiCreateAccount({
    name: 'E2E-Suchtest',
    type: 'CHECKING',
    currentBalance: 1000,
  })

  // Create transactions with distinct descriptions
  for (const desc of ['Rewe Einkauf', 'Aldi Markt', 'Rewe Online']) {
    await fetch('http://localhost:3000/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '2026-04-01',
        description: desc,
        mainAmount: -50,
        mainType: 'EXPENSE',
        accountId,
      }),
    })
  }
})

test.afterAll(async () => {
  // Delete transactions
  const res = await fetch(`http://localhost:3000/api/transactions?accountId=${accountId}`)
  const data = await res.json()
  for (const tx of data.data ?? []) {
    await fetch(`http://localhost:3000/api/transactions/${tx.id}`, { method: 'DELETE' })
  }
  await apiDeleteAccount(accountId)
})

test('search field filters transactions on account detail page', async ({ page }) => {
  await page.goto(`/accounts/${accountId}`)
  await page.waitForLoadState('networkidle')

  // All 3 transactions should be visible
  await expect(page.getByText('Rewe Einkauf')).toBeVisible()
  await expect(page.getByText('Aldi Markt')).toBeVisible()
  await expect(page.getByText('Rewe Online')).toBeVisible()

  // Type search term
  await page.getByPlaceholder('Suchen...').fill('Rewe')
  await page.waitForTimeout(500) // debounce

  // Only Rewe transactions should be visible
  await expect(page.getByText('Rewe Einkauf')).toBeVisible()
  await expect(page.getByText('Rewe Online')).toBeVisible()
  await expect(page.getByText('Aldi Markt')).not.toBeVisible()
})

test('clearing search shows all transactions again', async ({ page }) => {
  await page.goto(`/accounts/${accountId}`)
  await page.waitForLoadState('networkidle')

  // Search and then clear
  const searchInput = page.getByPlaceholder('Suchen...')
  await searchInput.fill('Aldi')
  await page.waitForTimeout(500)
  await expect(page.getByText('Aldi Markt')).toBeVisible()
  await expect(page.getByText('Rewe Einkauf')).not.toBeVisible()

  // Clear search
  await searchInput.fill('')
  await page.waitForTimeout(500)
  await expect(page.getByText('Rewe Einkauf')).toBeVisible()
  await expect(page.getByText('Aldi Markt')).toBeVisible()
})
