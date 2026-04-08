'use client'

import Link from 'next/link'
import { useSettingsStore, CURRENCY_PRESETS } from '@/store/useSettingsStore'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, ArrowLeft } from 'lucide-react'

export default function GeneralSettingsPage() {
  const { currency, locale, setCurrencyPreset } = useSettingsStore()
  const fmt = useFormatCurrency()

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/settings">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zurück
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Allgemein</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Währung & Zahlenformat</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {CURRENCY_PRESETS.map(preset => {
            const isActive = preset.currency === currency && preset.locale === locale
            return (
              <button
                key={`${preset.currency}-${preset.locale}`}
                onClick={() => setCurrencyPreset(preset.currency, preset.locale)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border text-sm transition-colors ${
                  isActive ? 'border-primary bg-primary/5 font-medium' : 'border-border hover:bg-muted'
                }`}
              >
                <span>{preset.label}</span>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground tabular-nums" suppressHydrationWarning>
                    {new Intl.NumberFormat(preset.locale, { style: 'currency', currency: preset.currency }).format(1234.56)}
                  </span>
                  {isActive && <Check className="h-4 w-4 text-primary" />}
                </div>
              </button>
            )
          })}
          <p className="text-xs text-muted-foreground pt-2">
            Vorschau aktuell: <span className="font-semibold" suppressHydrationWarning>{fmt(1234.56)}</span>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
