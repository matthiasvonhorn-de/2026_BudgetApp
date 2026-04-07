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
    it('rejects unclosed bracket — is invalid', () => {
      const result = validateRegexPattern('[abc')
      expect(result.valid).toBe(false)
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

    it('allows (a{2,})+ — ReDoS check only covers + and * inside groups', () => {
      // The source regex /(\([^)]*[+*][^)]*\))[+*{]/ only detects + or * inside groups.
      // (a{2,})+ has no + or * inside the group, so it is not flagged.
      const result = validateRegexPattern('(a{2,})+')
      expect(result.valid).toBe(true)
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
