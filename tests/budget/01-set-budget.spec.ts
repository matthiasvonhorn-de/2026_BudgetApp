// tests/budget/01-set-budget.spec.ts
import { test, expect } from '@playwright/test'
import {
  apiCreateAccount,
  apiDeleteAccount,
  apiCreateCategoryGroup,
  apiDeleteCategoryGroup,
  apiCreateCategory,
  apiDeleteCategory,
} from './helpers'

let accountId: string
let groupId: string
let categoryId: string
let categoryName: string

test.beforeAll(async () => {
  accountId = await apiCreateAccount(`E2E-Budget-Konto-${Date.now()}`)
  groupId = await apiCreateCategoryGroup(`E2E-Budget-Gruppe-${Date.now()}`, accountId)
  categoryName = `E2E-Budget-Kat-${Date.now()}`
  categoryId = await apiCreateCategory(categoryName, groupId)
})

test.afterAll(async () => {
  if (categoryId) await apiDeleteCategory(categoryId).catch(() => {})
  if (groupId) await apiDeleteCategoryGroup(groupId).catch(() => {})
  if (accountId) await apiDeleteAccount(accountId).catch(() => {})
})

test('1.1 Set a budget value by clicking the budgeted cell', async ({ page }) => {
  await page.goto('/budget')
  await page.waitForLoadState('networkidle')

  // Find the category row
  const categoryRow = page.locator('tr').filter({ hasText: categoryName })
  await expect(categoryRow).toBeVisible({ timeout: 5000 })

  // Click the budgeted amount button (the clickable cell in the "Budgetiert" column)
  const budgetButton = categoryRow.locator('button').first()
  await budgetButton.click()

  // An input should appear
  const budgetInput = categoryRow.locator('input[type="number"]')
  await expect(budgetInput).toBeVisible()

  // Clear and enter a new value
  await budgetInput.fill('250.00')

  // Press Enter to save
  await budgetInput.press('Enter')

  // Wait for the value to be saved and the input to disappear
  await expect(budgetInput).not.toBeVisible({ timeout: 3000 })

  // Reload to verify persistence
  await page.reload()
  await page.waitForLoadState('networkidle')

  // The category row should show the budgeted value (formatted with currency)
  const updatedRow = page.locator('tr').filter({ hasText: categoryName })
  await expect(updatedRow).toBeVisible({ timeout: 5000 })

  // The budgeted button should contain "250" somewhere (formatted as currency)
  const updatedButton = updatedRow.locator('button').first()
  await expect(updatedButton).toContainText('250')
})

test('1.2 Edit budget value by clicking again', async ({ page }) => {
  await page.goto('/budget')
  await page.waitForLoadState('networkidle')

  const categoryRow = page.locator('tr').filter({ hasText: categoryName })
  await expect(categoryRow).toBeVisible({ timeout: 5000 })

  // Click the budgeted amount button
  const budgetButton = categoryRow.locator('button').first()
  await budgetButton.click()

  const budgetInput = categoryRow.locator('input[type="number"]')
  await expect(budgetInput).toBeVisible()

  // Change value to 500
  await budgetInput.fill('500.00')
  await budgetInput.press('Enter')

  await expect(budgetInput).not.toBeVisible({ timeout: 3000 })

  // Verify the updated value
  await page.reload()
  await page.waitForLoadState('networkidle')

  const updatedRow = page.locator('tr').filter({ hasText: categoryName })
  const updatedButton = updatedRow.locator('button').first()
  await expect(updatedButton).toContainText('500')
})

test('1.3 Cancel edit with Escape', async ({ page }) => {
  await page.goto('/budget')
  await page.waitForLoadState('networkidle')

  const categoryRow = page.locator('tr').filter({ hasText: categoryName })
  await expect(categoryRow).toBeVisible({ timeout: 5000 })

  // Click the budgeted amount button
  const budgetButton = categoryRow.locator('button').first()
  await budgetButton.click()

  const budgetInput = categoryRow.locator('input[type="number"]')
  await expect(budgetInput).toBeVisible()

  // Type a new value but press Escape
  await budgetInput.fill('999.99')
  await budgetInput.press('Escape')

  // Input should disappear
  await expect(budgetInput).not.toBeVisible({ timeout: 3000 })

  // Value should still be the old one (500 from previous test)
  const restoredButton = categoryRow.locator('button').first()
  await expect(restoredButton).toContainText('500')
})
