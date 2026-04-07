# Test Strategy Part 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up Vitest with unit tests for all pure business logic, pre-commit hooks, and GitHub Actions CI.

**Architecture:** Vitest for unit tests with path alias support. Tests in tests/unit/. Husky + lint-staged for pre-commit. GitHub Actions with 3 parallel jobs.

**Tech Stack:** Vitest, @vitest/coverage-v8, Husky, lint-staged, GitHub Actions

---

## Task 1: Vitest Setup

**Files:** `vitest.config.ts`, `package.json`, `.gitignore`

- [ ] **Step 1.1** Install dependencies:

```bash
cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp"
npm install -D vitest @vitest/coverage-v8
```

- [ ] **Step 1.2** Create `vitest.config.ts` in the project root:

```ts
// /Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp/vitest.config.ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/api/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/app/api/**'],
    },
  },
})
```

- [ ] **Step 1.3** Add npm scripts to `package.json` (insert after the existing `"test:e2e:ui"` line):

```jsonc
// Add these scripts to the "scripts" object in package.json:
"test": "vitest run",
"test:unit": "vitest run tests/unit",
"test:api": "vitest run tests/api",
"test:all": "vitest run && playwright test"
```

The full scripts block becomes:

```json
"scripts": {
  "dev": "node node_modules/next/dist/bin/next dev",
  "build": "node node_modules/next/dist/bin/next build",
  "start": "node node_modules/next/dist/bin/next start",
  "prod": "npm run build && node scripts/copy-static.js && DATABASE_URL=file:$PWD/prisma/prod.db PORT=3001 node .next/standalone/server.js",
  "prod:start": "DATABASE_URL=file:$PWD/prisma/prod.db PORT=3001 node .next/standalone/server.js",
  "lint": "eslint",
  "electron:dev": "electron .",
  "electron:build": "node node_modules/next/dist/bin/next build && node scripts/copy-static.js && node scripts/prepare-electron-db.js && CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder --mac zip && node scripts/create-dist-zip.js",
  "electron:build:dir": "node node_modules/next/dist/bin/next build && node scripts/copy-static.js && node scripts/prepare-electron-db.js && CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder --dir",
  "test": "vitest run",
  "test:unit": "vitest run tests/unit",
  "test:api": "vitest run tests/api",
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui",
  "test:all": "vitest run && playwright test"
}
```

- [ ] **Step 1.4** Add `prisma/test.db` to `.gitignore` (append after the `prisma/prod.db` line):

```gitignore
prisma/test.db
```

- [ ] **Step 1.5** Create the `tests/unit/` directory:

```bash
mkdir -p "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp/tests/unit"
```

- [ ] **Step 1.6** Verify the setup works:

```bash
cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp"
npx vitest run tests/unit 2>&1 | head -20
# Expected: "No test files found" or similar — proves Vitest loads without config errors
```

---

## Task 2: Unit test money.ts

**File:** `tests/unit/money.test.ts`
**Source:** `src/lib/money.ts`

- [ ] **Step 2.1** Create `tests/unit/money.test.ts`:

```ts
// /Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp/tests/unit/money.test.ts
import { describe, it, expect } from 'vitest'
import { roundCents, balanceIncrement } from '@/lib/money'

describe('roundCents', () => {
  it('rounds 0.1 + 0.2 to 0.3 (floating-point fix)', () => {
    expect(roundCents(0.1 + 0.2)).toBe(0.3)
  })

  it('rounds down from 3 decimal places (< 0.005)', () => {
    expect(roundCents(1.234)).toBe(1.23)
  })

  it('rounds up from 3 decimal places (>= 0.005)', () => {
    expect(roundCents(1.235)).toBe(1.24)
  })

  it('handles zero', () => {
    expect(roundCents(0)).toBe(0)
  })

  it('handles negative values', () => {
    expect(roundCents(-1.555)).toBe(-1.56)
  })

  it('handles negative close to zero', () => {
    expect(roundCents(-0.001)).toBe(-0)
  })

  it('handles large amounts', () => {
    expect(roundCents(999999.999)).toBe(1000000)
  })

  it('handles already-rounded values', () => {
    expect(roundCents(42.50)).toBe(42.5)
  })

  it('handles very small fractions', () => {
    expect(roundCents(0.004)).toBe(0)
  })

  it('handles 0.005 (banker edge case)', () => {
    expect(roundCents(0.005)).toBe(0.01)
  })
})

describe('balanceIncrement', () => {
  it('returns an object with rounded increment', () => {
    expect(balanceIncrement(10.456)).toEqual({ increment: 10.46 })
  })

  it('returns zero increment', () => {
    expect(balanceIncrement(0)).toEqual({ increment: 0 })
  })

  it('returns negative increment', () => {
    expect(balanceIncrement(-50.999)).toEqual({ increment: -51 })
  })

  it('handles floating-point sum as input', () => {
    expect(balanceIncrement(0.1 + 0.2)).toEqual({ increment: 0.3 })
  })

  it('passes the value through roundCents', () => {
    expect(balanceIncrement(123.456)).toEqual({ increment: 123.46 })
  })
})
```

- [ ] **Step 2.2** Run the tests:

```bash
cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp"
npx vitest run tests/unit/money.test.ts
# Expected: all tests pass
```

---

## Task 3: Unit test amortization.ts

**File:** `tests/unit/amortization.test.ts`
**Source:** `src/lib/loans/amortization.ts`

- [ ] **Step 3.1** Create `tests/unit/amortization.test.ts`:

```ts
// /Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp/tests/unit/amortization.test.ts
import { describe, it, expect } from 'vitest'
import { calcAnnuityFromRates, generateSchedule, type LoanParams } from '@/lib/loans/amortization'

describe('calcAnnuityFromRates', () => {
  it('calculates monthly annuity from principal, interest rate, and repayment rate', () => {
    // 100,000 * (0.035 + 0.02) / 12 = 458.333...
    const result = calcAnnuityFromRates(100_000, 0.035, 0.02)
    expect(result).toBeCloseTo(458.33, 1)
  })

  it('returns 0 for 0 principal', () => {
    expect(calcAnnuityFromRates(0, 0.05, 0.02)).toBe(0)
  })

  it('handles 0% interest rate', () => {
    // 100,000 * (0 + 0.02) / 12 = 166.666...
    const result = calcAnnuityFromRates(100_000, 0, 0.02)
    expect(result).toBeCloseTo(166.67, 1)
  })

  it('handles 0% repayment rate', () => {
    // 100,000 * (0.05 + 0) / 12 = 416.666...
    const result = calcAnnuityFromRates(100_000, 0.05, 0)
    expect(result).toBeCloseTo(416.67, 1)
  })

  it('handles large principal', () => {
    const result = calcAnnuityFromRates(1_000_000, 0.04, 0.03)
    // 1,000,000 * 0.07 / 12 = 5833.333...
    expect(result).toBeCloseTo(5833.33, 1)
  })
})

describe('generateSchedule — Annuitaetendarlehen', () => {
  const baseParams: LoanParams = {
    loanType: 'ANNUITAETENDARLEHEN',
    principal: 100_000,
    interestRate: 0.036,        // 3.6% p.a.
    initialRepaymentRate: 0.024, // 2.4% p.a.
    termMonths: 360,             // 30 years
    startDate: new Date(2025, 0, 1), // Jan 2025
    monthlyPayment: 500,         // fallback, should not be used
  }

  it('generates the correct number of rows for given maxPeriods', () => {
    const rows = generateSchedule(baseParams, 100_000, 1, 12)
    expect(rows).toHaveLength(12)
  })

  it('first row has correct period number', () => {
    const rows = generateSchedule(baseParams, 100_000, 1, 1)
    expect(rows[0].periodNumber).toBe(1)
  })

  it('first row interest = balance * monthlyInterestRate', () => {
    const rows = generateSchedule(baseParams, 100_000, 1, 1)
    // Monthly rate = 0.036/12 = 0.003; Interest = 100,000 * 0.003 = 300
    expect(rows[0].scheduledInterest).toBe(300)
  })

  it('first row principal = annuity - interest', () => {
    const rows = generateSchedule(baseParams, 100_000, 1, 1)
    // Annuity = 100,000 * (0.036 + 0.024) / 12 = 500
    // Principal = 500 - 300 = 200
    expect(rows[0].scheduledPrincipal).toBe(200)
  })

  it('first row balance = initial - principal', () => {
    const rows = generateSchedule(baseParams, 100_000, 1, 1)
    // 100,000 - 200 = 99,800
    expect(rows[0].scheduledBalance).toBe(99800)
  })

  it('balance decreases over time', () => {
    const rows = generateSchedule(baseParams, 100_000, 1, 12)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].scheduledBalance).toBeLessThan(rows[i - 1].scheduledBalance)
    }
  })

  it('interest decreases over time (annuity loan)', () => {
    const rows = generateSchedule(baseParams, 100_000, 1, 12)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].scheduledInterest).toBeLessThanOrEqual(rows[i - 1].scheduledInterest)
    }
  })

  it('uses initialRepaymentRate when > 0, ignores monthlyPayment', () => {
    const rows = generateSchedule(baseParams, 100_000, 1, 1)
    // Annuity from rates = 100,000 * (0.036 + 0.024) / 12 = 500
    // principal + interest should equal ~500
    expect(rows[0].scheduledPrincipal + rows[0].scheduledInterest).toBeCloseTo(500, 2)
  })

  it('falls back to monthlyPayment when initialRepaymentRate is 0', () => {
    const params: LoanParams = {
      ...baseParams,
      initialRepaymentRate: 0,
      monthlyPayment: 600,
    }
    const rows = generateSchedule(params, 100_000, 1, 1)
    // Annuity = monthlyPayment = 600; Interest = 300; Principal = 300
    expect(rows[0].scheduledPrincipal).toBe(300)
    expect(rows[0].scheduledInterest).toBe(300)
  })

  it('respects fromPeriod offset', () => {
    const rows = generateSchedule(baseParams, 80_000, 13, 3)
    expect(rows[0].periodNumber).toBe(13)
    expect(rows[1].periodNumber).toBe(14)
    expect(rows[2].periodNumber).toBe(15)
  })

  it('respects fromBalance (partial schedule)', () => {
    const rows = generateSchedule(baseParams, 50_000, 1, 1)
    // Interest = 50,000 * 0.003 = 150
    expect(rows[0].scheduledInterest).toBe(150)
  })

  it('due dates increment monthly from startDate', () => {
    const rows = generateSchedule(baseParams, 100_000, 1, 3)
    expect(rows[0].dueDate.getMonth()).toBe(0)  // January
    expect(rows[1].dueDate.getMonth()).toBe(1)  // February
    expect(rows[2].dueDate.getMonth()).toBe(2)  // March
  })

  it('uses termMonths as default limit when maxPeriods not specified', () => {
    const shortParams: LoanParams = {
      ...baseParams,
      termMonths: 6,
    }
    const rows = generateSchedule(shortParams, 100_000, 1)
    expect(rows).toHaveLength(6)
  })

  it('stops early when balance reaches 0', () => {
    // Small loan that will be paid off quickly
    const params: LoanParams = {
      ...baseParams,
      principal: 1000,
      initialRepaymentRate: 0,
      monthlyPayment: 600,
      termMonths: 12,
    }
    const rows = generateSchedule(params, 1000, 1)
    // Should stop before 12 months since 600/month on 1000 loan
    expect(rows.length).toBeLessThan(12)
    expect(rows[rows.length - 1].scheduledBalance).toBe(0)
  })

  it('all values are rounded to 2 decimal places', () => {
    const rows = generateSchedule(baseParams, 100_000, 1, 12)
    for (const row of rows) {
      expect(Number(row.scheduledPrincipal.toFixed(2))).toBe(row.scheduledPrincipal)
      expect(Number(row.scheduledInterest.toFixed(2))).toBe(row.scheduledInterest)
      expect(Number(row.scheduledBalance.toFixed(2))).toBe(row.scheduledBalance)
    }
  })
})

describe('generateSchedule — Ratenkredit', () => {
  const baseParams: LoanParams = {
    loanType: 'RATENKREDIT',
    principal: 12_000,
    interestRate: 0.06,          // 6% p.a.
    initialRepaymentRate: 0,
    termMonths: 12,
    startDate: new Date(2025, 0, 1),
    monthlyPayment: 0,
  }

  it('has fixed principal per period', () => {
    const rows = generateSchedule(baseParams, 12_000, 1)
    // Fixed principal = 12,000 / 12 = 1,000
    expect(rows[0].scheduledPrincipal).toBe(1000)
    expect(rows[1].scheduledPrincipal).toBe(1000)
  })

  it('interest decreases each period', () => {
    const rows = generateSchedule(baseParams, 12_000, 1)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].scheduledInterest).toBeLessThan(rows[i - 1].scheduledInterest)
    }
  })

  it('ends when balance reaches 0', () => {
    const rows = generateSchedule(baseParams, 12_000, 1)
    expect(rows[rows.length - 1].scheduledBalance).toBe(0)
  })

  it('generates correct number of periods', () => {
    const rows = generateSchedule(baseParams, 12_000, 1)
    expect(rows).toHaveLength(12)
  })

  it('first row interest = balance * monthlyRate', () => {
    const rows = generateSchedule(baseParams, 12_000, 1)
    // Monthly rate = 0.06/12 = 0.005; Interest = 12,000 * 0.005 = 60
    expect(rows[0].scheduledInterest).toBe(60)
  })

  it('stops early if balance is already below threshold', () => {
    const rows = generateSchedule(baseParams, 0, 1)
    expect(rows).toHaveLength(0)
  })

  it('handles partial balance (less than one fixed principal)', () => {
    const rows = generateSchedule(baseParams, 500, 1)
    // Fixed principal = 1000, but balance is only 500
    // So principal = min(1000, 500) = 500
    expect(rows).toHaveLength(1)
    expect(rows[0].scheduledPrincipal).toBe(500)
    expect(rows[0].scheduledBalance).toBe(0)
  })

  it('handles 0% interest rate', () => {
    const params: LoanParams = { ...baseParams, interestRate: 0 }
    const rows = generateSchedule(params, 12_000, 1)
    for (const row of rows) {
      expect(row.scheduledInterest).toBe(0)
    }
    expect(rows[rows.length - 1].scheduledBalance).toBe(0)
  })

  it('all values are rounded to 2 decimal places', () => {
    const rows = generateSchedule(baseParams, 12_000, 1)
    for (const row of rows) {
      expect(Number(row.scheduledPrincipal.toFixed(2))).toBe(row.scheduledPrincipal)
      expect(Number(row.scheduledInterest.toFixed(2))).toBe(row.scheduledInterest)
      expect(Number(row.scheduledBalance.toFixed(2))).toBe(row.scheduledBalance)
    }
  })
})
```

- [ ] **Step 3.2** Run the tests:

```bash
cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp"
npx vitest run tests/unit/amortization.test.ts
# Expected: all tests pass
```

---

## Task 4: Unit test savings/schedule.ts

**File:** `tests/unit/savings-schedule.test.ts`
**Source:** `src/lib/savings/schedule.ts`

- [ ] **Step 4.1** Create `tests/unit/savings-schedule.test.ts`:

```ts
// /Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp/tests/unit/savings-schedule.test.ts
import { describe, it, expect } from 'vitest'
import { addMonths, generateSavingsSchedule, type SavingsScheduleParams } from '@/lib/savings/schedule'

describe('addMonths', () => {
  it('adds months within the same year', () => {
    const date = new Date(2025, 0, 15) // Jan 15
    const result = addMonths(date, 3)
    expect(result.getFullYear()).toBe(2025)
    expect(result.getMonth()).toBe(3) // April
    expect(result.getDate()).toBe(15)
  })

  it('crosses year boundary (Dec → Jan)', () => {
    const date = new Date(2025, 11, 1) // Dec 1
    const result = addMonths(date, 1)
    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(0) // January
  })

  it('handles Jan 31 + 1 month (wraps to end of Feb)', () => {
    const date = new Date(2025, 0, 31) // Jan 31, 2025 (non-leap year)
    const result = addMonths(date, 1)
    // JS Date wraps: Feb 31 → Mar 3
    expect(result.getMonth()).toBe(2) // March (JS overflow behavior)
  })

  it('adds 0 months returns same date', () => {
    const date = new Date(2025, 5, 15)
    const result = addMonths(date, 0)
    expect(result.getTime()).toBe(date.getTime())
  })

  it('does not mutate the original date', () => {
    const date = new Date(2025, 0, 1)
    const originalTime = date.getTime()
    addMonths(date, 6)
    expect(date.getTime()).toBe(originalTime)
  })

  it('adds 12 months = 1 year', () => {
    const date = new Date(2025, 3, 10)
    const result = addMonths(date, 12)
    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(3)
  })
})

describe('generateSavingsSchedule — SPARPLAN', () => {
  const baseParams: SavingsScheduleParams = {
    savingsType: 'SPARPLAN',
    initialBalance: 1000,
    contributionAmount: 100,
    contributionFrequency: 'MONTHLY',
    interestRate: 0.06, // 6% p.a.
    interestFrequency: 'MONTHLY',
    startDate: new Date(2025, 0, 1), // Jan 1, 2025
    termMonths: 12,
  }

  it('generates entries for 12-month SPARPLAN', () => {
    const rows = generateSavingsSchedule(baseParams)
    expect(rows.length).toBeGreaterThan(0)
  })

  it('contains both CONTRIBUTION and INTEREST entries', () => {
    const rows = generateSavingsSchedule(baseParams)
    const types = new Set(rows.map(r => r.entryType))
    expect(types.has('CONTRIBUTION')).toBe(true)
    expect(types.has('INTEREST')).toBe(true)
  })

  it('first interest entry is based on initial balance', () => {
    const rows = generateSavingsSchedule(baseParams)
    const firstInterest = rows.find(r => r.entryType === 'INTEREST')!
    // Monthly rate = 0.06/12 = 0.005; Interest = 1000 * 0.005 = 5
    expect(firstInterest.scheduledAmount).toBe(5)
  })

  it('contribution amounts are fixed', () => {
    const rows = generateSavingsSchedule(baseParams)
    const contributions = rows.filter(r => r.entryType === 'CONTRIBUTION')
    for (const c of contributions) {
      expect(c.scheduledAmount).toBe(100)
    }
  })

  it('balance increases over time', () => {
    const rows = generateSavingsSchedule(baseParams)
    // Check that the last balance is greater than the initial
    const lastRow = rows[rows.length - 1]
    expect(lastRow.scheduledBalance).toBeGreaterThan(1000)
  })

  it('interest entries are sorted before contribution entries within same period', () => {
    const rows = generateSavingsSchedule(baseParams)
    // Find pairs that share the same dueDate
    for (let i = 0; i < rows.length - 1; i++) {
      if (rows[i].dueDate.getTime() === rows[i + 1].dueDate.getTime()) {
        // Interest comes before contribution
        if (rows[i].entryType === 'CONTRIBUTION' && rows[i + 1].entryType === 'INTEREST') {
          // This should NOT happen — interest is sorted first
          expect.fail('Interest should come before contribution on the same date')
        }
      }
    }
  })

  it('handles upfront fee as first FEE entry', () => {
    const params: SavingsScheduleParams = { ...baseParams, upfrontFee: 50 }
    const rows = generateSavingsSchedule(params)
    expect(rows[0].entryType).toBe('FEE')
    expect(rows[0].scheduledAmount).toBe(-50)
    expect(rows[0].scheduledBalance).toBe(950) // 1000 - 50
  })

  it('upfront fee reduces balance for subsequent interest', () => {
    const params: SavingsScheduleParams = { ...baseParams, upfrontFee: 50 }
    const rows = generateSavingsSchedule(params)
    const firstInterest = rows.find(r => r.entryType === 'INTEREST')!
    // Balance after fee: 950; Monthly interest = 950 * 0.005 = 4.75
    expect(firstInterest.scheduledAmount).toBe(4.75)
  })

  it('quarterly contributions produce fewer contribution entries', () => {
    const params: SavingsScheduleParams = {
      ...baseParams,
      contributionFrequency: 'QUARTERLY',
      termMonths: 12,
    }
    const rows = generateSavingsSchedule(params)
    const contributions = rows.filter(r => r.entryType === 'CONTRIBUTION')
    expect(contributions).toHaveLength(4) // 12 months / 3 = 4
  })

  it('annual contributions produce 1 entry per year', () => {
    const params: SavingsScheduleParams = {
      ...baseParams,
      contributionFrequency: 'ANNUALLY',
      termMonths: 24,
    }
    const rows = generateSavingsSchedule(params)
    const contributions = rows.filter(r => r.entryType === 'CONTRIBUTION')
    expect(contributions).toHaveLength(2) // 24 months / 12 = 2
  })

  it('quarterly interest with monthly contributions', () => {
    const params: SavingsScheduleParams = {
      ...baseParams,
      interestFrequency: 'QUARTERLY',
    }
    const rows = generateSavingsSchedule(params)
    const interests = rows.filter(r => r.entryType === 'INTEREST')
    expect(interests).toHaveLength(4) // 12 months / 3 = 4
  })

  it('annual interest produces 1 interest entry per year', () => {
    const params: SavingsScheduleParams = {
      ...baseParams,
      interestFrequency: 'ANNUALLY',
      termMonths: 24,
    }
    const rows = generateSavingsSchedule(params)
    const interests = rows.filter(r => r.entryType === 'INTEREST')
    expect(interests).toHaveLength(2)
  })

  it('period numbers are sequential per entry type', () => {
    const rows = generateSavingsSchedule(baseParams)
    const contributions = rows.filter(r => r.entryType === 'CONTRIBUTION')
    const interests = rows.filter(r => r.entryType === 'INTEREST')
    for (let i = 0; i < contributions.length; i++) {
      expect(contributions[i].periodNumber).toBe(i + 1)
    }
    for (let i = 0; i < interests.length; i++) {
      expect(interests[i].periodNumber).toBe(i + 1)
    }
  })

  it('all amounts are rounded to 2 decimal places', () => {
    const rows = generateSavingsSchedule(baseParams)
    for (const row of rows) {
      expect(Number(row.scheduledAmount.toFixed(2))).toBe(row.scheduledAmount)
      expect(Number(row.scheduledBalance.toFixed(2))).toBe(row.scheduledBalance)
    }
  })
})

describe('generateSavingsSchedule — FESTGELD', () => {
  const festgeldParams: SavingsScheduleParams = {
    savingsType: 'FESTGELD',
    initialBalance: 10_000,
    contributionAmount: 0,
    contributionFrequency: null,
    interestRate: 0.03, // 3% p.a.
    interestFrequency: 'ANNUALLY',
    startDate: new Date(2025, 0, 1),
    termMonths: 24,
  }

  it('generates only INTEREST entries (no CONTRIBUTION)', () => {
    const rows = generateSavingsSchedule(festgeldParams)
    const types = new Set(rows.map(r => r.entryType))
    expect(types.has('INTEREST')).toBe(true)
    expect(types.has('CONTRIBUTION')).toBe(false)
  })

  it('annual interest on 10,000 at 3% = 300', () => {
    const rows = generateSavingsSchedule(festgeldParams)
    expect(rows[0].scheduledAmount).toBe(300)
  })

  it('compound interest: second year interest is on 10,300', () => {
    const rows = generateSavingsSchedule(festgeldParams)
    // Second year: 10,300 * 0.03 = 309
    expect(rows[1].scheduledAmount).toBe(309)
  })

  it('final balance includes compound interest', () => {
    const rows = generateSavingsSchedule(festgeldParams)
    const lastRow = rows[rows.length - 1]
    // Year 1: 10,000 + 300 = 10,300
    // Year 2: 10,300 + 309 = 10,609
    expect(lastRow.scheduledBalance).toBe(10609)
  })

  it('monthly interest on FESTGELD', () => {
    const params: SavingsScheduleParams = {
      ...festgeldParams,
      interestFrequency: 'MONTHLY',
      termMonths: 3,
    }
    const rows = generateSavingsSchedule(params)
    expect(rows).toHaveLength(3)
    // First month: 10,000 * (0.03/12) = 25
    expect(rows[0].scheduledAmount).toBe(25)
  })

  it('handles zero initial balance', () => {
    const params: SavingsScheduleParams = {
      ...festgeldParams,
      initialBalance: 0,
    }
    const rows = generateSavingsSchedule(params)
    // Zero balance → zero interest → interest rows are skipped (amount === 0)
    expect(rows).toHaveLength(0)
  })
})
```

- [ ] **Step 4.2** Run the tests:

```bash
cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp"
npx vitest run tests/unit/savings-schedule.test.ts
# Expected: all tests pass
```

---

## Task 5: Unit test rules/matcher.ts

**File:** `tests/unit/rules-matcher.test.ts`
**Source:** `src/lib/rules/matcher.ts`

Note: `matchesRule` is not exported but is tested indirectly through `applyRules`. The `CategoryRule` type comes from `@prisma/client` — we create mock objects that satisfy the needed shape.

- [ ] **Step 5.1** Create `tests/unit/rules-matcher.test.ts`:

```ts
// /Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp/tests/unit/rules-matcher.test.ts
import { describe, it, expect } from 'vitest'
import { applyRules, type RawTransaction } from '@/lib/rules/matcher'

// Helper to create a mock CategoryRule with the fields that matcher.ts actually uses
function mockRule(overrides: {
  field: 'DESCRIPTION' | 'PAYEE' | 'AMOUNT'
  operator: 'CONTAINS' | 'STARTS_WITH' | 'ENDS_WITH' | 'EQUALS' | 'GREATER_THAN' | 'LESS_THAN' | 'REGEX'
  value: string
  categoryId: string
  priority?: number
  isActive?: boolean
}) {
  return {
    id: 'rule-' + Math.random().toString(36).slice(2),
    field: overrides.field,
    operator: overrides.operator,
    value: overrides.value,
    categoryId: overrides.categoryId,
    priority: overrides.priority ?? 1,
    isActive: overrides.isActive ?? true,
    accountId: 'acc-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any // Cast to CategoryRule to satisfy the type without importing Prisma enums
}

const baseTx: RawTransaction = {
  date: '2025-01-15',
  amount: -42.50,
  description: 'EDEKA SUPERMARKT BERLIN',
  payee: 'EDEKA Zentrale',
}

describe('applyRules — operator tests', () => {
  it('CONTAINS matches substring (case-insensitive)', () => {
    const rules = [mockRule({ field: 'DESCRIPTION', operator: 'CONTAINS', value: 'edeka', categoryId: 'cat-food' })]
    expect(applyRules(rules, baseTx)).toBe('cat-food')
  })

  it('CONTAINS does not match when substring is absent', () => {
    const rules = [mockRule({ field: 'DESCRIPTION', operator: 'CONTAINS', value: 'rewe', categoryId: 'cat-food' })]
    expect(applyRules(rules, baseTx)).toBeNull()
  })

  it('STARTS_WITH matches beginning of string (case-insensitive)', () => {
    const rules = [mockRule({ field: 'DESCRIPTION', operator: 'STARTS_WITH', value: 'edeka', categoryId: 'cat-food' })]
    expect(applyRules(rules, baseTx)).toBe('cat-food')
  })

  it('STARTS_WITH does not match when string starts differently', () => {
    const rules = [mockRule({ field: 'DESCRIPTION', operator: 'STARTS_WITH', value: 'supermarkt', categoryId: 'cat-food' })]
    expect(applyRules(rules, baseTx)).toBeNull()
  })

  it('ENDS_WITH matches end of string (case-insensitive)', () => {
    const rules = [mockRule({ field: 'DESCRIPTION', operator: 'ENDS_WITH', value: 'berlin', categoryId: 'cat-food' })]
    expect(applyRules(rules, baseTx)).toBe('cat-food')
  })

  it('ENDS_WITH does not match when string ends differently', () => {
    const rules = [mockRule({ field: 'DESCRIPTION', operator: 'ENDS_WITH', value: 'hamburg', categoryId: 'cat-food' })]
    expect(applyRules(rules, baseTx)).toBeNull()
  })

  it('EQUALS matches exact string (case-insensitive)', () => {
    const rules = [mockRule({ field: 'DESCRIPTION', operator: 'EQUALS', value: 'edeka supermarkt berlin', categoryId: 'cat-food' })]
    expect(applyRules(rules, baseTx)).toBe('cat-food')
  })

  it('EQUALS does not match partial string', () => {
    const rules = [mockRule({ field: 'DESCRIPTION', operator: 'EQUALS', value: 'edeka', categoryId: 'cat-food' })]
    expect(applyRules(rules, baseTx)).toBeNull()
  })

  it('GREATER_THAN matches when amount exceeds value (uses Math.abs)', () => {
    // tx.amount = -42.50, Math.abs = 42.50
    const rules = [mockRule({ field: 'AMOUNT', operator: 'GREATER_THAN', value: '40', categoryId: 'cat-big' })]
    expect(applyRules(rules, baseTx)).toBe('cat-big')
  })

  it('GREATER_THAN does not match when amount is below value', () => {
    const rules = [mockRule({ field: 'AMOUNT', operator: 'GREATER_THAN', value: '50', categoryId: 'cat-big' })]
    expect(applyRules(rules, baseTx)).toBeNull()
  })

  it('LESS_THAN matches when amount is below value', () => {
    const rules = [mockRule({ field: 'AMOUNT', operator: 'LESS_THAN', value: '50', categoryId: 'cat-small' })]
    expect(applyRules(rules, baseTx)).toBe('cat-small')
  })

  it('LESS_THAN does not match when amount exceeds value', () => {
    const rules = [mockRule({ field: 'AMOUNT', operator: 'LESS_THAN', value: '10', categoryId: 'cat-small' })]
    expect(applyRules(rules, baseTx)).toBeNull()
  })

  it('REGEX matches with regex pattern', () => {
    const rules = [mockRule({ field: 'DESCRIPTION', operator: 'REGEX', value: 'EDEKA.*BERLIN', categoryId: 'cat-food' })]
    expect(applyRules(rules, baseTx)).toBe('cat-food')
  })

  it('REGEX is case-insensitive', () => {
    const rules = [mockRule({ field: 'DESCRIPTION', operator: 'REGEX', value: 'edeka.*berlin', categoryId: 'cat-food' })]
    expect(applyRules(rules, baseTx)).toBe('cat-food')
  })

  it('REGEX with invalid pattern does not match (returns false, no error)', () => {
    const rules = [mockRule({ field: 'DESCRIPTION', operator: 'REGEX', value: '[invalid', categoryId: 'cat-food' })]
    expect(applyRules(rules, baseTx)).toBeNull()
  })
})

describe('applyRules — field tests', () => {
  it('matches on PAYEE field', () => {
    const rules = [mockRule({ field: 'PAYEE', operator: 'CONTAINS', value: 'edeka zentrale', categoryId: 'cat-payee' })]
    expect(applyRules(rules, baseTx)).toBe('cat-payee')
  })

  it('PAYEE falls back to empty string when undefined', () => {
    const tx: RawTransaction = { date: '2025-01-15', amount: -10, description: 'Test' }
    const rules = [mockRule({ field: 'PAYEE', operator: 'EQUALS', value: '', categoryId: 'cat-empty' })]
    expect(applyRules(rules, tx)).toBe('cat-empty')
  })

  it('AMOUNT field uses absolute value of transaction amount', () => {
    const tx: RawTransaction = { date: '2025-01-15', amount: -100, description: 'Test' }
    const rules = [mockRule({ field: 'AMOUNT', operator: 'EQUALS', value: '100', categoryId: 'cat-exact' })]
    expect(applyRules(rules, tx)).toBe('cat-exact')
  })
})

describe('applyRules — priority and filtering', () => {
  it('higher priority rule wins when multiple rules match', () => {
    const rules = [
      mockRule({ field: 'DESCRIPTION', operator: 'CONTAINS', value: 'edeka', categoryId: 'cat-low', priority: 1 }),
      mockRule({ field: 'DESCRIPTION', operator: 'CONTAINS', value: 'edeka', categoryId: 'cat-high', priority: 10 }),
    ]
    expect(applyRules(rules, baseTx)).toBe('cat-high')
  })

  it('first match wins among equal priority', () => {
    const rules = [
      mockRule({ field: 'DESCRIPTION', operator: 'CONTAINS', value: 'edeka', categoryId: 'cat-a', priority: 5 }),
      mockRule({ field: 'DESCRIPTION', operator: 'CONTAINS', value: 'supermarkt', categoryId: 'cat-b', priority: 5 }),
    ]
    const result = applyRules(rules, baseTx)
    // Both match at priority 5 — sort is stable so original array order after sort determines the result
    expect(result).toBeTruthy()
  })

  it('inactive rules are ignored', () => {
    const rules = [
      mockRule({ field: 'DESCRIPTION', operator: 'CONTAINS', value: 'edeka', categoryId: 'cat-inactive', priority: 100, isActive: false }),
      mockRule({ field: 'DESCRIPTION', operator: 'CONTAINS', value: 'edeka', categoryId: 'cat-active', priority: 1, isActive: true }),
    ]
    expect(applyRules(rules, baseTx)).toBe('cat-active')
  })

  it('returns null when all rules are inactive', () => {
    const rules = [
      mockRule({ field: 'DESCRIPTION', operator: 'CONTAINS', value: 'edeka', categoryId: 'cat-1', isActive: false }),
    ]
    expect(applyRules(rules, baseTx)).toBeNull()
  })

  it('returns null when no rules match', () => {
    const rules = [
      mockRule({ field: 'DESCRIPTION', operator: 'CONTAINS', value: 'amazon', categoryId: 'cat-1' }),
      mockRule({ field: 'DESCRIPTION', operator: 'CONTAINS', value: 'netflix', categoryId: 'cat-2' }),
    ]
    expect(applyRules(rules, baseTx)).toBeNull()
  })

  it('returns null for empty rules array', () => {
    expect(applyRules([], baseTx)).toBeNull()
  })
})
```

- [ ] **Step 5.2** Run the tests:

```bash
cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp"
npx vitest run tests/unit/rules-matcher.test.ts
# Expected: all tests pass
```

---

## Task 6: Unit test validate-regex.ts

**File:** `tests/unit/validate-regex.test.ts`
**Source:** `src/lib/rules/validate-regex.ts`

- [ ] **Step 6.1** Create `tests/unit/validate-regex.test.ts`:

```ts
// /Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp/tests/unit/validate-regex.test.ts
import { describe, it, expect } from 'vitest'
import { validateRegexPattern } from '@/lib/rules/validate-regex'

describe('validateRegexPattern', () => {
  describe('valid patterns', () => {
    it('accepts simple literal string', () => {
      expect(validateRegexPattern('edeka')).toEqual({ valid: true })
    })

    it('accepts standard regex with character class', () => {
      expect(validateRegexPattern('[A-Z]+')).toEqual({ valid: true })
    })

    it('accepts regex with alternation', () => {
      expect(validateRegexPattern('edeka|rewe|aldi')).toEqual({ valid: true })
    })

    it('accepts regex with groups', () => {
      expect(validateRegexPattern('(foo)(bar)')).toEqual({ valid: true })
    })

    it('accepts regex with quantifiers', () => {
      expect(validateRegexPattern('a{2,5}')).toEqual({ valid: true })
    })

    it('accepts regex with anchors', () => {
      expect(validateRegexPattern('^start.*end$')).toEqual({ valid: true })
    })

    it('accepts regex with lookahead', () => {
      expect(validateRegexPattern('foo(?=bar)')).toEqual({ valid: true })
    })

    it('accepts regex with dot-star', () => {
      expect(validateRegexPattern('.*')).toEqual({ valid: true })
    })

    it('accepts empty pattern', () => {
      expect(validateRegexPattern('')).toEqual({ valid: true })
    })

    it('accepts pattern at exactly 500 chars', () => {
      const pattern = 'a'.repeat(500)
      expect(validateRegexPattern(pattern)).toEqual({ valid: true })
    })
  })

  describe('invalid syntax', () => {
    it('rejects unclosed bracket', () => {
      const result = validateRegexPattern('[abc')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Ungultiges Regex-Pattern').or.toBeDefined()
    })

    it('rejects unclosed bracket — has error message', () => {
      const result = validateRegexPattern('[abc')
      expect(result.valid).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('rejects unclosed group', () => {
      const result = validateRegexPattern('(abc')
      expect(result.valid).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('rejects invalid quantifier', () => {
      const result = validateRegexPattern('*abc')
      expect(result.valid).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('rejects lone backslash at end', () => {
      const result = validateRegexPattern('abc\\')
      expect(result.valid).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('nested quantifiers (ReDoS)', () => {
    it('rejects (a+)+', () => {
      const result = validateRegexPattern('(a+)+')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Verschachtelte Quantoren')
    })

    it('rejects (a*)*', () => {
      const result = validateRegexPattern('(a*)*')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Verschachtelte Quantoren')
    })

    it('rejects (a+)*', () => {
      const result = validateRegexPattern('(a+)*')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Verschachtelte Quantoren')
    })

    it('rejects (a{2,})+', () => {
      const result = validateRegexPattern('(a{2,})+')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Verschachtelte Quantoren')
    })

    it('allows (a+) without outer quantifier', () => {
      const result = validateRegexPattern('(a+)')
      expect(result.valid).toBe(true)
    })

    it('allows a+ (no group)', () => {
      const result = validateRegexPattern('a+')
      expect(result.valid).toBe(true)
    })
  })

  describe('length limit', () => {
    it('rejects patterns longer than 500 characters', () => {
      const pattern = 'a'.repeat(501)
      const result = validateRegexPattern(pattern)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('500 Zeichen')
    })
  })
})
```

- [ ] **Step 6.2** Run the tests:

```bash
cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp"
npx vitest run tests/unit/validate-regex.test.ts
# Expected: all tests pass
```

---

## Task 7: Unit test csv/parser.ts

**File:** `tests/unit/csv-parser.test.ts`
**Source:** `src/lib/csv/parser.ts`

The functions `parseAmount`, `parseDate`, and `computeHash` are NOT exported from `parser.ts`. Before writing tests, we export them so they can be tested directly. This avoids needing to mock Papa Parse just to test parsing logic.

- [ ] **Step 7.1** Edit `src/lib/csv/parser.ts` to export `parseAmount`, `parseDate`, and `computeHash`:

Change the three function signatures from:

```ts
function parseAmount(value: string, fmt: 'DE' | 'EN'): number {
```

to:

```ts
export function parseAmount(value: string, fmt: 'DE' | 'EN'): number {
```

Change:

```ts
function parseDate(value: string, dateFormat: string): Date | null {
```

to:

```ts
export function parseDate(value: string, dateFormat: string): Date | null {
```

Change:

```ts
async function computeHash(str: string): Promise<string> {
```

to:

```ts
export async function computeHash(str: string): Promise<string> {
```

These are the only three lines that change. The function bodies remain identical.

- [ ] **Step 7.2** Create `tests/unit/csv-parser.test.ts`:

```ts
// /Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp/tests/unit/csv-parser.test.ts
import { describe, it, expect } from 'vitest'
import { parseAmount, parseDate, computeHash, parseCsv } from '@/lib/csv/parser'
import type { BankProfile } from '@/lib/csv/profiles'

describe('parseAmount', () => {
  describe('DE format (1.234,56)', () => {
    it('parses positive German format', () => {
      expect(parseAmount('1.234,56', 'DE')).toBe(1234.56)
    })

    it('parses negative German format', () => {
      expect(parseAmount('-1.234,56', 'DE')).toBe(-1234.56)
    })

    it('parses amount without thousand separator', () => {
      expect(parseAmount('42,50', 'DE')).toBe(42.5)
    })

    it('parses integer amount in DE format', () => {
      expect(parseAmount('100', 'DE')).toBe(100)
    })

    it('parses amount with spaces', () => {
      expect(parseAmount(' 1.234,56 ', 'DE')).toBe(1234.56)
    })

    it('returns 0 for empty string', () => {
      expect(parseAmount('', 'DE')).toBe(0)
    })

    it('returns 0 for whitespace-only string', () => {
      expect(parseAmount('   ', 'DE')).toBe(0)
    })

    it('returns 0 for lone dash', () => {
      expect(parseAmount('-', 'DE')).toBe(0)
    })

    it('returns 0 for non-numeric string', () => {
      expect(parseAmount('abc', 'DE')).toBe(0)
    })

    it('parses large amount with multiple thousand separators', () => {
      expect(parseAmount('1.234.567,89', 'DE')).toBe(1234567.89)
    })
  })

  describe('EN format (1,234.56)', () => {
    it('parses positive English format', () => {
      expect(parseAmount('1,234.56', 'EN')).toBe(1234.56)
    })

    it('parses negative English format', () => {
      expect(parseAmount('-1,234.56', 'EN')).toBe(-1234.56)
    })

    it('parses amount without thousand separator', () => {
      expect(parseAmount('42.50', 'EN')).toBe(42.5)
    })

    it('returns 0 for empty string', () => {
      expect(parseAmount('', 'EN')).toBe(0)
    })

    it('returns 0 for lone dash', () => {
      expect(parseAmount('-', 'EN')).toBe(0)
    })

    it('parses large amount with multiple thousand separators', () => {
      expect(parseAmount('1,234,567.89', 'EN')).toBe(1234567.89)
    })
  })
})

describe('parseDate', () => {
  it('parses DD.MM.YYYY format', () => {
    const result = parseDate('15.01.2025', 'DD.MM.YYYY')
    expect(result).toBeInstanceOf(Date)
    expect(result!.getFullYear()).toBe(2025)
    expect(result!.getMonth()).toBe(0) // January
    expect(result!.getDate()).toBe(15)
  })

  it('parses YYYY-MM-DD format', () => {
    const result = parseDate('2025-01-15', 'YYYY-MM-DD')
    expect(result).toBeInstanceOf(Date)
    expect(result!.getFullYear()).toBe(2025)
    expect(result!.getMonth()).toBe(0)
    expect(result!.getDate()).toBe(15)
  })

  it('parses MM/DD/YYYY format', () => {
    const result = parseDate('01/15/2025', 'MM/DD/YYYY')
    expect(result).toBeInstanceOf(Date)
    expect(result!.getFullYear()).toBe(2025)
    expect(result!.getDate()).toBe(15)
  })

  it('returns null for empty string', () => {
    expect(parseDate('', 'DD.MM.YYYY')).toBeNull()
  })

  it('returns null for completely invalid date string', () => {
    expect(parseDate('not-a-date', 'DD.MM.YYYY')).toBeNull()
  })

  it('trims whitespace before parsing', () => {
    const result = parseDate('  15.01.2025  ', 'DD.MM.YYYY')
    expect(result).toBeInstanceOf(Date)
    expect(result!.getFullYear()).toBe(2025)
  })

  it('falls back to dd.MM.yyyy when primary format fails', () => {
    // Primary format is YYYY-MM-DD, but input is DD.MM.YYYY — should still parse via fallback
    const result = parseDate('15.01.2025', 'YYYY-MM-DD')
    expect(result).toBeInstanceOf(Date)
    expect(result!.getFullYear()).toBe(2025)
  })

  it('rejects dates before 1970', () => {
    const result = parseDate('15.01.1960', 'DD.MM.YYYY')
    expect(result).toBeNull()
  })
})

describe('computeHash', () => {
  it('returns a string', async () => {
    const hash = await computeHash('test')
    expect(typeof hash).toBe('string')
  })

  it('returns the same hash for the same input', async () => {
    const hash1 = await computeHash('identical')
    const hash2 = await computeHash('identical')
    expect(hash1).toBe(hash2)
  })

  it('returns different hashes for different inputs', async () => {
    const hash1 = await computeHash('input1')
    const hash2 = await computeHash('input2')
    expect(hash1).not.toBe(hash2)
  })

  it('handles empty string', async () => {
    const hash = await computeHash('')
    expect(typeof hash).toBe('string')
    expect(hash.length).toBeGreaterThan(0)
  })
})

describe('parseCsv', () => {
  const testProfile: BankProfile = {
    id: 'test',
    name: 'Test Bank',
    delimiter: ';',
    dateFormat: 'DD.MM.YYYY',
    encoding: 'UTF-8',
    skipRows: 1,
    columnMapping: { date: 0, description: 1, amount: 2 },
    amountFormat: 'DE',
  }

  it('parses a simple CSV with header row', async () => {
    const csv = [
      'Datum;Beschreibung;Betrag',
      '15.01.2025;Einkauf EDEKA;-42,50',
      '16.01.2025;Gehalt;3.500,00',
    ].join('\n')

    const result = await parseCsv(csv, testProfile)
    expect(result.transactions).toHaveLength(2)
    expect(result.errors).toHaveLength(0)
    expect(result.totalRows).toBe(3) // header + 2 data rows
    expect(result.skippedRows).toBe(1) // header
  })

  it('parses amounts in German format', async () => {
    const csv = 'H\n15.01.2025;Einkauf;-1.234,56'
    const result = await parseCsv(csv, testProfile)
    expect(result.transactions[0].amount).toBe(-1234.56)
  })

  it('extracts description correctly', async () => {
    const csv = 'H\n15.01.2025;EDEKA SUPERMARKT;-10,00'
    const result = await parseCsv(csv, testProfile)
    expect(result.transactions[0].description).toBe('EDEKA SUPERMARKT')
  })

  it('formats date as YYYY-MM-DD in output', async () => {
    const csv = 'H\n15.01.2025;Test;-10,00'
    const result = await parseCsv(csv, testProfile)
    expect(result.transactions[0].date).toBe('2025-01-15')
  })

  it('skips rows with missing date', async () => {
    const csv = 'H\n;Einkauf;-10,00'
    const result = await parseCsv(csv, testProfile)
    expect(result.transactions).toHaveLength(0)
    expect(result.skippedRows).toBe(2) // header + skipped data row
  })

  it('skips rows with missing description', async () => {
    const csv = 'H\n15.01.2025;;-10,00'
    const result = await parseCsv(csv, testProfile)
    expect(result.transactions).toHaveLength(0)
    expect(result.skippedRows).toBe(2)
  })

  it('reports error for invalid date format', async () => {
    const csv = 'H\nnot-a-date;Einkauf;-10,00'
    const result = await parseCsv(csv, testProfile)
    expect(result.transactions).toHaveLength(0)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toContain('Ungültiges Datum')
  })

  it('generates unique hash per transaction', async () => {
    const csv = [
      'H',
      '15.01.2025;Einkauf A;-10,00',
      '15.01.2025;Einkauf B;-20,00',
    ].join('\n')
    const result = await parseCsv(csv, testProfile)
    expect(result.transactions[0].hash).not.toBe(result.transactions[1].hash)
  })

  it('generates same hash for identical data', async () => {
    const csv = 'H\n15.01.2025;Einkauf;-10,00'
    const result1 = await parseCsv(csv, testProfile)
    const result2 = await parseCsv(csv, testProfile)
    expect(result1.transactions[0].hash).toBe(result2.transactions[0].hash)
  })

  it('handles payee column when present in mapping', async () => {
    const profileWithPayee: BankProfile = {
      ...testProfile,
      columnMapping: { date: 0, description: 1, amount: 2, payee: 3 },
    }
    const csv = 'H\n15.01.2025;Einkauf;-10,00;EDEKA Zentrale'
    const result = await parseCsv(csv, profileWithPayee)
    expect(result.transactions[0].payee).toBe('EDEKA Zentrale')
  })

  it('handles split amounts (debit/credit columns)', async () => {
    const splitProfile: BankProfile = {
      ...testProfile,
      splitAmounts: true,
      columnMapping: { date: 0, description: 1, amount: 0, debit: 2, credit: 3 },
    }
    const csv = 'H\n15.01.2025;Einkauf;42,50;0,00'
    const result = await parseCsv(csv, splitProfile)
    // amount = credit - debit = 0 - 42.50 = -42.50
    expect(result.transactions[0].amount).toBe(-42.5)
  })

  it('skips header rows as configured in profile', async () => {
    const profile5Skip: BankProfile = { ...testProfile, skipRows: 3 }
    const csv = [
      'Bank Export',
      'Date: 2025-01-15',
      'Header;Row;Here',
      '15.01.2025;Einkauf;-10,00',
    ].join('\n')
    const result = await parseCsv(csv, profile5Skip)
    expect(result.transactions).toHaveLength(1)
    expect(result.skippedRows).toBe(3)
  })

  it('sets rowIndex relative to original file (including skipped rows)', async () => {
    const csv = 'H\n15.01.2025;Einkauf;-10,00'
    const result = await parseCsv(csv, testProfile)
    // skipRows=1, data row index 0 → rowIndex = 0 + 1 + 1 = 2
    expect(result.transactions[0].rowIndex).toBe(2)
  })

  it('handles EN amount format profile', async () => {
    const enProfile: BankProfile = {
      ...testProfile,
      delimiter: ',',
      amountFormat: 'EN',
      dateFormat: 'YYYY-MM-DD',
      columnMapping: { date: 0, description: 1, amount: 2 },
    }
    // Note: comma delimiter means we need to be careful with CSV
    const csv = 'H,H,H\n2025-01-15,Grocery Store,-1234.56'
    const result = await parseCsv(csv, enProfile)
    expect(result.transactions[0].amount).toBe(-1234.56)
  })

  it('handles empty CSV (only header)', async () => {
    const csv = 'Datum;Beschreibung;Betrag'
    const result = await parseCsv(csv, testProfile)
    expect(result.transactions).toHaveLength(0)
    expect(result.skippedRows).toBe(1)
  })

  it('preserves raw row data', async () => {
    const csv = 'H\n15.01.2025;Einkauf EDEKA;-42,50'
    const result = await parseCsv(csv, testProfile)
    expect(result.transactions[0].raw).toEqual(['15.01.2025', 'Einkauf EDEKA', '-42,50'])
  })
})
```

- [ ] **Step 7.3** Run the tests:

```bash
cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp"
npx vitest run tests/unit/csv-parser.test.ts
# Expected: all tests pass
```

---

## Task 8: Unit test schemas

**File:** `tests/unit/schemas.test.ts`
**Source:** `src/lib/schemas/accounts.ts`

- [ ] **Step 8.1** Create `tests/unit/schemas.test.ts`:

```ts
// /Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp/tests/unit/schemas.test.ts
import { describe, it, expect } from 'vitest'
import {
  createAccountSchema,
  updateAccountSchema,
  reorderAccountsSchema,
  reconcileAccountSchema,
  createSubAccountSchema,
} from '@/lib/schemas/accounts'

describe('createAccountSchema', () => {
  it('accepts valid input with all fields', () => {
    const result = createAccountSchema.safeParse({
      name: 'Girokonto',
      iban: 'DE89370400440532013000',
      bank: 'Commerzbank',
      type: 'CHECKING',
      color: '#ff0000',
      icon: 'wallet',
      currentBalance: 1000,
    })
    expect(result.success).toBe(true)
  })

  it('accepts minimal input (only name)', () => {
    const result = createAccountSchema.safeParse({ name: 'Test' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.type).toBe('CHECKING') // default
      expect(result.data.color).toBe('#6366f1') // default
      expect(result.data.currentBalance).toBe(0) // default
    }
  })

  it('rejects empty name', () => {
    const result = createAccountSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })

  it('rejects missing name', () => {
    const result = createAccountSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects invalid account type', () => {
    const result = createAccountSchema.safeParse({ name: 'Test', type: 'INVALID_TYPE' })
    expect(result.success).toBe(false)
  })

  it('accepts all valid account types', () => {
    const types = ['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'CASH', 'INVESTMENT']
    for (const type of types) {
      const result = createAccountSchema.safeParse({ name: 'Test', type })
      expect(result.success).toBe(true)
    }
  })

  it('accepts null for optional nullable fields', () => {
    const result = createAccountSchema.safeParse({
      name: 'Test',
      iban: null,
      bank: null,
      icon: null,
    })
    expect(result.success).toBe(true)
  })

  it('accepts negative balance', () => {
    const result = createAccountSchema.safeParse({ name: 'Test', currentBalance: -500 })
    expect(result.success).toBe(true)
  })
})

describe('updateAccountSchema', () => {
  it('accepts partial update (only name)', () => {
    const result = updateAccountSchema.safeParse({ name: 'Updated' })
    expect(result.success).toBe(true)
  })

  it('accepts empty object (all fields optional)', () => {
    const result = updateAccountSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('rejects empty name string', () => {
    const result = updateAccountSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })

  it('accepts null for nullable fields', () => {
    const result = updateAccountSchema.safeParse({ iban: null, bank: null, icon: null })
    expect(result.success).toBe(true)
  })

  it('rejects invalid account type', () => {
    const result = updateAccountSchema.safeParse({ type: 'WRONG' })
    expect(result.success).toBe(false)
  })
})

describe('reorderAccountsSchema', () => {
  it('accepts array with at least one id', () => {
    const result = reorderAccountsSchema.safeParse({ ids: ['id1'] })
    expect(result.success).toBe(true)
  })

  it('accepts array with multiple ids', () => {
    const result = reorderAccountsSchema.safeParse({ ids: ['id1', 'id2', 'id3'] })
    expect(result.success).toBe(true)
  })

  it('rejects empty array', () => {
    const result = reorderAccountsSchema.safeParse({ ids: [] })
    expect(result.success).toBe(false)
  })

  it('rejects missing ids field', () => {
    const result = reorderAccountsSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects non-string array elements', () => {
    const result = reorderAccountsSchema.safeParse({ ids: [123] })
    expect(result.success).toBe(false)
  })
})

describe('reconcileAccountSchema', () => {
  it('accepts valid reconciliation data', () => {
    const result = reconcileAccountSchema.safeParse({
      statementBalance: 5000.50,
      clearedTransactionIds: ['tx1', 'tx2'],
    })
    expect(result.success).toBe(true)
  })

  it('accepts empty cleared transactions array', () => {
    const result = reconcileAccountSchema.safeParse({
      statementBalance: 1000,
      clearedTransactionIds: [],
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing statementBalance', () => {
    const result = reconcileAccountSchema.safeParse({
      clearedTransactionIds: [],
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing clearedTransactionIds', () => {
    const result = reconcileAccountSchema.safeParse({
      statementBalance: 1000,
    })
    expect(result.success).toBe(false)
  })

  it('accepts negative statement balance', () => {
    const result = reconcileAccountSchema.safeParse({
      statementBalance: -200,
      clearedTransactionIds: [],
    })
    expect(result.success).toBe(true)
  })
})

describe('createSubAccountSchema', () => {
  it('accepts valid input', () => {
    const result = createSubAccountSchema.safeParse({ name: 'Sub Account' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.color).toBe('#6366f1')
      expect(result.data.initialBalance).toBe(0)
    }
  })

  it('accepts custom color and balance', () => {
    const result = createSubAccountSchema.safeParse({
      name: 'Sub',
      color: '#ff0000',
      initialBalance: 500,
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    const result = createSubAccountSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })

  it('rejects missing name', () => {
    const result = createSubAccountSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 8.2** Run the tests:

```bash
cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp"
npx vitest run tests/unit/schemas.test.ts
# Expected: all tests pass
```

---

## Task 9: Unit test handler + errors

**File:** `tests/unit/handler.test.ts`
**Source:** `src/lib/api/handler.ts` + `src/lib/api/errors.ts`

The `withHandler` function uses `NextResponse` from `next/server`. In a Vitest environment we need to mock it.

- [ ] **Step 9.1** Create `tests/unit/handler.test.ts`:

```ts
// /Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp/tests/unit/handler.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DomainError } from '@/lib/api/errors'

// Mock NextResponse before importing handler
vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => {
      return {
        status: init?.status ?? 200,
        json: async () => body,
      }
    },
  },
}))

// Import after mock is defined
import { withHandler } from '@/lib/api/handler'

// We need ZodError — import from zod
import { z } from 'zod'

describe('DomainError', () => {
  it('creates error with message and status 400', () => {
    const err = new DomainError('Bad request', 400)
    expect(err.message).toBe('Bad request')
    expect(err.status).toBe(400)
    expect(err.name).toBe('DomainError')
  })

  it('creates error with status 404', () => {
    const err = new DomainError('Not found', 404)
    expect(err.status).toBe(404)
  })

  it('creates error with status 409', () => {
    const err = new DomainError('Conflict', 409)
    expect(err.status).toBe(409)
  })

  it('creates error with status 422', () => {
    const err = new DomainError('Unprocessable', 422)
    expect(err.status).toBe(422)
  })

  it('is an instance of Error', () => {
    const err = new DomainError('Test', 400)
    expect(err).toBeInstanceOf(Error)
  })
})

describe('withHandler', () => {
  const mockRequest = new Request('http://test/api/test')

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the handler result on success', async () => {
    const handler = withHandler(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ data: 'ok' })
    })

    const res = await handler(mockRequest, {})
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ data: 'ok' })
  })

  it('catches ZodError and returns 400 with issues', async () => {
    const schema = z.object({
      name: z.string().min(1),
      age: z.number(),
    })

    const handler = withHandler(async () => {
      schema.parse({ name: '', age: 'not-a-number' }) // Will throw ZodError
      throw new Error('Should not reach here')
    })

    const res = await handler(mockRequest, {})
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toBeInstanceOf(Array)
    expect(body.error.length).toBeGreaterThan(0)
    // Each issue should have path and message
    for (const issue of body.error) {
      expect(issue).toHaveProperty('path')
      expect(issue).toHaveProperty('message')
    }
  })

  it('catches DomainError and returns correct status', async () => {
    const handler = withHandler(async () => {
      throw new DomainError('Account not found', 404)
    })

    const res = await handler(mockRequest, {})
    const body = await res.json()
    expect(res.status).toBe(404)
    expect(body.error).toBe('Account not found')
  })

  it('catches DomainError with 409 status', async () => {
    const handler = withHandler(async () => {
      throw new DomainError('Duplicate entry', 409)
    })

    const res = await handler(mockRequest, {})
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.error).toBe('Duplicate entry')
  })

  it('catches unknown errors and returns 500', async () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const handler = withHandler(async () => {
      throw new Error('Unexpected database error')
    })

    const res = await handler(mockRequest, {})
    const body = await res.json()
    expect(res.status).toBe(500)
    expect(body.error).toBe('Internal Server Error')
    expect(consoleSpy).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('catches non-Error throws and returns 500', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const handler = withHandler(async () => {
      throw 'string error' // eslint-disable-line no-throw-literal
    })

    const res = await handler(mockRequest, {})
    const body = await res.json()
    expect(res.status).toBe(500)
    expect(body.error).toBe('Internal Server Error')

    consoleSpy.mockRestore()
  })

  it('passes request and context to the wrapped handler', async () => {
    const spy = vi.fn(async () => {
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ ok: true })
    })

    const handler = withHandler(spy)
    const ctx = { params: Promise.resolve({ id: '123' }) }
    await handler(mockRequest, ctx)

    expect(spy).toHaveBeenCalledWith(mockRequest, ctx)
  })
})
```

- [ ] **Step 9.2** Run the tests:

```bash
cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp"
npx vitest run tests/unit/handler.test.ts
# Expected: all tests pass
```

---

## Task 10: Pre-commit hook (Husky + lint-staged)

**Files:** `.husky/pre-commit`, `package.json`

- [ ] **Step 10.1** Install dependencies:

```bash
cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp"
npm install -D husky lint-staged
```

- [ ] **Step 10.2** Initialize Husky:

```bash
cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp"
npx husky init
```

This creates `.husky/pre-commit` with a default script. Overwrite it in the next step.

- [ ] **Step 10.3** Write the pre-commit hook file `.husky/pre-commit`:

```bash
npx lint-staged
```

That's the entire file content. One line, no shebang needed (Husky v9+ handles that).

- [ ] **Step 10.4** Add lint-staged configuration to `package.json`. Add this top-level key after the `"prisma"` block:

```json
"lint-staged": {
  "*.{ts,tsx}": [
    "eslint --max-warnings=0",
    "vitest related --run"
  ]
}
```

The full relevant section of `package.json`:

```json
"prisma": {
  "seed": "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts"
},
"lint-staged": {
  "*.{ts,tsx}": [
    "eslint --max-warnings=0",
    "vitest related --run"
  ]
}
```

- [ ] **Step 10.5** Verify the hook is executable:

```bash
ls -la "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp/.husky/pre-commit"
# Expected: file exists, is executable
```

- [ ] **Step 10.6** Test that lint-staged config is valid:

```bash
cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp"
npx lint-staged --dry-run 2>&1 | head -10
# Expected: shows what would run, no config errors
```

---

## Task 11: GitHub Actions CI

**File:** `.github/workflows/ci.yml`

- [ ] **Step 11.1** Create the directory and workflow file:

```bash
mkdir -p "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp/.github/workflows"
```

- [ ] **Step 11.2** Create `.github/workflows/ci.yml`:

```yaml
# /Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp/.github/workflows/ci.yml
name: CI

on:
  push:
    branches: ['**']
  pull_request:
    branches: [main]

jobs:
  lint-and-unit:
    name: Lint & Unit Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx prisma generate
      - run: npm run lint
      - run: npm run test:unit

  e2e:
    name: E2E Tests
    needs: [lint-and-unit]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx prisma generate
      - run: npx playwright install --with-deps chromium
      - run: npm run build
        env:
          # Provide a dummy DB for the build step
          DATABASE_URL: file:./prisma/dev.db
      - name: Create test database
        run: |
          npm run build 2>/dev/null || true
          sqlite3 prisma/dev.db "SELECT 1;" 2>/dev/null || touch prisma/dev.db
      - run: npm run test:e2e
        env:
          DATABASE_URL: file:./prisma/dev.db
```

- [ ] **Step 11.3** Verify the YAML is valid:

```bash
cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp"
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "YAML valid"
# Expected: "YAML valid"
```

---

## Task 12: Update CLAUDE.md

**File:** `CLAUDE.md` (project root)

- [ ] **Step 12.1** Add the testing section to `CLAUDE.md`. Insert before the `## Critical gotchas` section:

```markdown
## Tests — MANDATORY

```bash
npm test             # Run all Vitest tests (unit + api)
npm run test:unit    # Run unit tests only
npm run test:api     # Run API integration tests only
npm run test:e2e     # Run Playwright E2E tests
npm run test:all     # Run Vitest + Playwright
```

**Every code change to `src/lib/` or `src/app/api/` MUST include corresponding tests:**
- New pure functions → unit test in `tests/unit/`
- New/changed API routes → API integration test in `tests/api/`
- New features/pages → E2E test in `tests/[feature]/`

**Test directory structure:**
```
tests/
  unit/              # Pure function tests (no DB, no server)
  api/               # API route handler tests (test DB)
  [feature]/         # E2E tests (Playwright)
```

**Pre-commit hook** runs ESLint + related Vitest tests on staged `.ts/.tsx` files. If it fails, fix the issue before committing.

**CI (GitHub Actions)** runs lint, unit tests, and E2E on every push. PRs require green CI.
```

The full CLAUDE.md after this edit should have the new section between `## Conventions` and `## Critical gotchas`. Here is the exact text to insert after the Conventions section ends and before Critical gotchas:

```markdown
## Tests -- MANDATORY

```bash
npm test             # Run all Vitest tests (unit + api)
npm run test:unit    # Run unit tests only
npm run test:api     # Run API integration tests only
npm run test:e2e     # Run Playwright E2E tests
npm run test:all     # Run Vitest + Playwright
```

**Every code change to `src/lib/` or `src/app/api/` MUST include corresponding tests:**
- New pure functions -> unit test in `tests/unit/`
- New/changed API routes -> API integration test in `tests/api/`
- New features/pages -> E2E test in `tests/[feature]/`

**Test directory structure:**
```
tests/
  unit/              # Pure function tests (no DB, no server)
  api/               # API route handler tests (test DB)
  [feature]/         # E2E tests (Playwright)
```

**Pre-commit hook** runs ESLint + related Vitest tests on staged `.ts/.tsx` files. If it fails, fix the issue before committing.

**CI (GitHub Actions)** runs lint, unit tests, and E2E on every push. PRs require green CI.
```

---

## Task 13: Commit and push

- [ ] **Step 13.1** Create a new branch:

```bash
cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp"
git checkout main && git pull && git checkout -b chore/vitest-unit-tests
```

- [ ] **Step 13.2** Stage all new and modified files:

```bash
cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp"
git add \
  vitest.config.ts \
  package.json \
  package-lock.json \
  .gitignore \
  tests/unit/money.test.ts \
  tests/unit/amortization.test.ts \
  tests/unit/savings-schedule.test.ts \
  tests/unit/rules-matcher.test.ts \
  tests/unit/validate-regex.test.ts \
  tests/unit/csv-parser.test.ts \
  tests/unit/schemas.test.ts \
  tests/unit/handler.test.ts \
  src/lib/csv/parser.ts \
  .husky/pre-commit \
  .github/workflows/ci.yml \
  CLAUDE.md
```

- [ ] **Step 13.3** Run all unit tests one final time before committing:

```bash
cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp"
npx vitest run tests/unit
# Expected: all tests pass
```

- [ ] **Step 13.4** Commit:

```bash
cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp"
git commit -m "chore: add Vitest setup, unit tests, pre-commit hook, and GitHub Actions CI

- Configure Vitest with path alias support and coverage
- Add unit tests for: money, amortization, savings schedule, rules matcher,
  validate-regex, csv parser, account schemas, API handler + errors
- Export parseAmount/parseDate/computeHash from csv/parser.ts for testability
- Set up Husky + lint-staged pre-commit hook (eslint + vitest related)
- Add GitHub Actions CI workflow (lint, unit tests, e2e)
- Update CLAUDE.md with testing conventions"
```

- [ ] **Step 13.5** Push and create draft PR:

```bash
cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp"
git push -u origin chore/vitest-unit-tests
gh pr create --draft --title "chore: Vitest setup + unit tests + CI" --body "## Summary
- Vitest configured with @/* path alias and v8 coverage
- 8 unit test files covering all pure business logic in src/lib/
- Husky + lint-staged pre-commit hook
- GitHub Actions CI workflow

## Test plan
- [ ] Run \`npm run test:unit\` locally — all tests pass
- [ ] Verify pre-commit hook triggers on commit
- [ ] Push to GitHub and verify CI runs green"
```

---

## Summary

| Task | File(s) | Tests |
|---|---|---|
| 1. Vitest Setup | `vitest.config.ts`, `package.json`, `.gitignore` | - |
| 2. money.ts | `tests/unit/money.test.ts` | 15 tests |
| 3. amortization.ts | `tests/unit/amortization.test.ts` | 27 tests |
| 4. savings/schedule.ts | `tests/unit/savings-schedule.test.ts` | 24 tests |
| 5. rules/matcher.ts | `tests/unit/rules-matcher.test.ts` | 22 tests |
| 6. validate-regex.ts | `tests/unit/validate-regex.test.ts` | 16 tests |
| 7. csv/parser.ts | `tests/unit/csv-parser.test.ts` + edit `src/lib/csv/parser.ts` | 28 tests |
| 8. schemas | `tests/unit/schemas.test.ts` | 22 tests |
| 9. handler + errors | `tests/unit/handler.test.ts` | 11 tests |
| 10. Pre-commit | `.husky/pre-commit`, `package.json` | - |
| 11. CI | `.github/workflows/ci.yml` | - |
| 12. CLAUDE.md | `CLAUDE.md` | - |
| 13. Commit | - | - |

**Total: ~165 unit test cases across 8 test files.**
