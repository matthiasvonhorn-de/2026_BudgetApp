// tests/savings/04-detail-view.spec.ts
import { test, expect } from '@playwright/test'
import { apiCreateSavings, apiDeleteSavings, apiGetSavings, monthsAgo } from './helpers'

let accountId: string

test.beforeAll(async () => {
  accountId = await apiCreateSavings({
    name: `ViewTest-${Date.now()}`,
    savingsType: 'SPARPLAN',
    initialBalance: 1000,
    interestRate: 0.03,
    interestFrequency: 'MONTHLY',
    startDate: monthsAgo(6),
    termMonths: null,
    contributionAmount: 100,
    contributionFrequency: 'MONTHLY',
  })
})

test.afterAll(async () => {
  await apiDeleteSavings(accountId).catch(() => {})
})

test.beforeEach(async ({ page }) => {
  await page.goto(`/savings/${accountId}`)
})

test('4.1 Filter 1 Jahr: zeigt weniger Einträge als Alle', async ({ page }) => {
  // Zuerst Alle
  await page.locator('.flex.items-center.gap-2').getByRole('button', { name: 'Alle' }).click()
  const allRows = await page.locator('tbody tr').count()

  // Dann 1 J.
  await page.locator('.flex.items-center.gap-2').getByRole('button', { name: '1 J.' }).click()
  const oneYearRows = await page.locator('tbody tr').count()

  expect(oneYearRows).toBeLessThan(allRows)
  expect(oneYearRows).toBeGreaterThan(0)
})

test('4.2 Filter-Reihenfolge: 1J ≤ 2J ≤ 5J ≤ 10J ≤ Alle', async ({ page }) => {
  const counts: Record<string, number> = {}
  const filterArea = page.locator('.flex.items-center.gap-2')

  for (const label of ['1 J.', '2 J.', '5 J.', '10 J.', 'Alle']) {
    await filterArea.getByRole('button', { name: label }).click()
    counts[label] = await page.locator('tbody tr').count()
  }

  expect(counts['1 J.']).toBeLessThanOrEqual(counts['2 J.'])
  expect(counts['2 J.']).toBeLessThanOrEqual(counts['5 J.'])
  expect(counts['5 J.']).toBeLessThanOrEqual(counts['10 J.'])
  expect(counts['10 J.']).toBeLessThanOrEqual(counts['Alle'])
})

test('4.3 Filter Alle: zeigt alle Einträge aus der API', async ({ page }) => {
  const data = await apiGetSavings(accountId)
  const totalEntries = data.stats.totalEntries

  await page.locator('.flex.items-center.gap-2').getByRole('button', { name: 'Alle' }).click()
  const rows = await page.locator('tbody tr').count()

  expect(rows).toBe(totalEntries)
})

test('4.4 Vergangene paid-Einträge sichtbar auch bei engem Filter', async ({ page }) => {
  // Unter 1J-Filter sind vergangene bezahlte Einträge noch sichtbar
  await page.locator('.flex.items-center.gap-2').getByRole('button', { name: '1 J.' }).click()
  // Mind. ein "initialisiert"-Eintrag muss sichtbar sein (vergangene 6 Monate)
  await expect(page.getByText('✓ initialisiert').first()).toBeVisible()
})

test('4.5 Älteste Einträge stehen oben (Sortierung)', async ({ page }) => {
  await page.locator('.flex.items-center.gap-2').getByRole('button', { name: 'Alle' }).click()
  const rows = page.locator('tbody tr')

  // Ersten und letzten Datumswert vergleichen
  const firstDate = await rows.first().locator('td').first().textContent()
  const lastDate = await rows.last().locator('td').first().textContent()

  // Datum ist im Format DD.MM.YYYY — in vergleichbares Format konvertieren
  expect(firstDate, 'first row date should not be null').toBeTruthy()
  expect(lastDate, 'last row date should not be null').toBeTruthy()
  const parseDE = (s: string) => {
    const [d, m, y] = s.trim().split('.')
    return new Date(`${y}-${m}-${d}`)
  }
  const first = parseDE(firstDate!)
  const last = parseDE(lastDate!)
  expect(first.getTime(), 'first row should be older than last row').toBeLessThan(last.getTime())
})

test('4.6 Filter-Button wechselt aktiven Zustand (Highlight)', async ({ page }) => {
  const filterArea = page.locator('.flex.items-center.gap-2')

  // 5 J. Button anklicken und prüfen ob er aktiv wirkt
  const btn5 = filterArea.getByRole('button', { name: '5 J.' })
  await btn5.click()
  // Aktiver Button hat bg-primary-Klasse (laut Implementierung)
  await expect(btn5).toHaveClass(/bg-primary/)

  // 1 J. anklicken — 5 J. nicht mehr aktiv
  const btn1 = filterArea.getByRole('button', { name: '1 J.' })
  await btn1.click()
  await expect(btn1).toHaveClass(/bg-primary/)
  await expect(btn5).not.toHaveClass(/bg-primary/)
})

test('4.7 Filter-Umschaltung 1J → Alle → 1J behält Konsistenz', async ({ page }) => {
  const filterArea = page.locator('.flex.items-center.gap-2')

  await filterArea.getByRole('button', { name: '1 J.' }).click()
  const count1 = await page.locator('tbody tr').count()

  await filterArea.getByRole('button', { name: 'Alle' }).click()
  await filterArea.getByRole('button', { name: '1 J.' }).click()
  const count1Again = await page.locator('tbody tr').count()

  expect(count1Again).toBe(count1)
})
