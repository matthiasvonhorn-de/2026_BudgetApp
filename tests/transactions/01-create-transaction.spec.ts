// tests/transactions/01-create-transaction.spec.ts
import { test, expect } from '@playwright/test'
import { apiCreateAccount, apiDeleteAccount, today } from './helpers'

let accountId: string
let accountName: string

test.beforeAll(async () => {
  accountName = `E2E-TX-Konto-${Date.now()}`
  accountId = await apiCreateAccount(accountName)
})

test.afterAll(async () => {
  if (accountId) await apiDeleteAccount(accountId).catch(() => {})
})

test('1.1 Create a new expense transaction', async ({ page }) => {
  await page.goto('/transactions')
  await page.waitForLoadState('networkidle')

  // Click "Neue Transaktion"
  await page.getByRole('button', { name: /Neue Transaktion/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Neue Transaktion' })).toBeVisible()

  const description = `E2E-Ausgabe-${Date.now()}`

  // Type defaults to "Ausgabe" (EXPENSE)
  // Fill date
  await page.getByLabel('Datum *').fill(today())

  // Fill description
  await page.getByLabel('Beschreibung *').fill(description)

  // Fill amount
  const amountField = page.locator('[name="amount"]')
  await amountField.fill('42.50')

  // Select account — locate the "Konto *" label's parent form item, then find the trigger inside
  const kontoFormItem = page.getByRole('dialog').locator('div').filter({ has: page.locator('label:text-is("Konto *")') }).first()
  const accountTrigger = kontoFormItem.locator('[data-slot="select-trigger"]')
  await accountTrigger.click({ timeout: 5000 })
  await page.getByRole('option', { name: accountName }).click()

  // Click "Speichern"
  await page.getByRole('button', { name: 'Speichern' }).click()

  // Dialog closes
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

  // Transaction appears in the list
  await expect(page.getByText(description)).toBeVisible({ timeout: 5000 })
})

test('1.2 Create an income transaction', async ({ page }) => {
  await page.goto('/transactions')
  await page.waitForLoadState('networkidle')

  await page.getByRole('button', { name: /Neue Transaktion/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()

  const description = `E2E-Einnahme-${Date.now()}`

  // Change type to Einnahme — first trigger in the dialog is the type selector
  const typeTrigger = page.getByRole('dialog').locator('[data-slot="select-trigger"]').first()
  await typeTrigger.click()
  await page.getByRole('option', { name: 'Einnahme' }).click()

  // Fill form
  await page.getByLabel('Datum *').fill(today())
  await page.getByLabel('Beschreibung *').fill(description)

  const amountField = page.locator('[name="amount"]')
  await amountField.fill('1500')

  // Select account
  const kontoFormItem = page.getByRole('dialog').locator('div').filter({ has: page.locator('label:text-is("Konto *")') }).first()
  const accountTrigger = kontoFormItem.locator('[data-slot="select-trigger"]')
  await accountTrigger.click({ timeout: 5000 })
  await page.getByRole('option', { name: accountName }).click()

  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })
  await expect(page.getByText(description)).toBeVisible({ timeout: 5000 })
})
