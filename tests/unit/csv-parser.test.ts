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
