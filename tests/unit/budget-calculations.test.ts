import { describe, it, expect, vi } from 'vitest'

// Mock the settings store before importing
vi.mock('@/store/useSettingsStore', () => ({
  useSettingsStore: {
    getState: () => ({ locale: 'de-DE' }),
  },
}))

import { getAvailableBg, getMonthName } from '@/lib/budget/calculations'

describe('getAvailableBg', () => {
  it('returns green classes for positive available', () => {
    expect(getAvailableBg(100)).toBe('bg-emerald-50 text-emerald-700')
    expect(getAvailableBg(0.01)).toBe('bg-emerald-50 text-emerald-700')
  })

  it('returns muted classes for zero available', () => {
    expect(getAvailableBg(0)).toBe('bg-muted text-muted-foreground')
  })

  it('returns red classes for negative available', () => {
    expect(getAvailableBg(-1)).toBe('bg-red-50 text-destructive')
    expect(getAvailableBg(-0.01)).toBe('bg-red-50 text-destructive')
  })
})

describe('getMonthName', () => {
  it('returns German month name with year', () => {
    const result = getMonthName(1, 2026)
    expect(result).toContain('2026')
    expect(result.toLowerCase()).toContain('januar')
  })

  it('handles December correctly', () => {
    const result = getMonthName(12, 2025)
    expect(result.toLowerCase()).toContain('dezember')
    expect(result).toContain('2025')
  })

  it('handles all 12 months', () => {
    for (let m = 1; m <= 12; m++) {
      const result = getMonthName(m, 2026)
      expect(result).toBeTruthy()
      expect(result).toContain('2026')
    }
  })
})
