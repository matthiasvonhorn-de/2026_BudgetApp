'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useSettingsStore, CURRENCY_PRESETS } from '@/store/useSettingsStore'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, Plus, Pencil, Trash2 } from 'lucide-react'
import { AccountFormDialog } from '@/components/accounts/AccountFormDialog'
import { ACCOUNT_TYPE_LABELS } from '@/lib/utils'

export default function GeneralSettingsPage() {
  const { currency, locale, setCurrencyPreset } = useSettingsStore()
  const fmt = useFormatCurrency()
  const qc = useQueryClient()
  const [accountDialog, setAccountDialog] = useState<{ open: boolean; account?: any }>({ open: false })

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => fetch('/api/accounts').then(r => r.json()),
  })

  const deleteAccount = useMutation({
    mutationFn: (id: string) => fetch(`/api/accounts/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts'] }); toast.success('Konto gelöscht') },
    onError: () => toast.error('Fehler beim Löschen'),
  })

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Allgemein</h1>

      {/* Konten */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Konten</CardTitle>
            <Button size="sm" onClick={() => setAccountDialog({ open: true })}>
              <Plus className="h-4 w-4 mr-1" /> Konto hinzufügen
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Laden...</p>
          ) : accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Konten angelegt.</p>
          ) : accounts.map((a: any) => (
            <div key={a.id} className="flex items-center justify-between py-2 px-3 rounded-lg border">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: a.color }} />
                <div>
                  <p className="text-sm font-medium">{a.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {ACCOUNT_TYPE_LABELS[a.type] ?? a.type}{a.bank ? ` · ${a.bank}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-semibold tabular-nums ${a.currentBalance < 0 ? 'text-destructive' : ''}`}>
                  {fmt(a.currentBalance)}
                </span>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                  onClick={() => setAccountDialog({ open: true, account: a })}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  onClick={() => {
                    if (confirm(`Konto "${a.name}" löschen?`)) deleteAccount.mutate(a.id)
                  }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Währung */}
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
                  <span className="text-muted-foreground tabular-nums">
                    {new Intl.NumberFormat(preset.locale, { style: 'currency', currency: preset.currency }).format(1234.56)}
                  </span>
                  {isActive && <Check className="h-4 w-4 text-primary" />}
                </div>
              </button>
            )
          })}
          <p className="text-xs text-muted-foreground pt-2">
            Vorschau aktuell: <span className="font-semibold">{fmt(1234.56)}</span>
          </p>
        </CardContent>
      </Card>

      <AccountFormDialog
        open={accountDialog.open}
        onOpenChange={(open) => setAccountDialog({ open })}
        account={accountDialog.account}
      />
    </div>
  )
}
