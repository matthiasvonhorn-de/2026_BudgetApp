// tests/savings/05-detail-pay.spec.ts
import { test, expect } from '@playwright/test'
import {
  apiCreateSavings, apiDeleteSavings, apiCreateGiro, apiDeleteAccount,
  today, monthsFromNow, monthsAgo,
} from './helpers'

const BASE = 'http://localhost:3000'
async function apiGetAccounts(): Promise<{ id: string; currentBalance: number }[]> {
  return fetch(`${BASE}/api/accounts`).then(r => r.json())
}

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

  await apiDeleteSavings(id).catch(() => {}) // best-effort cleanup (test body)
})

test('5.3 Rückgängig-Link stellt Zeile wieder her', async ({ page }) => {
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

test('5.4 Girokonto-Saldo sinkt bei Contribution-Buchung', async ({ page }) => {
  // Girokonto-Saldo vorher
  const before = await apiGetAccounts()
  const giroBefore = before.find(a => a.id === giroId)?.currentBalance ?? 0

  await page.goto(`/savings/${accountId}`)
  await page.locator('.flex.items-center.gap-2').getByRole('button', { name: 'Alle' }).click()
  await page.getByRole('button', { name: 'Bezahlen' }).first().click()
  await expect(page.getByText('✓ gebucht').first()).toBeVisible()

  // Girokonto-Saldo nachher
  const after = await apiGetAccounts()
  const giroAfter = after.find(a => a.id === giroId)?.currentBalance ?? 0

  expect(giroAfter).toBeLessThan(giroBefore)
})

test('5.5 Kein "Bezahlt bis" Input auf der Detailseite', async ({ page }) => {
  // Die "Bezahlt bis"-Funktion wurde aus der Detailseite entfernt — nur noch bei Anlage verfügbar
  await page.goto(`/savings/${accountId}`)
  // Kein Datum-Input mehr im Header-Bereich
  const dateInputs = page.locator('input[type="date"]')
  await expect(dateInputs).toHaveCount(0)
  // Kein "Buchen"-Button (nur "Bezahlen" pro Zeile erlaubt)
  await expect(page.getByRole('button', { name: 'Buchen' })).toHaveCount(0)
})

test('5.6 API: initializedUntil markiert Einträge ohne Transaktionen', async () => {
  const twoMonthsAgo = monthsAgo(2)
  const id = await apiCreateSavings({
    name: `InitUntil-${Date.now()}`,
    savingsType: 'SPARPLAN',
    initialBalance: 500,
    interestRate: 0.03,
    interestFrequency: 'MONTHLY',
    startDate: monthsAgo(6),
    termMonths: null,
    contributionAmount: 100,
    contributionFrequency: 'MONTHLY',
    initializedUntil: twoMonthsAgo,
  })

  const res = await fetch(`${BASE}/api/savings/${id}`)
  const data = await res.json()

  // Einträge bis einschließlich twoMonthsAgo: paidAt gesetzt, transactionId null
  const initEntries = data.entries.filter((e: any) =>
    e.paidAt !== null && e.transactionId === null
  )
  expect(initEntries.length).toBeGreaterThan(0)

  // Keine echten Transaktionen: alle initialisierten Einträge haben transactionId === null
  const withTransaction = data.entries.filter((e: any) => e.transactionId !== null)
  expect(withTransaction.length).toBe(0)

  await apiDeleteSavings(id).catch(() => {})
})

test('5.7 API: initializedUntil legt keine Gegenbuchung auf Girokonto an', async () => {
  const giro2Id = await apiCreateGiro(`Giro-InitTest-${Date.now()}`)
  const balanceBefore = (await (await fetch(`${BASE}/api/accounts`)).json())
    .find((a: any) => a.id === giro2Id)?.currentBalance ?? 0

  const id = await apiCreateSavings({
    name: `InitGiro-${Date.now()}`,
    savingsType: 'SPARPLAN',
    initialBalance: 0,
    interestRate: 0.03,
    interestFrequency: 'MONTHLY',
    startDate: monthsAgo(4),
    termMonths: null,
    contributionAmount: 200,
    contributionFrequency: 'MONTHLY',
    linkedAccountId: giro2Id,
    initializedUntil: monthsAgo(1),
  })

  const balanceAfter = (await (await fetch(`${BASE}/api/accounts`)).json())
    .find((a: any) => a.id === giro2Id)?.currentBalance ?? 0

  // Girokonto-Saldo unverändert — keine Gegenbuchungen bei Initialisierung
  expect(balanceAfter).toBe(balanceBefore)

  await apiDeleteSavings(id).catch(() => {})
  await apiDeleteAccount(giro2Id).catch(() => {})
})
