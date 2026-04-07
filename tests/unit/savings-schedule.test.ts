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
