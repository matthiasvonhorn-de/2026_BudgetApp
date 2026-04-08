// tests/transactions/03-delete-transaction.spec.ts
import { test, expect } from '@playwright/test'
import { apiCreateAccount, apiDeleteAccount, apiCreateTransaction, today } from './helpers'

let accountId: string
let txDescription: string

test.beforeAll(async () => {
  accountId = await apiCreateAccount(`E2E-Delete-TX-Konto-${Date.now()}`)
  txDescription = `E2E-Delete-TX-${Date.now()}`
  await apiCreateTransaction({
    date: today(),
    description: txDescription,
    mainAmount: -33.33,
    mainType: 'EXPENSE',
    accountId,
  })
})

test.afterAll(async () => {
  if (accountId) await apiDeleteAccount(accountId).catch(() => {})
})

test('3.1 Delete a transaction via the UI', async ({ page }) => {
  await page.goto('/transactions')
  await page.waitForLoadState('networkidle')

  // Find the transaction row
  const row = page.locator('tr').filter({ hasText: txDescription })
  await expect(row).toBeVisible({ timeout: 5000 })

  // Set up dialog handler for the confirm() dialog
  page.on('dialog', dialog => dialog.accept())

  // Click the delete button (the "x" character button) in this row
  const deleteButton = row.getByRole('button', { name: 'Transaktion löschen' })
  await deleteButton.click()

  // Toast appears
  await expect(page.getByText('Transaktion gelöscht')).toBeVisible({ timeout: 5000 })

  // Transaction is no longer visible
  await expect(page.getByText(txDescription)).not.toBeVisible()
})
