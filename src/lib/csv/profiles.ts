export interface CsvColumnMapping {
  date: number
  description: number
  amount: number
  payee?: number
  // Manche Banken haben separate Soll/Haben-Spalten
  debit?: number
  credit?: number
}

export interface BankProfile {
  id: string
  name: string
  delimiter: string
  dateFormat: string
  encoding: string
  skipRows: number
  columnMapping: CsvColumnMapping
  amountFormat: 'DE' | 'EN' // DE = Komma als Dezimaltrennzeichen
  // Manche Banken haben Soll/Haben getrennt
  splitAmounts?: boolean
}

export const BANK_PROFILES: BankProfile[] = [
  {
    id: 'zkb',
    name: 'ZKB (Zürcher Kantonalbank)',
    delimiter: ';',
    dateFormat: 'DD.MM.YYYY',
    encoding: 'UTF-8',
    skipRows: 1,
    columnMapping: { date: 0, description: 1, amount: 4, payee: 2 },
    amountFormat: 'DE',
  },
  {
    id: 'ubs',
    name: 'UBS',
    delimiter: ';',
    dateFormat: 'DD.MM.YYYY',
    encoding: 'UTF-8',
    skipRows: 1,
    columnMapping: { date: 0, description: 2, amount: 3, payee: 1 },
    amountFormat: 'DE',
  },
  {
    id: 'postfinance',
    name: 'PostFinance',
    delimiter: ';',
    dateFormat: 'DD.MM.YYYY',
    encoding: 'UTF-8',
    skipRows: 1,
    columnMapping: { date: 0, description: 1, amount: 4 },
    amountFormat: 'DE',
  },
  {
    id: 'raiffeisen-ch',
    name: 'Raiffeisen Schweiz',
    delimiter: ';',
    dateFormat: 'DD.MM.YYYY',
    encoding: 'UTF-8',
    skipRows: 1,
    columnMapping: { date: 0, description: 1, amount: 4, payee: 2 },
    amountFormat: 'DE',
  },
  {
    id: 'dkb',
    name: 'DKB (Deutsche Kreditbank)',
    delimiter: ';',
    dateFormat: 'DD.MM.YYYY',
    encoding: 'UTF-8',
    skipRows: 5,
    columnMapping: { date: 0, description: 3, amount: 7, payee: 2 },
    amountFormat: 'DE',
  },
  {
    id: 'ing-de',
    name: 'ING (Deutschland)',
    delimiter: ';',
    dateFormat: 'DD.MM.YYYY',
    encoding: 'UTF-8',
    skipRows: 13,
    columnMapping: { date: 0, description: 2, amount: 4, payee: 1 },
    amountFormat: 'DE',
  },
  {
    id: 'sparkasse',
    name: 'Sparkasse',
    delimiter: ';',
    dateFormat: 'DD.MM.YYYY',
    encoding: 'ISO-8859-1',
    skipRows: 1,
    columnMapping: { date: 0, description: 4, amount: 11, payee: 2 },
    amountFormat: 'DE',
  },
  {
    id: 'comdirect',
    name: 'Comdirect',
    delimiter: ';',
    dateFormat: 'DD.MM.YYYY',
    encoding: 'UTF-8',
    skipRows: 4,
    columnMapping: { date: 0, description: 3, amount: 4, payee: 2 },
    amountFormat: 'DE',
  },
  {
    id: 'generic-de',
    name: 'Generisch (Deutsch)',
    delimiter: ';',
    dateFormat: 'DD.MM.YYYY',
    encoding: 'UTF-8',
    skipRows: 1,
    columnMapping: { date: 0, description: 1, amount: 2 },
    amountFormat: 'DE',
  },
  {
    id: 'generic-en',
    name: 'Generisch (Englisch)',
    delimiter: ',',
    dateFormat: 'YYYY-MM-DD',
    encoding: 'UTF-8',
    skipRows: 1,
    columnMapping: { date: 0, description: 1, amount: 2 },
    amountFormat: 'EN',
  },
]
