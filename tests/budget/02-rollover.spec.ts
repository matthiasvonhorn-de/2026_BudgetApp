// tests/budget/02-rollover.spec.ts
import { test, expect } from '@playwright/test'
import {
  apiCreateAccount,
  apiDeleteAccount,
  apiCreateCategoryGroup,
  apiDeleteCategoryGroup,
  apiCreateCategory,
  apiDeleteCategory,
  apiSetBudget,
} from './helpers'

let accountId: string
let groupId: string
let categoryId: string
let categoryName: string

test.beforeAll(async () => {
  accountId = await apiCreateAccount(`E2E-Rollover-Konto-${Date.now()}`)
  groupId = await apiCreateCategoryGroup(`E2E-Rollover-Gruppe-${Date.now()}`, accountId)
  categoryName = `E2E-Rollover-Kat-${Date.now()}`
  categoryId = await apiCreateCategory(categoryName, groupId)

  // Set a budget of -200 for the current month (negative = expense budget)
  const now = new Date()
  await apiSetBudget(now.getFullYear(), now.getMonth() + 1, categoryId, -200)
})

test.afterAll(async () => {
  if (categoryId) await apiDeleteCategory(categoryId).catch(() => {})
  if (groupId) await apiDeleteCategoryGroup(groupId).catch(() => {})
  if (accountId) await apiDeleteAccount(accountId).catch(() => {})
})

test('2.1 Rollover button transfers budgets to next month', async ({ page }) => {
  await page.goto('/budget')
  await page.waitForLoadState('networkidle')

  // Verify category is visible with budget value
  const categoryRow = page.locator('tr').filter({ hasText: categoryName })
  await expect(categoryRow).toBeVisible({ timeout: 5000 })

  // Click "Übertrag auf nächsten Monat"
  const rolloverButton = page.getByRole('button', { name: /Übertrag auf nächsten Monat/ })
  await expect(rolloverButton).toBeVisible()
  await rolloverButton.click()

  // Toast with success message
  await expect(page.getByText(/Übertrag für .+ Kategorien/)).toBeVisible({ timeout: 5000 })

  // Navigate to next month using the right chevron
  const nextButton = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-right') })
  await nextButton.click()

  // Wait for the next month to load
  await page.waitForLoadState('networkidle')

  // The category should be visible in the next month too, with rolled-over values
  const nextMonthRow = page.locator('tr').filter({ hasText: categoryName })
  await expect(nextMonthRow).toBeVisible({ timeout: 5000 })

  // The row should contain "Übertrag" text (indicating rollover happened)
  // OR the budgeted value should match what was rolled over
  // The rolled-over budget amount (-200) should appear
  await expect(nextMonthRow).toContainText('200')
})
