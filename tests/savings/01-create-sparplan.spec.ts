// tests/savings/01-create-sparplan.spec.ts
import { test, expect, type Page } from '@playwright/test'
import { apiDeleteSavings, apiDeleteAccount, apiCreateGiro } from './helpers'

// Sammelt alle während der Tests angelegten Account-IDs für Cleanup
const createdIds: string[] = []
let giroId: string | null = null

test.beforeAll(async () => {
  // Girokonto für verknüpfte Tests anlegen
  giroId = await apiCreateGiro('Test-Giro-01')
})

test.afterAll(async () => {
  for (const id of createdIds) {
    await apiDeleteSavings(id).catch(() => {})
  }
  if (giroId) await apiDeleteAccount(giroId).catch(() => {})
})

async function openDialog(page: Page) {
  await page.goto('/accounts')
  await page.getByRole('button', { name: /Sparkonto \/ Festgeld/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

async function getCreatedId(page: Page, name: string): Promise<string> {
  // Findet den Link zur Detailseite des gerade angelegten Kontos
  const link = page.getByRole('link', { name: new RegExp(name) }).first()
  await expect(link).toBeVisible({ timeout: 5000 })
  const href = await link.getAttribute('href')
  const id = href?.split('/').pop()
  if (!id) throw new Error(`Could not extract ID from href: ${href}`)
  return id
}

// Helper: findet Select-Trigger anhand des Label-Texts
function selectNear(page: Page, labelText: string) {
  return page.locator('div.space-y-1\\.5').filter({ has: page.locator(`label:has-text("${labelText}")`) }).locator('[data-slot="select-trigger"]').first()
}

test('1.1 Button disabled ohne Name', async ({ page }) => {
  await openDialog(page)
  const zinssatzInput = page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Zinssatz p.a.")') }).locator('input')
  await zinssatzInput.fill('3')
  const sparrateInput = page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Sparrate")') }).locator('input')
  await sparrateInput.fill('100')
  await expect(page.getByRole('button', { name: 'Anlegen' })).toBeDisabled()
})

test('1.2 Button disabled ohne Zinssatz', async ({ page }) => {
  await openDialog(page)
  const nameInput = page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Name")') }).locator('input').first()
  await nameInput.fill('Test Sparplan')
  const sparrateInput = page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Sparrate")') }).locator('input')
  await sparrateInput.fill('100')
  const zinssatzInput = page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Zinssatz p.a.")') }).locator('input')
  await zinssatzInput.clear()
  await expect(page.getByRole('button', { name: 'Anlegen' })).toBeDisabled()
})

test('1.3 Button disabled ohne Sparrate', async ({ page }) => {
  await openDialog(page)
  const nameInput = page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Name")') }).locator('input').first()
  await nameInput.fill('Test Sparplan')
  const zinssatzInput = page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Zinssatz p.a.")') }).locator('input')
  await zinssatzInput.fill('3')
  await expect(page.getByRole('button', { name: 'Anlegen' })).toBeDisabled()
})

test('1.4 Minimalanlage Sparplan', async ({ page }) => {
  await openDialog(page)
  const name = `SP-Minimal-${Date.now()}`
  const nameInput = page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Name")') }).locator('input').first()
  await nameInput.fill(name)
  const zinssatzInput = page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Zinssatz p.a.")') }).locator('input')
  await zinssatzInput.fill('3')
  const sparrateInput = page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Sparrate")') }).locator('input')
  await sparrateInput.fill('100')
  await page.getByRole('button', { name: 'Anlegen' }).click()
  // Toast erscheint
  await expect(page.getByText('Sparkonto angelegt')).toBeVisible()
  // Dialog schließt
  await expect(page.getByRole('dialog')).not.toBeVisible()
  // Konto in Liste sichtbar
  await expect(page.getByText(name)).toBeVisible()
  const id = await getCreatedId(page, name)
  if (id) createdIds.push(id)
})

test('1.5 Zinsgutschrift MONTHLY + Einzahlung MONTHLY', async ({ page }) => {
  await openDialog(page)
  const name = `SP-M-M-${Date.now()}`
  const nameInput = page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Name")') }).locator('input').first()
  await nameInput.fill(name)
  const zinssatzInput = page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Zinssatz p.a.")') }).locator('input')
  await zinssatzInput.fill('2.5')
  const sparrateInput = page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Sparrate")') }).locator('input')
  await sparrateInput.fill('200')
  // Zinsgutschrift: MONTHLY (default)
  // Einzahlung: MONTHLY (default)
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText('Sparkonto angelegt')).toBeVisible()
  await expect(page.getByText(name)).toBeVisible()
  const id = await getCreatedId(page, name)
  if (id) createdIds.push(id)
})

test('1.6 Zinsgutschrift QUARTERLY + Einzahlung MONTHLY', async ({ page }) => {
  await openDialog(page)
  const name = `SP-Q-M-${Date.now()}`
  const nameInput = page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Name")') }).locator('input').first()
  await nameInput.fill(name)
  const zinssatzInput = page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Zinssatz p.a.")') }).locator('input')
  await zinssatzInput.fill('3.5')
  const sparrateInput = page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Sparrate")') }).locator('input')
  await sparrateInput.fill('150')
  // Zinsgutschrift auf QUARTERLY setzen
  const interestSelect = selectNear(page, 'Zinsgutschrift')
  await interestSelect.click()
  await page.getByRole('option', { name: 'Quartärlich' }).first().click()
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText('Sparkonto angelegt')).toBeVisible()
  const id = await getCreatedId(page, name)
  if (id) createdIds.push(id)
})

test('1.7 Zinsgutschrift ANNUALLY + Einzahlung QUARTERLY', async ({ page }) => {
  await openDialog(page)
  const name = `SP-A-Q-${Date.now()}`
  const nameInput = page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Name")') }).locator('input').first()
  await nameInput.fill(name)
  const zinssatzInput = page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Zinssatz p.a.")') }).locator('input')
  await zinssatzInput.fill('4')
  const sparrateInput = page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Sparrate")') }).locator('input')
  await sparrateInput.fill('500')
  // Zinsgutschrift → Jährlich
  const interestSelect = selectNear(page, 'Zinsgutschrift')
  await interestSelect.click()
  await page.getByRole('option', { name: 'Jährlich' }).first().click()
  // Einzahlung → Quartärlich
  const contribSelect = selectNear(page, 'Einzahlungsfrequenz')
  await contribSelect.click()
  await page.getByRole('option', { name: 'Quartärlich' }).first().click()
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText('Sparkonto angelegt')).toBeVisible()
  const id = await getCreatedId(page, name)
  if (id) createdIds.push(id)
})

test('1.8 Zinsgutschrift MONTHLY + Einzahlung ANNUALLY', async ({ page }) => {
  await openDialog(page)
  const name = `SP-M-A-${Date.now()}`
  const nameInput = page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Name")') }).locator('input').first()
  await nameInput.fill(name)
  const zinssatzInput = page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Zinssatz p.a.")') }).locator('input')
  await zinssatzInput.fill('2')
  const sparrateInput = page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Sparrate")') }).locator('input')
  await sparrateInput.fill('1200')
  // Einzahlung → Jährlich
  const contribSelect = selectNear(page, 'Einzahlungsfrequenz')
  await contribSelect.click()
  await page.getByRole('option', { name: 'Jährlich' }).first().click()
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText('Sparkonto angelegt')).toBeVisible()
  const id = await getCreatedId(page, name)
  if (id) createdIds.push(id)
})

test('1.9 Mit IBAN', async ({ page }) => {
  await openDialog(page)
  const name = `SP-IBAN-${Date.now()}`
  const nameInput = page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Name")') }).locator('input').first()
  await nameInput.fill(name)
  const ibanInput = page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("IBAN")') }).locator('input')
  await ibanInput.fill('DE89 3704 0044 0532 0130 00')
  const zinssatzInput = page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Zinssatz p.a.")') }).locator('input')
  await zinssatzInput.fill('3')
  const sparrateInput = page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Sparrate")') }).locator('input')
  await sparrateInput.fill('100')
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText('Sparkonto angelegt')).toBeVisible()
  // Auf Detailseite navigieren und IBAN prüfen
  await page.getByRole('link', { name: name }).first().click()
  await expect(page.getByText('DE89 3704 0044 0532 0130 00')).toBeVisible()
  const id = page.url().split('/').pop() ?? ''
  if (id) createdIds.push(id)
})

test('1.10 Kategorie-Dropdown erscheint nur wenn Girokonto gewählt', async ({ page }) => {
  await openDialog(page)
  // Ohne Girokonto: Buchungskategorie-Container existiert nicht im DOM
  await expect(
    page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Buchungskategorie")') })
  ).toHaveCount(0)
  // Girokonto wählen
  const linkedSelect = selectNear(page, 'Verknüpftes Girokonto')
  await linkedSelect.click()
  await page.getByRole('option', { name: 'Test-Giro-01' }).click()
  // Jetzt Buchungskategorie-Feld sichtbar
  await expect(
    page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Buchungskategorie")') })
  ).toBeVisible()
  // Dialog schließen ohne Anlegen
  await page.getByRole('button', { name: 'Abbrechen' }).click()
})

test('1.11 Mit verknüpftem Girokonto (ohne Kategorie)', async ({ page }) => {
  await openDialog(page)
  const name = `SP-GiroNoKat-${Date.now()}`
  const nameInput = page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Name")') }).locator('input').first()
  await nameInput.fill(name)
  const zinssatzInput = page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Zinssatz p.a.")') }).locator('input')
  await zinssatzInput.fill('3')
  const sparrateInput = page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Sparrate")') }).locator('input')
  await sparrateInput.fill('100')
  const linkedSelect = selectNear(page, 'Verknüpftes Girokonto')
  await linkedSelect.click()
  await page.getByRole('option', { name: 'Test-Giro-01' }).click()
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText('Sparkonto angelegt')).toBeVisible()
  const id = await getCreatedId(page, name)
  if (id) createdIds.push(id)
})
