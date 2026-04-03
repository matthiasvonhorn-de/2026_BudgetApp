// tests/savings/06-edit.spec.ts
import { test, expect, type Page } from '@playwright/test'
import {
  apiCreateSavings, apiDeleteSavings, apiCreateGiro, apiDeleteAccount,
  apiGetSavings, today,
} from './helpers'

let sparplanId: string
let festgeldId: string  // mit Laufzeit → ExtendSection nicht sichtbar
let sparplanUnlimitedId: string  // unbegrenzte Laufzeit → ExtendSection sichtbar
let giroId: string

test.beforeAll(async () => {
  giroId = await apiCreateGiro(`Giro-Edit-${Date.now()}`)
  sparplanId = await apiCreateSavings({
    name: `Edit-SP-${Date.now()}`,
    savingsType: 'SPARPLAN',
    initialBalance: 0,
    interestRate: 0.03,
    interestFrequency: 'MONTHLY',
    startDate: today(),
    termMonths: null,
    contributionAmount: 100,
    contributionFrequency: 'MONTHLY',
  })
  festgeldId = await apiCreateSavings({
    name: `Edit-FG-${Date.now()}`,
    savingsType: 'FESTGELD',
    initialBalance: 10000,
    interestRate: 0.04,
    interestFrequency: 'MONTHLY',
    startDate: today(),
    termMonths: 24,
  })
  sparplanUnlimitedId = await apiCreateSavings({
    name: `Edit-SP-Unlimited-${Date.now()}`,
    savingsType: 'SPARPLAN',
    initialBalance: 0,
    interestRate: 0.025,
    interestFrequency: 'MONTHLY',
    startDate: today(),
    termMonths: null,
    contributionAmount: 50,
    contributionFrequency: 'MONTHLY',
  })
})

test.afterAll(async () => {
  await apiDeleteSavings(sparplanId).catch(() => {})
  await apiDeleteSavings(festgeldId).catch(() => {})
  await apiDeleteSavings(sparplanUnlimitedId).catch(() => {})
  await apiDeleteAccount(giroId).catch(() => {})
})

function inputNear(page: Page, labelText: string) {
  return page.locator('div.space-y-1\\.5')
    .filter({ has: page.locator(`label:has-text("${labelText}")`) })
    .locator('input').first()
}

function selectNear(page: Page, labelText: string) {
  return page.locator('div.space-y-1\\.5')
    .filter({ has: page.locator(`label:has-text("${labelText}")`) })
    .locator('[data-slot="select-trigger"]').first()
}

test('6.1 Name ändern', async ({ page }) => {
  await page.goto(`/savings/${sparplanId}/edit`)
  const newName = `Geändert-${Date.now()}`
  await inputNear(page, 'Name').fill(newName)
  await page.getByRole('button', { name: 'Speichern' }).click()
  // Redirect auf Detailseite
  await expect(page).toHaveURL(new RegExp(`/savings/${sparplanId}$`))
  await expect(page.getByText(newName)).toBeVisible()
})

test('6.2 IBAN eingeben', async ({ page }) => {
  await page.goto(`/savings/${sparplanId}/edit`)
  await inputNear(page, 'IBAN').fill('DE12 3456 7890 1234 5678 90')
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page).toHaveURL(new RegExp(`/savings/${sparplanId}$`))
  await expect(page.getByText('DE12 3456 7890 1234 5678 90')).toBeVisible()
})

test('6.3 Notizen ändern (kein Fehler)', async ({ page }) => {
  await page.goto(`/savings/${sparplanId}/edit`)
  await inputNear(page, 'Notizen').fill('Meine Notiz Test')
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByText('Änderungen gespeichert')).toBeVisible()
})

test('6.4 Zinssatz ändern zeigt Warnung', async ({ page }) => {
  await page.goto(`/savings/${sparplanId}/edit`)
  const rateInput = inputNear(page, 'Zinssatz p.a.')
  const currentVal = await rateInput.inputValue()
  const newVal = (parseFloat(currentVal) + 0.5).toFixed(2)
  await rateInput.fill(newVal)
  // Warnungstext erscheint
  await expect(page.getByText(/Ändert den Zinssatz/)).toBeVisible()
})

test('6.5 Zinssatz unverändert: keine Warnung', async ({ page }) => {
  await page.goto(`/savings/${sparplanId}/edit`)
  // Nichts ändern
  await expect(page.getByText(/Ändert den Zinssatz/)).not.toBeVisible()
})

test('6.6 Zinssatz ändern + Speichern → offene Zinsen neu berechnet', async ({ page }) => {
  const dataBefore = await apiGetSavings(sparplanId)
  const firstInterest = dataBefore.entries.find(e => e.entryType === 'INTEREST' && !e.paidAt)
  const amountBefore = firstInterest?.scheduledAmount ?? 0

  await page.goto(`/savings/${sparplanId}/edit`)
  const rateInput = inputNear(page, 'Zinssatz p.a.')
  // Auf deutlich anderen Zinssatz setzen (5 %)
  await rateInput.fill('5')
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByText('Änderungen gespeichert')).toBeVisible()

  const dataAfter = await apiGetSavings(sparplanId)
  const firstInterestAfter = dataAfter.entries.find(e => e.entryType === 'INTEREST' && !e.paidAt)
  // Betrag hat sich geändert
  expect(firstInterestAfter?.scheduledAmount ?? 0).not.toBe(amountBefore)
})

test('6.7 Girokonto verknüpfen → Kategorie-Dropdown erscheint', async ({ page }) => {
  await page.goto(`/savings/${sparplanId}/edit`)
  // Kategorie-Dropdown initial nicht sichtbar (kein Girokonto verknüpft)
  await expect(
    page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Buchungskategorie")') })
  ).toHaveCount(0)

  // Girokonto wählen
  await selectNear(page, 'Verknüpftes Girokonto').click()
  await page.getByRole('option', { name: /Giro-Edit/ }).click()

  // Kategorie-Dropdown erscheint
  await expect(
    page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Buchungskategorie")') })
  ).toBeVisible()

  // Abbrechen
  await page.getByRole('button', { name: 'Abbrechen' }).click()
})

test('6.8 Girokonto entfernen → Kategorie-Dropdown verschwindet', async ({ page }) => {
  // Erst Girokonto setzen und speichern
  await page.goto(`/savings/${sparplanId}/edit`)
  await selectNear(page, 'Verknüpftes Girokonto').click()
  await page.getByRole('option', { name: /Giro-Edit/ }).click()
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByText('Änderungen gespeichert')).toBeVisible()

  // Wieder öffnen und Girokonto entfernen
  await page.goto(`/savings/${sparplanId}/edit`)
  await selectNear(page, 'Verknüpftes Girokonto').click()
  await page.getByRole('option', { name: 'Kein Konto' }).click()
  // Kategorie-Dropdown verschwindet
  await expect(
    page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Buchungskategorie")') })
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByText('Änderungen gespeichert')).toBeVisible()
})

test('6.9 Zahlungsplan verlängern (+12 Monate) bei unbegrenztem Plan', async ({ page }) => {
  const dataBefore = await apiGetSavings(sparplanUnlimitedId)
  const countBefore = dataBefore.stats.totalEntries

  await page.goto(`/savings/${sparplanUnlimitedId}/edit`)
  // ExtendSection sichtbar
  await expect(page.getByText('Zahlungsplan verlängern')).toBeVisible()

  await page.getByRole('button', { name: '+ 12 Monate' }).click()
  await expect(page.getByText(/neue Einträge generiert/)).toBeVisible()

  const dataAfter = await apiGetSavings(sparplanUnlimitedId)
  expect(dataAfter.stats.totalEntries).toBeGreaterThan(countBefore)
})

test('6.10 Festgeld mit Laufzeit: Verlängerungssektion nicht sichtbar', async ({ page }) => {
  await page.goto(`/savings/${festgeldId}/edit`)
  await expect(page.getByText('Zahlungsplan verlängern')).not.toBeVisible()
})
