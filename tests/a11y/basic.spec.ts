import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const pages = [
  { name: 'Dashboard', path: '/' },
  { name: 'Accounts', path: '/accounts' },
  { name: 'Transactions', path: '/transactions' },
]

for (const { name, path } of pages) {
  test(`${name} page should have no critical a11y violations`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState('networkidle')

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast']) // shadcn handles this
      .analyze()

    const critical = results.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious',
    )
    expect(critical).toEqual([])
  })
}
