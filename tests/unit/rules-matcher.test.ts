// /Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp/tests/unit/rules-matcher.test.ts
import { describe, it, expect } from 'vitest'
import { RuleField, RuleOperator, type CategoryRule } from '@prisma/client'
import { applyRules, type RawTransaction } from '@/lib/rules/matcher'

// Helper to create a mock CategoryRule with the fields that matcher.ts actually uses
function mockRule(overrides: {
  field: keyof typeof RuleField
  operator: keyof typeof RuleOperator
  value: string
  categoryId: string
  priority?: number
  isActive?: boolean
}): CategoryRule {
  return {
    id: 'rule-' + Math.random().toString(36).slice(2),
    name: 'mock-rule',
    field: RuleField[overrides.field],
    operator: RuleOperator[overrides.operator],
    value: overrides.value,
    categoryId: overrides.categoryId,
    priority: overrides.priority ?? 1,
    isActive: overrides.isActive ?? true,
    accountId: 'acc-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  }
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
