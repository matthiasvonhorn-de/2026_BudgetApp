'use client'

import { useQuery } from '@tanstack/react-query'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import { getMonthName } from '@/lib/budget/calculations'
import { formatDate } from '@/lib/utils'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import type { Transaction } from '@/types/api'
import type { CategoryData } from './types'
import { amountColor } from './utils'

export function CategoryActivityDialog({
  open, onClose, cat, accountId, year, month,
}: {
  open: boolean
  onClose: () => void
  cat: CategoryData | undefined
  accountId: string
  year: number
  month: number
}) {
  const fmt = useFormatCurrency()
  const lastDay = new Date(year, month, 0).getDate()
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data: transactions = [], isLoading } = useQuery<Transaction[]>({
    queryKey: ['transactions-detail', accountId, cat?.id, year, month],
    queryFn: () =>
      fetch(`/api/transactions?accountId=${accountId}&categoryId=${cat!.id}&from=${from}&to=${to}`)
        .then(r => r.json().then(r => r.data)),
    enabled: open && !!cat,
  })

  if (!cat) return null

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
              {cat.name} — {getMonthName(month, year)}
            </div>
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1">
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Laden...</div>
          ) : transactions.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Keine Transaktionen in diesem Monat</div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-3 font-medium">Datum</th>
                    <th className="text-left p-3 font-medium">Beschreibung</th>
                    <th className="text-right p-3 font-medium">Betrag</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t: Transaction) => (
                    <tr key={t.id} className="border-t hover:bg-muted/50">
                      <td className="p-3 text-muted-foreground whitespace-nowrap">{formatDate(t.date)}</td>
                      <td className="p-3">
                        <p className="font-medium">{t.description}</p>
                        {t.payee && <p className="text-xs text-muted-foreground">{t.payee}</p>}
                      </td>
                      {(() => {
                        const displayAmt = (t.mainAmount ?? 0) + (t.subAmount ?? 0)
                        return (
                          <td className={`p-3 text-right font-semibold tabular-nums ${displayAmt < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                            {fmt(displayAmt)}
                          </td>
                        )
                      })()}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/50 font-semibold">
                    <td colSpan={2} className="p-3 text-right text-sm text-muted-foreground">Summe</td>
                    <td className={`p-3 text-right tabular-nums ${amountColor(cat.activity)}`}>
                      {fmt(cat.activity)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
