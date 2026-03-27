import type { CategoryRule } from '@prisma/client'

export interface RawTransaction {
  date: string
  amount: number
  description: string
  payee?: string
}

function matchesRule(rule: CategoryRule, tx: RawTransaction): boolean {
  const fieldValue = (() => {
    switch (rule.field) {
      case 'DESCRIPTION': return tx.description ?? ''
      case 'PAYEE': return tx.payee ?? ''
      case 'AMOUNT': return String(Math.abs(tx.amount))
      default: return ''
    }
  })()

  const v = rule.value.toLowerCase()
  const fv = fieldValue.toLowerCase()

  switch (rule.operator) {
    case 'CONTAINS': return fv.includes(v)
    case 'STARTS_WITH': return fv.startsWith(v)
    case 'ENDS_WITH': return fv.endsWith(v)
    case 'EQUALS': return fv === v
    case 'GREATER_THAN': return parseFloat(fieldValue) > parseFloat(rule.value)
    case 'LESS_THAN': return parseFloat(fieldValue) < parseFloat(rule.value)
    case 'REGEX': {
      try {
        return new RegExp(rule.value, 'i').test(fieldValue)
      } catch {
        return false
      }
    }
    default: return false
  }
}

export function applyRules(
  rules: CategoryRule[],
  tx: RawTransaction
): string | null {
  // Sortiere nach Priorität (höher = wichtiger)
  const sorted = [...rules].filter(r => r.isActive).sort((a, b) => b.priority - a.priority)
  for (const rule of sorted) {
    if (matchesRule(rule, tx)) {
      return rule.categoryId
    }
  }
  return null
}
