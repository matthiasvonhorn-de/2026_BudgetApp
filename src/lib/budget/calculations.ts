import { useSettingsStore } from '@/store/useSettingsStore'

export function getAvailableBg(available: number): string {
  if (available > 0) return 'bg-emerald-50 text-emerald-700'
  if (available === 0) return 'bg-muted text-muted-foreground'
  return 'bg-red-50 text-destructive'
}

export function getMonthName(month: number, year: number): string {
  const { locale } = useSettingsStore.getState()
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1, 1)
  )
}
