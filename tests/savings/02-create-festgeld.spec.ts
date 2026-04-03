// tests/savings/02-create-festgeld.spec.ts
import { test, expect, type Page } from '@playwright/test'
import { apiDeleteSavings } from './helpers'

const createdIds: string[] = []

test.afterAll(async () => {
  for (const id of createdIds) {
    await apiDeleteSavings(id).catch(() => {})
  }
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

async function openDialogAsFestgeld(page: Page) {
  await page.goto('/accounts')
  await page.getByRole('button', { name: /Sparkonto \/ Festgeld/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  // Typ auf Festgeld wechseln
  await selectNear(page, 'Typ').click()
  await page.getByRole('option', { name: 'Festgeld' }).click()
}

async function getCreatedId(page: Page, name: string): Promise<string> {
  const link = page.getByRole('link', { name: new RegExp(name) }).first()
  await expect(link).toBeVisible({ timeout: 5000 })
  const href = await link.getAttribute('href')
  const id = href?.split('/').pop()
  if (!id) throw new Error(`Could not extract ID from href: ${href}`)
  return id
}

test('2.1 Festgeld: Sparplan-Felder nicht sichtbar', async ({ page }) => {
  await openDialogAsFestgeld(page)
  // Sparrate-Container existiert nicht
  await expect(
    page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Sparrate")') })
  ).toHaveCount(0)
  // Einzahlungsfrequenz-Container existiert nicht
  await expect(
    page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Einzahlungsfrequenz")') })
  ).toHaveCount(0)
  // Verknüpftes Girokonto-Container existiert nicht
  await expect(
    page.locator('div.space-y-1\\.5').filter({ has: page.locator('label:has-text("Verknüpftes Girokonto")') })
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Abbrechen' }).click()
})

test('2.2 Festgeld: Button disabled ohne Name', async ({ page }) => {
  await openDialogAsFestgeld(page)
  await inputNear(page, 'Zinssatz p.a.').fill('3')
  await expect(page.getByRole('button', { name: 'Anlegen' })).toBeDisabled()
})

test('2.3 Festgeld: Button disabled ohne Zinssatz', async ({ page }) => {
  await openDialogAsFestgeld(page)
  await inputNear(page, 'Name').fill('Test Festgeld')
  await inputNear(page, 'Zinssatz p.a.').clear()
  await expect(page.getByRole('button', { name: 'Anlegen' })).toBeDisabled()
})

test('2.4 Festgeld Minimalanlage', async ({ page }) => {
  await openDialogAsFestgeld(page)
  const name = `FG-Minimal-${Date.now()}`
  await inputNear(page, 'Name').fill(name)
  await inputNear(page, 'Zinssatz p.a.').fill('4')
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText('Sparkonto angelegt')).toBeVisible()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  const id = await getCreatedId(page, name)
  createdIds.push(id)
})

test('2.5 Festgeld: Zinsgutschrift MONTHLY', async ({ page }) => {
  await openDialogAsFestgeld(page)
  const name = `FG-M-${Date.now()}`
  await inputNear(page, 'Name').fill(name)
  await inputNear(page, 'Zinssatz p.a.').fill('3.5')
  // MONTHLY ist default, keine Änderung nötig
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText('Sparkonto angelegt')).toBeVisible()
  const id = await getCreatedId(page, name)
  createdIds.push(id)
})

test('2.6 Festgeld: Zinsgutschrift QUARTERLY', async ({ page }) => {
  await openDialogAsFestgeld(page)
  const name = `FG-Q-${Date.now()}`
  await inputNear(page, 'Name').fill(name)
  await inputNear(page, 'Zinssatz p.a.').fill('3.5')
  await selectNear(page, 'Zinsgutschrift').click()
  await page.getByRole('option', { name: 'Quartärlich' }).first().click()
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText('Sparkonto angelegt')).toBeVisible()
  const id = await getCreatedId(page, name)
  createdIds.push(id)
})

test('2.7 Festgeld: Zinsgutschrift ANNUALLY', async ({ page }) => {
  await openDialogAsFestgeld(page)
  const name = `FG-A-${Date.now()}`
  await inputNear(page, 'Name').fill(name)
  await inputNear(page, 'Zinssatz p.a.').fill('4')
  await selectNear(page, 'Zinsgutschrift').click()
  await page.getByRole('option', { name: 'Jährlich' }).first().click()
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText('Sparkonto angelegt')).toBeVisible()
  const id = await getCreatedId(page, name)
  createdIds.push(id)
})

test('2.8 Festgeld mit Startkapital', async ({ page }) => {
  await openDialogAsFestgeld(page)
  const name = `FG-Kapital-${Date.now()}`
  await inputNear(page, 'Name').fill(name)
  await inputNear(page, 'Zinssatz p.a.').fill('4')
  await inputNear(page, 'Einlagenbetrag').fill('10000')
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText('Sparkonto angelegt')).toBeVisible()
  await expect(page.getByText(name)).toBeVisible()
  const id = await getCreatedId(page, name)
  createdIds.push(id)
})
