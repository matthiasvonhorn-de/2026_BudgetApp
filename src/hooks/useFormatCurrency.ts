import { useSettingsStore } from '@/store/useSettingsStore'

export function useFormatCurrency() {
  const { currency, locale } = useSettingsStore()
  return (amount: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount)
}
