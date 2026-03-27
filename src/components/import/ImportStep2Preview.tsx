'use client'

import { useImportStore } from '@/store/useImportStore'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft } from 'lucide-react'

export function ImportStep2Preview() {
  const fmt = useFormatCurrency()
  const { transactions, setStep } = useImportStore()

  const incomeCount = transactions.filter(t => t.amount > 0).length
  const expenseCount = transactions.filter(t => t.amount < 0).length
  const categorizedCount = transactions.filter(t => t.categoryId).length

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Zurück
        </Button>
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>{transactions.length} Transaktionen</span>
          <span className="text-emerald-600">{incomeCount} Einnahmen</span>
          <span className="text-destructive">{expenseCount} Ausgaben</span>
          <span className="text-primary">{categorizedCount} automatisch kategorisiert</span>
        </div>
        <Button className="ml-auto" onClick={() => setStep(3)}>
          Weiter zur Kategorisierung
        </Button>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <div className="max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted sticky top-0">
              <tr>
                <th className="text-left p-3 font-medium">Datum</th>
                <th className="text-left p-3 font-medium">Beschreibung</th>
                <th className="text-left p-3 font-medium">Empfänger/Auftraggeber</th>
                <th className="text-right p-3 font-medium">Betrag</th>
                <th className="text-left p-3 font-medium">Kategorie (auto)</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t, i) => (
                <tr key={i} className="border-t hover:bg-muted/30">
                  <td className="p-3 text-muted-foreground whitespace-nowrap">{formatDate(t.date)}</td>
                  <td className="p-3 max-w-[200px]">
                    <p className="truncate">{t.description}</p>
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">{t.payee ?? '—'}</td>
                  <td className={`p-3 text-right font-semibold ${t.amount < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                    {fmt(t.amount)}
                  </td>
                  <td className="p-3">
                    {t.categoryId ? (
                      <Badge variant="outline" className="text-xs">Auto</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
