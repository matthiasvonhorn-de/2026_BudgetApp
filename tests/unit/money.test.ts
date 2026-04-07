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
    // Math.round(-155.5) = -155 (rounds toward +∞), so -1.555 → -1.55
    expect(roundCents(-1.555)).toBe(-1.55)
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
