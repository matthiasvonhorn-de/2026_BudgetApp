// tests/savings/05-detail-pay.spec.ts
import { test, expect } from '@playwright/test'
import {
  apiCreateSavings, apiDeleteSavings, apiCreateGiro, apiDeleteAccount,
  apiGetSavings, today, monthsFromNow,
} from './helpers'

let accountId: string
let giroId: string

test.beforeAll(async () => {
  giroId = await apiCreateGiro(`Giro-Pay-${Date.now()}`)
  accountId = await apiCreateSavings({
    name: `PayTest-${Date.now()}`,
    savingsType: 'SPARPLAN',
    initialBalance: 0,
    interestRate: 0.03,
    interestFrequency: 'MONTHLY',
    startDate: today(),
    termMonths: null,
    contributionAmount: 100,
    contributionFrequency: 'MONTHLY',
    linkedAccountId: giroId,
  })
})

test.afterAll(async () => {
  await apiDeleteSavings(accountId).catch(() => {})
  await apiDeleteAccount(giroId).catch(() => {})
})

test('5.1 Einzelne Contribution per Button buchen', async ({ page }) => {
  await page.goto(`/savings/${accountId}`)
  await page.locator('.flex.items-center.gap-2').getByRole('button', { name: 'Alle' }).click()

  // Ersten "Bezahlen"-Button klicken
  const payBtn = page.getByRole('button', { name: 'Bezahlen' }).first()
  await payBtn.click()

  // Toast erscheint
  await expect(page.getByText(/\d+ Eintrag\/Einträge gebucht/)).toBeVisible()
  // Zeile zeigt jetzt "gebucht"
  await expect(page.getByText('✓ gebucht').first()).toBeVisible()
})

test('5.2 Zinsen werden automatisch mitgebucht', async ({ page }) => {
  // Frisches Konto für diesen Test
  const id = await apiCreateSavings({
    name: `PayInterest-${Date.now()}`,
    savingsType: 'SPARPLAN',
    initialBalance: 0,
    interestRate: 0.03,
    interestFrequency: 'MONTHLY',
    startDate: today(),
    termMonths: null,
    contributionAmount: 100,
    contributionFrequency: 'MONTHLY',
  })

  await page.goto(`/savings/${id}`)
  await page.locator('.flex.items-center.gap-2').getByRole('button', { name: 'Alle' }).click()

  // Ersten Bezahlen-Button klicken (bucht gleichzeitig den INTEREST der gleichen Periode)
  await page.getByRole('button', { name: 'Bezahlen' }).first().click()
  await expect(page.getByText('✓ gebucht').first()).toBeVisible()

  // INTEREST-Zeile vor der gebuchten CONTRIBUTION zeigt "automatisch"
  await expect(page.getByText('✓ automatisch').first()).toBeVisible()

  await apiDeleteSavings(id).catch(() => {})
})

test('5.3 Bezahlt-bis-Datum bucht mehrere Einträge', async ({ page }) => {
  const id = await apiCreateSavings({
    name: `PayUntil-${Date.now()}`,
    savingsType: 'SPARPLAN',
    initialBalance: 0,
    interestRate: 0.03,
    interestFrequency: 'MONTHLY',
    startDate: today(),
    termMonths: null,
    contributionAmount: 100,
    contributionFrequency: 'MONTHLY',
  })

  await page.goto(`/savings/${id}`)

  // "Bezahlt bis" auf heute+2 Monate setzen
  const twoMonths = monthsFromNow(2)
  const dateInput = page.locator('input[type="date"]').last()
  await dateInput.fill(twoMonths)
  await dateInput.dispatchEvent('change')

  await page.getByRole('button', { name: 'Buchen' }).click()

  // Toast zeigt mind. 2 gebuchte Einträge
  await expect(page.getByText(/[2-9]+ Eintrag|[2-9]+ Eintr/)).toBeVisible({ timeout: 8000 })

  await apiDeleteSavings(id).catch(() => {})
})

test('5.4 Rückgängig-Link stellt Zeile wieder her', async ({ page }) => {
  const id = await apiCreateSavings({
    name: `Unpay-${Date.now()}`,
    savingsType: 'SPARPLAN',
    initialBalance: 0,
    interestRate: 0.03,
    interestFrequency: 'MONTHLY',
    startDate: today(),
    termMonths: null,
    contributionAmount: 100,
    contributionFrequency: 'MONTHLY',
  })

  await page.goto(`/savings/${id}`)
  await page.locator('.flex.items-center.gap-2').getByRole('button', { name: 'Alle' }).click()

  // Buchen
  await page.getByRole('button', { name: 'Bezahlen' }).first().click()
  await expect(page.getByText('✓ gebucht').first()).toBeVisible()

  // Rückgängig
  await page.getByText('rückgängig').first().click()
  await expect(page.getByText('Buchung rückgängig gemacht')).toBeVisible({ timeout: 8000 })
  await expect(page.getByRole('button', { name: 'Bezahlen' }).first()).toBeVisible()

  await apiDeleteSavings(id).catch(() => {})
})

test('5.5 Buchen ohne Datum zeigt Fehler-Toast', async ({ page }) => {
  await page.goto(`/savings/${accountId}`)
  // Datum-Input leer lassen, direkt Buchen klicken
  await page.getByRole('button', { name: 'Buchen' }).click()
  await expect(page.getByText('Bitte ein Datum eingeben')).toBeVisible()
})

test('5.6 Girokonto-Saldo sinkt bei Contribution-Buchung', async ({ page }) => {
  // Girokonto-Saldo vorher
  const before = await fetch('http://localhost:3000/api/accounts').then(r => r.json())
  const giroBefore = before.find((a: any) => a.id === giroId)?.currentBalance ?? 0

  await page.goto(`/savings/${accountId}`)
  await page.locator('.flex.items-center.gap-2').getByRole('button', { name: 'Alle' }).click()
  await page.getByRole('button', { name: 'Bezahlen' }).first().click()
  await expect(page.getByText('✓ gebucht').first()).toBeVisible()

  // Girokonto-Saldo nachher
  const after = await fetch('http://localhost:3000/api/accounts').then(r => r.json())
  const giroAfter = after.find((a: any) => a.id === giroId)?.currentBalance ?? 0

  expect(giroAfter).toBeLessThan(giroBefore)
})
