import Papa from 'papaparse'
import { format, parse, isValid } from 'date-fns'
import type { BankProfile } from './profiles'
import type { RawTransaction } from '../rules/matcher'

export interface ParsedTransaction extends RawTransaction {
  rowIndex: number
  raw: string[]
  hash: string
}

export interface ParseResult {
  transactions: ParsedTransaction[]
  errors: string[]
  totalRows: number
  skippedRows: number
}

function parseAmount(value: string, fmt: 'DE' | 'EN'): number {
  if (!value || value.trim() === '' || value.trim() === '-') return 0
  let cleaned = value.trim().replace(/\s/g, '')
  if (fmt === 'DE') {
    // 1.234,56 → 1234.56
    cleaned = cleaned.replace(/\./g, '').replace(',', '.')
  } else {
    // 1,234.56 → 1234.56
    cleaned = cleaned.replace(/,/g, '')
  }
  return parseFloat(cleaned) || 0
}

function parseDate(value: string, dateFormat: string): Date | null {
  if (!value) return null
  const cleaned = value.trim()

  // Versuche gängige Formate
  const formats = [
    dateFormat
      .replace('DD', 'dd')
      .replace('MM', 'MM')
      .replace('YYYY', 'yyyy'),
    'dd.MM.yyyy',
    'yyyy-MM-dd',
    'MM/dd/yyyy',
    'dd/MM/yyyy',
  ]

  for (const fmt of formats) {
    try {
      const d = parse(cleaned, fmt, new Date())
      if (isValid(d) && d.getFullYear() > 1970) return d
    } catch {
      continue
    }
  }
  return null
}

async function computeHash(str: string): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
  }
  // Fallback: einfacher Hash
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(16)
}

export async function parseCsv(
  fileContent: string,
  profile: BankProfile
): Promise<ParseResult> {
  const errors: string[] = []
  const transactions: ParsedTransaction[] = []

  const result = Papa.parse(fileContent, {
    delimiter: profile.delimiter,
    skipEmptyLines: true,
    // encoding is only applicable for File inputs, not string content
  })

  const rows = result.data as string[][]
  const dataRows = rows.slice(profile.skipRows)
  let skippedRows = profile.skipRows

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]
    const mapping = profile.columnMapping

    try {
      const dateStr = row[mapping.date]?.trim()
      const descStr = row[mapping.description]?.trim() ?? ''
      const payeeStr = mapping.payee !== undefined ? row[mapping.payee]?.trim() : undefined

      let amount: number
      if (profile.splitAmounts && mapping.debit !== undefined && mapping.credit !== undefined) {
        const debit = parseAmount(row[mapping.debit] ?? '', profile.amountFormat)
        const credit = parseAmount(row[mapping.credit] ?? '', profile.amountFormat)
        amount = credit - debit
      } else {
        amount = parseAmount(row[mapping.amount] ?? '', profile.amountFormat)
      }

      if (!dateStr || !descStr) {
        skippedRows++
        continue
      }

      const date = parseDate(dateStr, profile.dateFormat)
      if (!date) {
        errors.push(`Zeile ${i + profile.skipRows + 1}: Ungültiges Datum "${dateStr}"`)
        skippedRows++
        continue
      }

      const hashInput = `${format(date, 'yyyy-MM-dd')}|${amount}|${descStr}`
      const hash = await computeHash(hashInput)

      transactions.push({
        date: format(date, 'yyyy-MM-dd'),
        amount,
        description: descStr,
        payee: payeeStr || undefined,
        rowIndex: i + profile.skipRows + 1,
        raw: row,
        hash,
      })
    } catch (e) {
      errors.push(`Zeile ${i + profile.skipRows + 1}: ${e}`)
      skippedRows++
    }
  }

  return {
    transactions,
    errors,
    totalRows: rows.length,
    skippedRows,
  }
}
