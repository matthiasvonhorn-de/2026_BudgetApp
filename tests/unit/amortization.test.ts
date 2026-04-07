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
