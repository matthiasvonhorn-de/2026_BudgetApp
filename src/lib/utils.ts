import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { useSettingsStore } from '@/store/useSettingsStore'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

function getSettings() {
  return useSettingsStore.getState()
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat(getSettings().locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  CHECKING: 'Girokonto',
  SAVINGS: 'Sparkonto',
  CREDIT_CARD: 'Kreditkarte',
  CASH: 'Bargeld',
  INVESTMENT: 'Depot',
  SPARPLAN: 'Sparplan',
  FESTGELD: 'Festgeld',
}
