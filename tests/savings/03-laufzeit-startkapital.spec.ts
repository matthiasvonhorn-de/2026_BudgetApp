// tests/savings/03-laufzeit-startkapital.spec.ts
import { test, expect } from '@playwright/test'
import {
  apiCreateSavings, apiDeleteSavings, apiGetSavings,
  monthsAgo, today,
} from './helpers'

const createdIds: string[] = []

test.afterAll(async () => {
  for (const id of createdIds) {
    await apiDeleteSavings(id).catch(() => {})
  }
})

// Matrix: Sparplan (MONTHLY/MONTHLY)
// 1. Startkapital=0, Laufzeit=12
test('3.1 Sparplan: kein Startkapital, Laufzeit 12 Monate', async ({ page }) => {
  const id = await apiCreateSavings({
    name: `SP-0-12-${Date.now()}`,
    savingsType: 'SPARPLAN',
    initialBalance: 0,
    interestRate: 0.03,
    interestFrequency: 'MONTHLY',
    startDate: today(),
    termMonths: 12,
    contributionAmount: 100,
    contributionFrequency: 'MONTHLY',
  })
  createdIds.push(id)

  await page.goto(`/savings/${id}`)
  await page.getByRole('button', { name: 'Alle' }).click()

  const rows = page.locator('tbody tr')
  // 12 CONTRIBUTION + 12 INTEREST = 24 Einträge
  await expect(rows).toHaveCount(24)

  // Erste scheduledBalance > 0 — use API instead of parsing locale-specific currency text
  const data31 = await apiGetSavings(id)
  const firstEntry31 = data31.entries[0]
  expect(firstEntry31.scheduledBalance).toBeGreaterThan(0)
})

// 2. Startkapital=5000, Laufzeit=12
test('3.2 Sparplan: Startkapital 5000 €, Laufzeit 12 Monate', async ({ page }) => {
  const id = await apiCreateSavings({
    name: `SP-5k-12-${Date.now()}`,
    savingsType: 'SPARPLAN',
    initialBalance: 5000,
    interestRate: 0.03,
    interestFrequency: 'MONTHLY',
    startDate: today(),
    termMonths: 12,
    contributionAmount: 100,
    contributionFrequency: 'MONTHLY',
  })
  createdIds.push(id)

  const data = await apiGetSavings(id)
  // Erster INTEREST-Eintrag: scheduledBalance > 5000 (Startkapital hat Zinsen)
  const firstInterest = data.entries.find((e: any) => e.entryType === 'INTEREST')
  expect(firstInterest.scheduledBalance).toBeGreaterThan(5000)

  // Aktueller Saldo ≥ 5000 (durch Auto-Initialisierung kann er schon höher sein)
  expect(data.account.currentBalance).toBeGreaterThanOrEqual(5000)

  // UI: Detailseite lädt, Konto-Name ist sichtbar
  await page.goto(`/savings/${id}`)
  await expect(page.locator('h1').filter({ hasText: 'SP-5k-12-' })).toBeVisible()
})

// 3. Startkapital=0, unbegrenzt (startDate vor 3 Monaten)
test('3.3 Sparplan: kein Startkapital, unbegrenzte Laufzeit', async ({ page }) => {
  const start = monthsAgo(3)
  const id = await apiCreateSavings({
    name: `SP-0-inf-${Date.now()}`,
    savingsType: 'SPARPLAN',
    initialBalance: 0,
    interestRate: 0.03,
    interestFrequency: 'MONTHLY',
    startDate: start,
    termMonths: null,
    contributionAmount: 100,
    contributionFrequency: 'MONTHLY',
  })
  createdIds.push(id)

  const data = await apiGetSavings(id)
  // mind. 24 Einträge (today+24M horizon)
  expect(data.stats.totalEntries).toBeGreaterThanOrEqual(24)

  // Vergangene Einträge sind initialisiert (paidAt gesetzt)
  expect(data.stats.paidEntries).toBeGreaterThan(0)

  // UI-Detailseite: Vergangene Einträge zeigen "initialisiert"
  await page.goto(`/savings/${id}`)
  await page.getByRole('button', { name: 'Alle' }).click()
  await expect(page.getByText('✓ initialisiert').first()).toBeVisible()
})

// 4. Startkapital=5000, unbegrenzt (startDate vor 6 Monaten)
test('3.4 Sparplan: Startkapital 5000 €, unbegrenzte Laufzeit', async ({ page }) => {
  const start = monthsAgo(6)
  const id = await apiCreateSavings({
    name: `SP-5k-inf-${Date.now()}`,
    savingsType: 'SPARPLAN',
    initialBalance: 5000,
    interestRate: 0.03,
    interestFrequency: 'MONTHLY',
    startDate: start,
    termMonths: null,
    contributionAmount: 100,
    contributionFrequency: 'MONTHLY',
  })
  createdIds.push(id)

  const data = await apiGetSavings(id)
  // Saldo ≥ initialBalance (mindestens 5000)
  expect(data.account.currentBalance).toBeGreaterThanOrEqual(5000)
  // paidEntries > 0 (vergangene initialisiert)
  expect(data.stats.paidEntries).toBeGreaterThan(0)
  expect(data.stats.totalEntries).toBeGreaterThanOrEqual(24)
})

// 5. Festgeld: kein Startkapital, Laufzeit 12 Monate (MONTHLY)
test('3.5 Festgeld: kein Startkapital, Laufzeit 12 Monate', async ({ page }) => {
  const id = await apiCreateSavings({
    name: `FG-0-12-${Date.now()}`,
    savingsType: 'FESTGELD',
    initialBalance: 0,
    interestRate: 0.04,
    interestFrequency: 'MONTHLY',
    startDate: today(),
    termMonths: 12,
  })
  createdIds.push(id)

  await page.goto(`/savings/${id}`)
  await page.getByRole('button', { name: 'Alle' }).click()

  const rows = page.locator('tbody tr')
  // Nur 12 INTEREST-Einträge, keine CONTRIBUTION
  await expect(rows).toHaveCount(12)
  // Alle Zeilen zeigen "Zinsen"
  const firstType = page.locator('tbody tr').first().locator('td').nth(1)
  await expect(firstType).toContainText('Zinsen')
})

// 6. Festgeld: Startkapital 10000, Laufzeit 12 Monate
test('3.6 Festgeld: Startkapital 10.000 €, Laufzeit 12 Monate', async ({ page }) => {
  const id = await apiCreateSavings({
    name: `FG-10k-12-${Date.now()}`,
    savingsType: 'FESTGELD',
    initialBalance: 10000,
    interestRate: 0.04,
    interestFrequency: 'MONTHLY',
    startDate: today(),
    termMonths: 12,
  })
  createdIds.push(id)

  const data = await apiGetSavings(id)
  const lastEntry = data.entries[data.entries.length - 1]
  // Saldo nach 12 Monaten > 10.000
  expect(lastEntry.scheduledBalance).toBeGreaterThan(10000)
})

// 7. Festgeld: kein Startkapital, unbegrenzt
test('3.7 Festgeld: kein Startkapital, unbegrenzte Laufzeit', async ({ page }) => {
  const id = await apiCreateSavings({
    name: `FG-0-inf-${Date.now()}`,
    savingsType: 'FESTGELD',
    initialBalance: 0,
    interestRate: 0.04,
    interestFrequency: 'MONTHLY',
    startDate: today(),
    termMonths: null,
  })
  createdIds.push(id)

  const data = await apiGetSavings(id)
  expect(data.stats.totalEntries).toBeGreaterThanOrEqual(24)
})

// 8. Festgeld: Startkapital 10000, unbegrenzt (startDate vor 3 Monaten)
test('3.8 Festgeld: Startkapital 10.000 €, unbegrenzte Laufzeit', async ({ page }) => {
  const start = monthsAgo(3)
  const id = await apiCreateSavings({
    name: `FG-10k-inf-${Date.now()}`,
    savingsType: 'FESTGELD',
    initialBalance: 10000,
    interestRate: 0.04,
    interestFrequency: 'MONTHLY',
    startDate: start,
    termMonths: null,
  })
  createdIds.push(id)

  const data = await apiGetSavings(id)
  // Vergangene Einträge initialisiert
  expect(data.stats.paidEntries).toBeGreaterThan(0)
  // Saldo ≥ 10.000 (Zinsen wurden initialisiert)
  expect(data.account.currentBalance).toBeGreaterThanOrEqual(10000)

  await page.goto(`/savings/${id}`)
  await page.getByRole('button', { name: 'Alle' }).click()
  await expect(page.getByText('✓ initialisiert').first()).toBeVisible()
})
