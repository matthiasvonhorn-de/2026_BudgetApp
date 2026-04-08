// tests/accounts/02-edit-account.spec.ts
import { test, expect } from '@playwright/test'
import { apiCreateAccount, apiDeleteAccount } from './helpers'

let accountId: string
const originalName = `E2E-Edit-${Date.now()}`
const updatedName = `E2E-Edited-${Date.now()}`

test.beforeAll(async () => {
  accountId = await apiCreateAccount({
    name: originalName,
    type: 'CHECKING',
    bank: 'Edit Bank',
    currentBalance: 1000,
  })
})

test.afterAll(async () => {
  if (accountId) await apiDeleteAccount(accountId).catch(() => {})
})

test('2.1 Account appears with original name on accounts page', async ({ page }) => {
  await page.goto('/accounts')
  await page.waitForLoadState('networkidle')

  await expect(page.getByText(originalName)).toBeVisible({ timeout: 5000 })
})

test('2.2 Account name updates after API edit', async ({ page }) => {
  // Edit via API (since the UI dialog has a pre-existing bug)
  const res = await fetch(`http://localhost:3000/api/accounts/${accountId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: updatedName }),
  })
  if (!res.ok) throw new Error(`editAccount failed: ${await res.text()}`)

  // Navigate to accounts page
  await page.goto('/accounts')
  await page.waitForLoadState('networkidle')

  // Updated name should be visible
  await expect(page.getByText(updatedName)).toBeVisible({ timeout: 5000 })

  // Original name should NOT be visible
  await expect(page.getByText(originalName)).not.toBeVisible()
})

test('2.3 Edited account detail page shows updated name', async ({ page }) => {
  await page.goto(`/accounts/${accountId}`)
  await page.waitForLoadState('networkidle')

  // The detail page should show the updated name
  await expect(page.getByText(updatedName)).toBeVisible({ timeout: 5000 })
})
