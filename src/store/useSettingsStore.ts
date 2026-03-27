import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CurrencyPreset {
  label: string
  currency: string
  locale: string
}

export const CURRENCY_PRESETS: CurrencyPreset[] = [
  { label: 'CHF – Schweiz',       currency: 'CHF', locale: 'de-CH' },
  { label: 'EUR – Deutschland',   currency: 'EUR', locale: 'de-DE' },
  { label: 'EUR – Österreich',    currency: 'EUR', locale: 'de-AT' },
  { label: 'EUR – Frankreich',    currency: 'EUR', locale: 'fr-FR' },
  { label: 'USD – USA',           currency: 'USD', locale: 'en-US' },
  { label: 'GBP – UK',           currency: 'GBP', locale: 'en-GB' },
  { label: 'JPY – Japan',         currency: 'JPY', locale: 'ja-JP' },
]

interface SettingsStore {
  currency: string
  locale: string
  setCurrencyPreset: (currency: string, locale: string) => void
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      currency: 'CHF',
      locale: 'de-CH',
      setCurrencyPreset: (currency, locale) => set({ currency, locale }),
    }),
    { name: 'budget-app-settings' }
  )
)
