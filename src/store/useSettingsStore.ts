import { create } from 'zustand'

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
  _loaded: boolean
  setCurrencyPreset: (currency: string, locale: string) => void
  loadFromServer: () => Promise<void>
}

export const useSettingsStore = create<SettingsStore>()(
  (set) => ({
    currency: 'EUR',
    locale: 'de-DE',
    _loaded: false,

    setCurrencyPreset: (currency, locale) => {
      set({ currency, locale })
      // Persist to DB
      fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currency, locale }),
      })
    },

    loadFromServer: async () => {
      try {
        const res = await fetch('/api/settings')
        const data = await res.json()
        if (data.currency && data.locale) {
          set({ currency: data.currency, locale: data.locale, _loaded: true })
        } else {
          set({ _loaded: true })
        }
      } catch {
        set({ _loaded: true })
      }
    },
  })
)
