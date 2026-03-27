'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import { useSettingsStore } from '@/store/useSettingsStore'
import { CheckCircle2 } from 'lucide-react'

interface Props {
  accountId: string
  accountName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ReconcileDialog({ accountId, accountName, open, onOpenChange }: Props) {
  const fmt = useFormatCurrency()
  const { currency } = useSettingsStore()
  const queryClient = useQueryClient()
  const [statementBalance, setStatementBalance] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions-reconcile', accountId],
    queryFn: () => fetch(`/api/transactions?accountId=${accountId}&limit=500`).then(r => r.json()),
    enabled: open,
  })

  const pendingTransactions = transactions.filter((t: any) => t.status !== 'RECONCILED')

  const clearedSum = pendingTransactions
    .filter((t: any) => selectedIds.has(t.id))
    .reduce((sum: number, t: any) => sum + t.amount, 0)

  const target = parseFloat(statementBalance.replace(',', '.')) || 0
  const difference = target - clearedSum

  const toggleAll = () => {
    if (selectedIds.size === pendingTransactions.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(pendingTransactions.map((t: any) => t.id)))
    }
  }

  const toggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const mutation = useMutation({
    mutationFn: () =>
      fetch(`/api/accounts/${accountId}/reconcile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statementBalance: target,
          clearedTransactionIds: Array.from(selectedIds),
        }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      toast.success('Kontoabgleich abgeschlossen')
      onOpenChange(false)
    },
    onError: () => toast.error('Fehler beim Kontoabgleich'),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Kontoabgleich: {accountName}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-4 items-end mb-4">
          <div className="flex-1">
            <Label>Kontostand laut Auszug ({currency})</Label>
            <Input
              type="number"
              step="0.01"
              value={statementBalance}
              onChange={e => setStatementBalance(e.target.value)}
              placeholder="z.B. 2500.00"
              className="mt-1"
            />
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Ausgewählt</p>
            <p className="font-semibold">{fmt(clearedSum)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Differenz</p>
            <p className={`font-semibold ${Math.abs(difference) < 0.01 ? 'text-emerald-600' : 'text-destructive'}`}>
              {fmt(difference)}
            </p>
          </div>
        </div>

        {Math.abs(difference) < 0.01 && statementBalance && (
          <div className="flex items-center gap-2 p-2 bg-emerald-50 text-emerald-700 rounded text-sm mb-2">
            <CheckCircle2 className="h-4 w-4" />
            Alles stimmt überein!
          </div>
        )}

        <div className="flex-1 overflow-y-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-muted sticky top-0">
              <tr>
                <th className="p-2 w-8">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === pendingTransactions.length && pendingTransactions.length > 0}
                    onChange={toggleAll}
                  />
                </th>
                <th className="text-left p-2 font-medium">Datum</th>
                <th className="text-left p-2 font-medium">Beschreibung</th>
                <th className="text-right p-2 font-medium">Betrag</th>
                <th className="p-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {pendingTransactions.length === 0 ? (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Keine ausstehenden Transaktionen</td></tr>
              ) : pendingTransactions.map((t: any) => (
                <tr
                  key={t.id}
                  className={`border-t cursor-pointer ${selectedIds.has(t.id) ? 'bg-blue-50' : 'hover:bg-muted/50'}`}
                  onClick={() => toggle(t.id)}
                >
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(t.id)}
                      onChange={() => toggle(t.id)}
                      onClick={e => e.stopPropagation()}
                    />
                  </td>
                  <td className="p-2 text-muted-foreground">{formatDate(t.date)}</td>
                  <td className="p-2">{t.description}</td>
                  <td className={`p-2 text-right font-medium ${t.amount < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                    {fmt(t.amount)}
                  </td>
                  <td className="p-2 text-center">
                    <Badge variant={t.status === 'CLEARED' ? 'default' : 'secondary'} className="text-xs">
                      {t.status === 'CLEARED' ? 'Gebucht' : 'Ausstehend'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!statementBalance || mutation.isPending || Math.abs(difference) >= 0.01}
          >
            {mutation.isPending ? 'Abgleichen...' : 'Abgleich abschliessen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
