import { test, expect } from '@playwright/test'

test.describe('Settings navigation', () => {
  test('settings page shows all sub-pages as cards', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: 'Einstellungen' })).toBeVisible()
    // Check cards by their descriptions (unique to settings page, avoids sidebar link conflicts)
    await expect(page.getByText('Konten anlegen, bearbeiten und Reihenfolge ändern')).toBeVisible()
    await expect(page.getByText('Währung und Zahlenformat konfigurieren')).toBeVisible()
    await expect(page.getByText('Kategoriegruppen und Kategorien verwalten')).toBeVisible()
    await expect(page.getByText('Automatische Regeln für den CSV-Import')).toBeVisible()
    await expect(page.getByText('Ratenkredite und Annuitätendarlehen')).toBeVisible()
    await expect(page.getByText('Depots anlegen und verwalten')).toBeVisible()
    await expect(page.getByText('Typen für Sachwerte verwalten')).toBeVisible()
  })

  test('accounts settings page has back button and loads', async ({ page }) => {
    await page.goto('/settings/accounts')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: 'Konten' })).toBeVisible()
    await expect(page.getByText('Zurück')).toBeVisible()

    // Back button navigates to settings
    await page.getByText('Zurück').click()
    await page.waitForURL('/settings')
    await expect(page.getByRole('heading', { name: 'Einstellungen' })).toBeVisible()
  })

  test('general settings page has back button and shows currency', async ({ page }) => {
    await page.goto('/settings/general')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: 'Allgemein' })).toBeVisible()
    await expect(page.getByText('Zurück')).toBeVisible()
    await expect(page.getByText('Währung & Zahlenformat')).toBeVisible()
  })

  test('all settings sub-pages have back button', async ({ page }) => {
    const subPages = [
      { path: '/settings/accounts', heading: 'Konten' },
      { path: '/settings/general', heading: 'Allgemein' },
      { path: '/settings/categories', heading: 'Kategorien & Gruppen' },
      { path: '/settings/rules', heading: 'Kategorisierungsregeln' },
      { path: '/settings/loans', heading: 'Bankkredite' },
      { path: '/settings/portfolios', heading: 'Aktiendepots' },
      { path: '/settings/asset-types', heading: 'Sachwert-Typen' },
    ]

    for (const { path, heading } of subPages) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await expect(page.getByText('Zurück')).toBeVisible({ timeout: 5000 })
      await expect(page.getByRole('heading', { name: heading })).toBeVisible()
    }
  })
})
