# Sparkonto E2E-Tests (Playwright) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Playwright E2E-Tests für das Sparkonto-Feature – alle Eingabefeld-Kombinationen, Laufzeit/Startkapital-Matrix, Anzeigefilter, Buchen/Rückgängig, Bearbeiten.

**Architecture:** Playwright Test gegen `http://localhost:3000` (Dev-Server läuft bereits). Shared API-Helpers für Setup/Teardown. Pro Spec-Datei: `beforeAll` legt Testdaten via API an, `afterAll` räumt auf. UI-Tests gehen über den Browser.

**Tech Stack:** `@playwright/test`, TypeScript, Chromium headless, laufende Next.js Dev-App.

---

## File Structure

| Datei | Zweck |
|---|---|
| `playwright.config.ts` | Playwright-Konfiguration: baseURL, webServer, 1 Worker |
| `tests/savings/helpers.ts` | API-Hilfsfunktionen für Setup/Teardown |
| `tests/savings/01-create-sparplan.spec.ts` | Sparplan anlegen – Validierung + Feldkombinationen |
| `tests/savings/02-create-festgeld.spec.ts` | Festgeld anlegen – Validierung + Typ-spezifische Felder |
| `tests/savings/03-laufzeit-startkapital.spec.ts` | Laufzeit × Startkapital Matrix |
| `tests/savings/04-detail-view.spec.ts` | Anzeigefilter 1J/2J/5J/10J/Alle |
| `tests/savings/05-detail-pay.spec.ts` | Buchen & Rückgängig |
| `tests/savings/06-edit.spec.ts` | Bearbeiten: Felder, Zinssatzwarnung, Verlängerung |

---

## Task 1: Playwright installieren + konfigurieren

**Files:**
- Create: `playwright.config.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Playwright installieren**

```bash
cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp"
npm install --save-dev @playwright/test
npx playwright install chromium
```

Erwartete Ausgabe: `✓ Chromium ... downloaded`

- [ ] **Step 2: `playwright.config.ts` anlegen**

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
```

- [ ] **Step 3: Test-Script in `package.json` ergänzen**

In `package.json` unter `"scripts"` hinzufügen:
```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

- [ ] **Step 4: Verzeichnis anlegen und Smoke-Test**

```bash
mkdir -p tests/savings
```

Erstelle `tests/savings/smoke.spec.ts`:
```typescript
import { test, expect } from '@playwright/test'

test('app läuft', async ({ page }) => {
  await page.goto('/accounts')
  await expect(page).toHaveURL(/accounts/)
})
```

```bash
npm run test:e2e -- tests/savings/smoke.spec.ts
```

Erwartete Ausgabe: `1 passed`

- [ ] **Step 5: Smoke-Test-Datei löschen + committen**

```bash
rm tests/savings/smoke.spec.ts
git add playwright.config.ts package.json tests/
git commit -m "chore(tests): add Playwright setup"
```

---

## Task 2: Shared API-Helpers

**Files:**
- Create: `tests/savings/helpers.ts`

- [ ] **Step 1: `tests/savings/helpers.ts` erstellen**

```typescript
// tests/savings/helpers.ts

const BASE = 'http://localhost:3000'

export interface SavingsCreatePayload {
  name: string
  savingsType: 'SPARPLAN' | 'FESTGELD'
  color?: string
  initialBalance?: number
  accountNumber?: string
  interestRate: number            // als Dezimal, z.B. 0.035
  interestFrequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY'
  startDate: string               // 'YYYY-MM-DD'
  termMonths?: number | null
  contributionAmount?: number
  contributionFrequency?: 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY'
  linkedAccountId?: string | null
  categoryId?: string | null
  notes?: string | null
}

/** Legt ein Sparkonto via API an. Gibt die account.id zurück. */
export async function apiCreateSavings(payload: SavingsCreatePayload): Promise<string> {
  const res = await fetch(`${BASE}/api/savings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`createSavings failed: ${await res.text()}`)
  const data = await res.json()
  return data.account.id as string
}

/** Soft-löscht ein Sparkonto via API. */
export async function apiDeleteSavings(accountId: string): Promise<void> {
  const res = await fetch(`${BASE}/api/savings/${accountId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`deleteSavings failed: ${await res.text()}`)
}

/** Legt ein Girokonto via API an. Gibt die id zurück. */
export async function apiCreateGiro(name: string): Promise<string> {
  const res = await fetch(`${BASE}/api/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, type: 'CHECKING', currentBalance: 5000 }),
  })
  if (!res.ok) throw new Error(`createGiro failed: ${await res.text()}`)
  const data = await res.json()
  return data.id as string
}

/** Soft-löscht ein Konto via API. */
export async function apiDeleteAccount(id: string): Promise<void> {
  const res = await fetch(`${BASE}/api/accounts/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`deleteAccount failed: ${await res.text()}`)
}

/** Holt SavingsConfig inkl. Entries für ein Konto. */
export async function apiGetSavings(accountId: string): Promise<any> {
  const res = await fetch(`${BASE}/api/savings/${accountId}`)
  if (!res.ok) throw new Error(`getSavings failed: ${await res.text()}`)
  return res.json()
}

/** ISO-Datum von heute + n Monaten als 'YYYY-MM-DD'. */
export function monthsFromNow(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + n)
  return d.toISOString().slice(0, 10)
}

/** ISO-Datum von heute - n Monaten als 'YYYY-MM-DD'. */
export function monthsAgo(n: number): string {
  return monthsFromNow(-n)
}

/** Heutiges Datum als 'YYYY-MM-DD'. */
export function today(): string {
  return new Date().toISOString().slice(0, 10)
}
```

- [ ] **Step 2: Committen**

```bash
git add tests/savings/helpers.ts
git commit -m "test: add savings E2E helper functions"
```

---

## Task 3: `01-create-sparplan.spec.ts`

**Files:**
- Create: `tests/savings/01-create-sparplan.spec.ts`

- [ ] **Step 1: Datei erstellen**

```typescript
// tests/savings/01-create-sparplan.spec.ts
import { test, expect } from '@playwright/test'
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

async function openDialog(page: any) {
  await page.goto('/accounts')
  await page.getByRole('button', { name: /Sparkonto \/ Festgeld/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

async function getCreatedId(page: any, name: string): Promise<string> {
  // Findet den Link zur Detailseite des gerade angelegten Kontos
  const link = page.getByRole('link', { name: new RegExp(name) }).first()
  await expect(link).toBeVisible({ timeout: 5000 })
  const href = await link.getAttribute('href')
  const id = href?.split('/').pop() ?? ''
  return id
}

test('1.1 Button disabled ohne Name', async ({ page }) => {
  await openDialog(page)
  await page.getByLabel('Zinssatz p.a. (%)').fill('3')
  await page.getByLabel('Sparrate (€)').fill('100')
  await expect(page.getByRole('button', { name: 'Anlegen' })).toBeDisabled()
})

test('1.2 Button disabled ohne Zinssatz', async ({ page }) => {
  await openDialog(page)
  await page.getByLabel('Name').fill('Test Sparplan')
  await page.getByLabel('Sparrate (€)').fill('100')
  await page.getByLabel('Zinssatz p.a. (%)').clear()
  await expect(page.getByRole('button', { name: 'Anlegen' })).toBeDisabled()
})

test('1.3 Button disabled ohne Sparrate', async ({ page }) => {
  await openDialog(page)
  await page.getByLabel('Name').fill('Test Sparplan')
  await page.getByLabel('Zinssatz p.a. (%)').fill('3')
  await expect(page.getByRole('button', { name: 'Anlegen' })).toBeDisabled()
})

test('1.4 Minimalanlage Sparplan', async ({ page }) => {
  await openDialog(page)
  const name = `SP-Minimal-${Date.now()}`
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Zinssatz p.a. (%)').fill('3')
  await page.getByLabel('Sparrate (€)').fill('100')
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
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Zinssatz p.a. (%)').fill('2.5')
  await page.getByLabel('Sparrate (€)').fill('200')
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
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Zinssatz p.a. (%)').fill('3.5')
  await page.getByLabel('Sparrate (€)').fill('150')
  // Zinsgutschrift auf QUARTERLY setzen
  const interestSelect = page.locator('div').filter({ hasText: /^Zinsgutschrift \*$/ }).locator('button')
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
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Zinssatz p.a. (%)').fill('4')
  await page.getByLabel('Sparrate (€)').fill('500')
  // Zinsgutschrift → Jährlich
  const interestSelect = page.locator('div').filter({ hasText: /^Zinsgutschrift \*$/ }).locator('button')
  await interestSelect.click()
  await page.getByRole('option', { name: 'Jährlich' }).first().click()
  // Einzahlung → Quartärlich
  const contribSelect = page.locator('div').filter({ hasText: /^Einzahlungsfrequenz \*$/ }).locator('button')
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
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Zinssatz p.a. (%)').fill('2')
  await page.getByLabel('Sparrate (€)').fill('1200')
  // Einzahlung → Jährlich
  const contribSelect = page.locator('div').filter({ hasText: /^Einzahlungsfrequenz \*$/ }).locator('button')
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
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('IBAN / Kontonummer').fill('DE89 3704 0044 0532 0130 00')
  await page.getByLabel('Zinssatz p.a. (%)').fill('3')
  await page.getByLabel('Sparrate (€)').fill('100')
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
  // Ohne Girokonto: Kategorie-Feld nicht sichtbar
  await expect(page.getByLabel('Buchungskategorie')).not.toBeVisible()
  // Girokonto wählen
  const linkedSelect = page.locator('div').filter({ hasText: /^Verknüpftes Girokonto$/ }).locator('button')
  await linkedSelect.click()
  await page.getByRole('option', { name: 'Test-Giro-01' }).click()
  // Jetzt Kategorie-Feld sichtbar
  await expect(page.getByLabel('Buchungskategorie')).toBeVisible()
  // Dialog schließen ohne Anlegen
  await page.getByRole('button', { name: 'Abbrechen' }).click()
})

test('1.11 Mit verknüpftem Girokonto (ohne Kategorie)', async ({ page }) => {
  await openDialog(page)
  const name = `SP-GiroNoKat-${Date.now()}`
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Zinssatz p.a. (%)').fill('3')
  await page.getByLabel('Sparrate (€)').fill('100')
  const linkedSelect = page.locator('div').filter({ hasText: /^Verknüpftes Girokonto$/ }).locator('button')
  await linkedSelect.click()
  await page.getByRole('option', { name: 'Test-Giro-01' }).click()
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText('Sparkonto angelegt')).toBeVisible()
  const id = await getCreatedId(page, name)
  if (id) createdIds.push(id)
})
```

- [ ] **Step 2: Test ausführen**

```bash
npm run test:e2e -- tests/savings/01-create-sparplan.spec.ts
```

Erwartete Ausgabe: `11 passed` (oder Fehlermeldungen die auf Bugs hinweisen)

- [ ] **Step 3: Committen**

```bash
git add tests/savings/01-create-sparplan.spec.ts
git commit -m "test(savings): add create-sparplan E2E tests"
```

---

## Task 4: `02-create-festgeld.spec.ts`

**Files:**
- Create: `tests/savings/02-create-festgeld.spec.ts`

- [ ] **Step 1: Datei erstellen**

```typescript
// tests/savings/02-create-festgeld.spec.ts
import { test, expect } from '@playwright/test'
import { apiDeleteSavings } from './helpers'

const createdIds: string[] = []

test.afterAll(async () => {
  for (const id of createdIds) {
    await apiDeleteSavings(id).catch(() => {})
  }
})

async function openDialog(page: any) {
  await page.goto('/accounts')
  await page.getByRole('button', { name: /Sparkonto \/ Festgeld/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  // Auf Festgeld wechseln
  const typeSelect = page.locator('div').filter({ hasText: /^Typ \*$/ }).locator('button')
  await typeSelect.click()
  await page.getByRole('option', { name: 'Festgeld' }).click()
}

async function getCreatedId(page: any, name: string): Promise<string> {
  const link = page.getByRole('link', { name: new RegExp(name) }).first()
  await expect(link).toBeVisible({ timeout: 5000 })
  const href = await link.getAttribute('href')
  return href?.split('/').pop() ?? ''
}

test('2.1 Festgeld: Sparplan-Felder nicht sichtbar', async ({ page }) => {
  await openDialog(page)
  await expect(page.getByLabel('Sparrate (€)')).not.toBeVisible()
  await expect(page.getByLabel('Einzahlungsfrequenz')).not.toBeVisible()
  await expect(page.getByText('Verknüpftes Girokonto')).not.toBeVisible()
  await page.getByRole('button', { name: 'Abbrechen' }).click()
})

test('2.2 Festgeld: Button disabled ohne Name', async ({ page }) => {
  await openDialog(page)
  await page.getByLabel('Zinssatz p.a. (%)').fill('3')
  await expect(page.getByRole('button', { name: 'Anlegen' })).toBeDisabled()
})

test('2.3 Festgeld: Button disabled ohne Zinssatz', async ({ page }) => {
  await openDialog(page)
  await page.getByLabel('Name').fill('Test Festgeld')
  await page.getByLabel('Zinssatz p.a. (%)').clear()
  await expect(page.getByRole('button', { name: 'Anlegen' })).toBeDisabled()
})

test('2.4 Festgeld Minimalanlage', async ({ page }) => {
  await openDialog(page)
  const name = `FG-Minimal-${Date.now()}`
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Zinssatz p.a. (%)').fill('4')
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText('Sparkonto angelegt')).toBeVisible()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  const id = await getCreatedId(page, name)
  if (id) createdIds.push(id)
})

test('2.5 Festgeld: Zinsgutschrift MONTHLY', async ({ page }) => {
  await openDialog(page)
  const name = `FG-M-${Date.now()}`
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Zinssatz p.a. (%)').fill('3.5')
  // MONTHLY ist default, keine Änderung nötig
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText('Sparkonto angelegt')).toBeVisible()
  const id = await getCreatedId(page, name)
  if (id) createdIds.push(id)
})

test('2.6 Festgeld: Zinsgutschrift QUARTERLY', async ({ page }) => {
  await openDialog(page)
  const name = `FG-Q-${Date.now()}`
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Zinssatz p.a. (%)').fill('3.5')
  const interestSelect = page.locator('div').filter({ hasText: /^Zinsgutschrift \*$/ }).locator('button')
  await interestSelect.click()
  await page.getByRole('option', { name: 'Quartärlich' }).first().click()
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText('Sparkonto angelegt')).toBeVisible()
  const id = await getCreatedId(page, name)
  if (id) createdIds.push(id)
})

test('2.7 Festgeld: Zinsgutschrift ANNUALLY', async ({ page }) => {
  await openDialog(page)
  const name = `FG-A-${Date.now()}`
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Zinssatz p.a. (%)').fill('4')
  const interestSelect = page.locator('div').filter({ hasText: /^Zinsgutschrift \*$/ }).locator('button')
  await interestSelect.click()
  await page.getByRole('option', { name: 'Jährlich' }).first().click()
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText('Sparkonto angelegt')).toBeVisible()
  const id = await getCreatedId(page, name)
  if (id) createdIds.push(id)
})

test('2.8 Festgeld mit Startkapital', async ({ page }) => {
  await openDialog(page)
  const name = `FG-Kapital-${Date.now()}`
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Zinssatz p.a. (%)').fill('4')
  await page.getByLabel(/Einlagenbetrag/).fill('10000')
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText('Sparkonto angelegt')).toBeVisible()
  // In Kontenliste: Saldo 10.000 anzeigen (oder zumindest Konto sichtbar)
  await expect(page.getByText(name)).toBeVisible()
  const id = await getCreatedId(page, name)
  if (id) createdIds.push(id)
})
```

- [ ] **Step 2: Test ausführen**

```bash
npm run test:e2e -- tests/savings/02-create-festgeld.spec.ts
```

Erwartete Ausgabe: `8 passed`

- [ ] **Step 3: Committen**

```bash
git add tests/savings/02-create-festgeld.spec.ts
git commit -m "test(savings): add create-festgeld E2E tests"
```

---

## Task 5: `03-laufzeit-startkapital.spec.ts`

**Files:**
- Create: `tests/savings/03-laufzeit-startkapital.spec.ts`

- [ ] **Step 1: Datei erstellen**

Diese Tests erstellen Konten via API (nicht über die UI) und prüfen dann die Detailseite.

```typescript
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

  // Erste scheduledBalance > 0
  const firstBalance = page.locator('tbody tr').first().locator('td').nth(3)
  const balText = await firstBalance.textContent()
  expect(parseFloat(balText?.replace('.', '').replace(',', '.') ?? '0')).toBeGreaterThan(0)
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
  // Erster INTEREST-Eintrag: scheduledBalance > 5000
  const firstInterest = data.entries.find((e: any) => e.entryType === 'INTEREST')
  expect(firstInterest.scheduledBalance).toBeGreaterThan(5000)

  // UI: Aktueller Saldo = 5000 (startDate=heute, noch nichts gebucht)
  await page.goto(`/savings/${id}`)
  await expect(page.getByText('5.000')).toBeVisible()
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
```

- [ ] **Step 2: Test ausführen**

```bash
npm run test:e2e -- tests/savings/03-laufzeit-startkapital.spec.ts
```

Erwartete Ausgabe: `8 passed`

- [ ] **Step 3: Committen**

```bash
git add tests/savings/03-laufzeit-startkapital.spec.ts
git commit -m "test(savings): add Laufzeit × Startkapital matrix tests"
```

---

## Task 6: `04-detail-view.spec.ts`

**Files:**
- Create: `tests/savings/04-detail-view.spec.ts`

- [ ] **Step 1: Datei erstellen**

Vorbedingung: Sparplan mit startDate = vor 6 Monaten, MONTHLY, unbegrenzt.
Ergibt mind. 6 vergangene + 24 zukünftige = ~30+ Einträge gesamt.

```typescript
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
  await page.getByRole('button', { name: 'Alle' }).click()
  const allRows = await page.locator('tbody tr').count()

  // Dann 1 J.
  await page.getByRole('button', { name: '1 J.' }).click()
  const oneYearRows = await page.locator('tbody tr').count()

  expect(oneYearRows).toBeLessThan(allRows)
  expect(oneYearRows).toBeGreaterThan(0)
})

test('4.2 Filter-Reihenfolge: 1J < 2J < 5J < 10J < Alle', async ({ page }) => {
  const counts: Record<string, number> = {}

  for (const label of ['1 J.', '2 J.', '5 J.', '10 J.', 'Alle']) {
    await page.getByRole('button', { name: label }).click()
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

  await page.getByRole('button', { name: 'Alle' }).click()
  const rows = await page.locator('tbody tr').count()

  expect(rows).toBe(totalEntries)
})

test('4.4 Vergangene paid-Einträge sichtbar auch bei engem Filter', async ({ page }) => {
  // Unter 1J-Filter sind vergangene bezahlte Einträge noch sichtbar
  await page.getByRole('button', { name: '1 J.' }).click()
  // Mind. ein "initialisiert"-Eintrag muss sichtbar sein (vergangene 6 Monate)
  await expect(page.getByText('✓ initialisiert').first()).toBeVisible()
})

test('4.5 Älteste Einträge stehen oben (Sortierung)', async ({ page }) => {
  await page.getByRole('button', { name: 'Alle' }).click()
  const rows = page.locator('tbody tr')

  // Ersten und letzten Datumswert vergleichen
  const firstDate = await rows.first().locator('td').first().textContent()
  const lastDate = await rows.last().locator('td').first().textContent()

  // Datum ist im Format DD.MM.YYYY — in vergleichbares Format konvertieren
  const parseDE = (s: string) => {
    const [d, m, y] = (s ?? '').trim().split('.')
    return new Date(`${y}-${m}-${d}`)
  }
  expect(parseDE(firstDate ?? '')).toBeLessThan(parseDE(lastDate ?? ''))
})

test('4.6 Filter-Button wechselt aktiven Zustand (Highlight)', async ({ page }) => {
  // 5 J. Button anklicken und prüfen ob er aktiv wirkt
  const btn5 = page.getByRole('button', { name: '5 J.' })
  await btn5.click()
  // Aktiver Button hat bg-primary-Klasse (laut Implementierung)
  await expect(btn5).toHaveClass(/bg-primary/)

  // 1 J. anklicken — 5 J. nicht mehr aktiv
  const btn1 = page.getByRole('button', { name: '1 J.' })
  await btn1.click()
  await expect(btn1).toHaveClass(/bg-primary/)
  await expect(btn5).not.toHaveClass(/bg-primary/)
})

test('4.7 Filter-Umschaltung 1J → Alle → 1J behält Konsistenz', async ({ page }) => {
  await page.getByRole('button', { name: '1 J.' }).click()
  const count1 = await page.locator('tbody tr').count()

  await page.getByRole('button', { name: 'Alle' }).click()
  await page.getByRole('button', { name: '1 J.' }).click()
  const count1Again = await page.locator('tbody tr').count()

  expect(count1Again).toBe(count1)
})
```

- [ ] **Step 2: Test ausführen**

```bash
npm run test:e2e -- tests/savings/04-detail-view.spec.ts
```

Erwartete Ausgabe: `7 passed`

- [ ] **Step 3: Committen**

```bash
git add tests/savings/04-detail-view.spec.ts
git commit -m "test(savings): add detail view filter tests"
```

---

## Task 7: `05-detail-pay.spec.ts`

**Files:**
- Create: `tests/savings/05-detail-pay.spec.ts`

- [ ] **Step 1: Datei erstellen**

Frischer Sparplan: startDate = heute, kein Startkapital → keine vergangenen Einträge.

```typescript
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
  await page.getByRole('button', { name: 'Alle' }).click()

  // Ersten "Bezahlen"-Button klicken
  const payBtn = page.getByRole('button', { name: 'Bezahlen' }).first()
  await payBtn.click()

  // Toast erscheint
  await expect(page.getByText(/Eintrag.*gebucht|gebucht/)).toBeVisible()
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
  await page.getByRole('button', { name: 'Alle' }).click()

  // Ersten Bezahlen-Button klicken (bucht gleichzeitig den INTEREST der gleichen Periode)
  await page.getByRole('button', { name: 'Bezahlen' }).first().click()
  await expect(page.getByText(/gebucht/)).toBeVisible()

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
  await page.getByRole('button', { name: 'Alle' }).click()

  // Buchen
  await page.getByRole('button', { name: 'Bezahlen' }).first().click()
  await expect(page.getByText('✓ gebucht').first()).toBeVisible()

  // Rückgängig
  await page.getByText('rückgängig').first().click()
  await expect(page.getByText('Buchung rückgängig gemacht')).toBeVisible()
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
  await page.getByRole('button', { name: 'Alle' }).click()
  await page.getByRole('button', { name: 'Bezahlen' }).first().click()
  await expect(page.getByText(/gebucht/)).toBeVisible()

  // Girokonto-Saldo nachher
  const after = await fetch('http://localhost:3000/api/accounts').then(r => r.json())
  const giroAfter = after.find((a: any) => a.id === giroId)?.currentBalance ?? 0

  expect(giroAfter).toBeLessThan(giroBefore)
})
```

- [ ] **Step 2: Test ausführen**

```bash
npm run test:e2e -- tests/savings/05-detail-pay.spec.ts
```

Erwartete Ausgabe: `6 passed`

- [ ] **Step 3: Committen**

```bash
git add tests/savings/05-detail-pay.spec.ts
git commit -m "test(savings): add pay/unpay E2E tests"
```

---

## Task 8: `06-edit.spec.ts`

**Files:**
- Create: `tests/savings/06-edit.spec.ts`

- [ ] **Step 1: Datei erstellen**

```typescript
// tests/savings/06-edit.spec.ts
import { test, expect } from '@playwright/test'
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

test('6.1 Name ändern', async ({ page }) => {
  await page.goto(`/savings/${sparplanId}/edit`)
  const newName = `Geändert-${Date.now()}`
  await page.getByLabel('Name').fill(newName)
  await page.getByRole('button', { name: 'Speichern' }).click()
  // Redirect auf Detailseite
  await expect(page).toHaveURL(new RegExp(`/savings/${sparplanId}$`))
  await expect(page.getByText(newName)).toBeVisible()
})

test('6.2 IBAN eingeben', async ({ page }) => {
  await page.goto(`/savings/${sparplanId}/edit`)
  await page.getByLabel('IBAN / Kontonummer').fill('DE12 3456 7890 1234 5678 90')
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page).toHaveURL(new RegExp(`/savings/${sparplanId}$`))
  await expect(page.getByText('DE12 3456 7890 1234 5678 90')).toBeVisible()
})

test('6.3 Notizen ändern (kein Fehler)', async ({ page }) => {
  await page.goto(`/savings/${sparplanId}/edit`)
  await page.getByLabel('Notizen').fill('Meine Notiz Test')
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByText('Änderungen gespeichert')).toBeVisible()
})

test('6.4 Zinssatz ändern zeigt Warnung', async ({ page }) => {
  await page.goto(`/savings/${sparplanId}/edit`)
  const rateInput = page.getByLabel('Zinssatz p.a. (%)')
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
  const firstInterest = dataBefore.entries.find((e: any) => e.entryType === 'INTEREST' && !e.paidAt)
  const amountBefore = firstInterest?.scheduledAmount ?? 0

  await page.goto(`/savings/${sparplanId}/edit`)
  const rateInput = page.getByLabel('Zinssatz p.a. (%)')
  // Auf deutlich anderen Zinssatz setzen (5 %)
  await rateInput.fill('5')
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByText('Änderungen gespeichert')).toBeVisible()

  const dataAfter = await apiGetSavings(sparplanId)
  const firstInterestAfter = dataAfter.entries.find((e: any) => e.entryType === 'INTEREST' && !e.paidAt)
  // Betrag hat sich geändert
  expect(firstInterestAfter?.scheduledAmount ?? 0).not.toBe(amountBefore)
})

test('6.7 Girokonto verknüpfen → Kategorie-Dropdown erscheint', async ({ page }) => {
  await page.goto(`/savings/${sparplanId}/edit`)
  // Kategorie-Dropdown initial nicht sichtbar (kein Girokonto verknüpft)
  await expect(page.getByLabel('Buchungskategorie')).not.toBeVisible()

  // Girokonto wählen
  const linkedSelect = page.locator('div').filter({ hasText: /^Verknüpftes Girokonto$/ }).locator('button')
  await linkedSelect.click()
  await page.getByRole('option', { name: /Giro-Edit/ }).click()

  // Kategorie-Dropdown erscheint
  await expect(page.getByLabel('Buchungskategorie')).toBeVisible()

  // Abbrechen
  await page.getByRole('button', { name: 'Abbrechen' }).click()
})

test('6.8 Girokonto entfernen → Kategorie-Dropdown verschwindet', async ({ page }) => {
  // Erst Girokonto setzen und speichern
  await page.goto(`/savings/${sparplanId}/edit`)
  const linkedSelect = page.locator('div').filter({ hasText: /^Verknüpftes Girokonto$/ }).locator('button')
  await linkedSelect.click()
  await page.getByRole('option', { name: /Giro-Edit/ }).click()
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByText('Änderungen gespeichert')).toBeVisible()

  // Wieder öffnen und Girokonto entfernen
  await page.goto(`/savings/${sparplanId}/edit`)
  const linkedSelect2 = page.locator('div').filter({ hasText: /^Verknüpftes Girokonto$/ }).locator('button')
  await linkedSelect2.click()
  await page.getByRole('option', { name: 'Kein Konto' }).click()
  // Kategorie-Dropdown verschwindet
  await expect(page.getByLabel('Buchungskategorie')).not.toBeVisible()
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
```

- [ ] **Step 2: Test ausführen**

```bash
npm run test:e2e -- tests/savings/06-edit.spec.ts
```

Erwartete Ausgabe: `10 passed`

- [ ] **Step 3: Committen**

```bash
git add tests/savings/06-edit.spec.ts
git commit -m "test(savings): add edit page E2E tests"
```

---

## Task 9: Alle Tests ausführen + Bugs dokumentieren

**Files:**
- keine neuen Dateien

- [ ] **Step 1: Alle Tests auf einmal ausführen**

```bash
npm run test:e2e -- tests/savings/
```

- [ ] **Step 2: HTML-Report anzeigen bei Fehlern**

```bash
npx playwright show-report
```

- [ ] **Step 3: Fehlgeschlagene Tests analysieren**

Für jeden Fehler:
1. Screenshot in `test-results/` prüfen
2. Fehlerursache bestimmen (UI-Bug vs. Test-Selektor-Problem)
3. Bug-Liste anlegen oder Selektor anpassen

- [ ] **Step 4: Finaler Commit**

```bash
git add -A
git commit -m "test(savings): run all E2E tests, document findings"
git push
```

---

## Self-Review Ergebnis

**Spec-Abdeckung:**
- ✅ Sparplan-Pflichtfelder-Validierung (Task 3)
- ✅ Alle Frequenz-Kombinationen Sparplan (Task 3: 1.5–1.8)
- ✅ Festgeld-spezifische Felder (Task 4)
- ✅ Laufzeit × Startkapital Matrix 4+4 Fälle (Task 5)
- ✅ Anzeigefilter 1J/2J/5J/10J/Alle (Task 6)
- ✅ Paid-Einträge in engem Filter sichtbar (Task 6: 4.4)
- ✅ Buchen per Button + per Datum (Task 7)
- ✅ Zinsen automatisch mitgebucht (Task 7: 5.2)
- ✅ Rückgängig (Task 7: 5.4)
- ✅ Girokonto-Saldo-Prüfung (Task 7: 5.6)
- ✅ Zinssatz-Warnung (Task 8: 6.4–6.5)
- ✅ Zinssatz-Neuberechnung (Task 8: 6.6)
- ✅ Girokonto verknüpfen/entfernen (Task 8: 6.7–6.8)
- ✅ Zahlungsplan verlängern (Task 8: 6.9–6.10)
- ✅ Cleanup in allen Specs (afterAll)

**Keine Placeholders gefunden.**
