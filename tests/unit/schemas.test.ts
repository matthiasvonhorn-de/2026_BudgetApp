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
