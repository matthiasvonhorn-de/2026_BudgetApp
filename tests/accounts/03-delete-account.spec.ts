// tests/accounts/03-delete-account.spec.ts
import { test, expect } from '@playwright/test'
import { apiCreateAccount } from './helpers'

let accountName: string

test.beforeAll(async () => {
  accountName = `E2E-Delete-${Date.now()}`
  await apiCreateAccount({
    name: accountName,
    type: 'CHECKING',
    currentBalance: 0,
  })
})

test('3.1 Delete account via settings page', async ({ page }) => {
  await page.goto('/settings/general')
  await page.waitForLoadState('networkidle')

  // Find the account row
  const accountRow = page.locator('.flex.items-center.justify-between').filter({ hasText: accountName })
  await expect(accountRow).toBeVisible({ timeout: 5000 })

  // Set up dialog handler for the confirm() dialog
  page.on('dialog', dialog => dialog.accept())

  // Click the delete (trash) button within this row
  const deleteButton = accountRow.locator('button.text-destructive').first()
  await deleteButton.click()

  // Toast appears
  await expect(page.getByText('Konto gelöscht')).toBeVisible()

  // Account is no longer visible in the list
  await expect(page.getByText(accountName)).not.toBeVisible()
})
