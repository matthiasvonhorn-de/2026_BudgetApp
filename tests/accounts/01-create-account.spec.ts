// tests/accounts/01-create-account.spec.ts
import { test, expect } from '@playwright/test'
import { apiCreateAccount, apiDeleteAccount, apiGetAccounts } from './helpers'

// Track created account IDs for cleanup
const createdIds: string[] = []

test.afterAll(async () => {
  for (const id of createdIds) {
    await apiDeleteAccount(id).catch(() => {})
  }
})

test('1.1 Accounts page shows the heading and account cards', async ({ page }) => {
  await page.goto('/accounts')
  await page.waitForLoadState('networkidle')

  // The heading should be visible
  await expect(page.getByRole('heading', { name: 'Konten' })).toBeVisible()

  // "Gesamtvermögen" label should be visible
  await expect(page.getByText('Gesamtvermögen')).toBeVisible()
})

test('1.2 A newly created account appears on the accounts page', async ({ page }) => {
  const name = `E2E-Konto-${Date.now()}`

  // Create account via API
  const id = await apiCreateAccount({ name, type: 'CHECKING', currentBalance: 1234.56, bank: 'E2E Bank' })
  createdIds.push(id)

  // Navigate to accounts page
  await page.goto('/accounts')
  await page.waitForLoadState('networkidle')

  // Account card with the name should be visible
  await expect(page.getByText(name)).toBeVisible({ timeout: 5000 })

  // The bank name should be visible too
  await expect(page.getByText('E2E Bank')).toBeVisible()

  // Account type badge "Girokonto" should be visible
  await expect(page.getByText('Girokonto').first()).toBeVisible()
})

test('1.3 Account card links to the detail page', async ({ page }) => {
  const accounts = await apiGetAccounts()
  const testAccount = accounts.find(a => a.name.startsWith('E2E-Konto-'))
  if (!testAccount) {
    test.skip(true, 'No test account found')
    return
  }

  await page.goto('/accounts')
  await page.waitForLoadState('networkidle')

  // Click the account card
  await page.getByText(testAccount.name).click()

  // Should navigate to account detail page
  await page.waitForURL(`**/accounts/${testAccount.id}`)
})

test('1.4 Settings page shows Konto hinzufügen button', async ({ page }) => {
  await page.goto('/settings/general')
  await page.waitForLoadState('networkidle')

  // "Konto hinzufügen" button should be visible
  await expect(page.getByRole('button', { name: /Konto hinzufügen/ })).toBeVisible()
})
