'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import type { Account } from '@/types/api'
import type { BookDialogState } from './types'

export function BookTransactionDialog({
  state, onClose, accounts, accountId, budgetYear, budgetMonth,
}: {
  state: BookDialogState
  onClose: () => void
  accounts: Account[]
  accountId: string
  budgetYear: number
  budgetMonth: number
}) {
  const qc = useQueryClient()
  const fmt = useFormatCurrency()
  const defaultDate = `${budgetYear}-${String(budgetMonth).padStart(2, '0')}-01`

  const [selAccountId, setSelAccountId] = useState(accountId)
  const [date, setDate] = useState(defaultDate)
  const [description, setDescription] = useState(state.cat?.name ?? '')
  const [amount, setAmount] = useState(state.cat ? Math.abs(state.cat.budgeted).toFixed(2) : '')

  const [skipSubAccountEntry, setSkipSubAccountEntry] = useState(false)
  const [skipPairedTransfer, setSkipPairedTransfer] = useState(false)

  const [lastCatId, setLastCatId] = useState<string | undefined>()
  if (state.open && state.cat && state.cat.id !== lastCatId) {
    setLastCatId(state.cat.id)
    setSelAccountId(accountId)
    setDate(defaultDate)
    setDescription(state.cat.name)
    setAmount(Math.abs(state.cat.budgeted).toFixed(2))
    setSkipSubAccountEntry(false)
    setSkipPairedTransfer(false)
  }

  const bookMutation = useMutation({
    mutationFn: () => {
      if (!state.cat) throw new Error()
      const raw = parseFloat(amount.replace(',', '.'))
      const mainAmount = state.cat.type === 'INCOME' ? Math.abs(raw) : -Math.abs(raw)
      return fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date, mainAmount, mainType: state.cat.type as 'INCOME' | 'EXPENSE' | 'TRANSFER',
          description,
          accountId: selAccountId,
          categoryId: state.cat.id,
          skipSubAccountEntry,
          skipPairedTransfer,
        }),
      }).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json() })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['account-budget'] })
      qc.invalidateQueries({ queryKey: ['budget'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      toast.success('Transaktion gebucht')
      onClose()
    },
    onError: () => toast.error('Fehler beim Buchen'),
  })

  if (!state.cat) return null
  const typeLabel = state.cat.type === 'INCOME' ? 'Einnahme' : state.cat.type === 'EXPENSE' ? 'Ausgabe' : 'Transfer'
  const typeColor = state.cat.type === 'INCOME' ? 'text-emerald-600' : state.cat.type === 'EXPENSE' ? 'text-destructive' : 'text-muted-foreground'

  return (
    <Dialog open={state.open} onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Planwert als Transaktion buchen</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 text-sm">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: state.cat.color }} />
            <span className="font-medium">{state.cat.name}</span>
            <span className={`ml-auto font-semibold tabular-nums ${typeColor}`}>
              {typeLabel} · {fmt(state.cat.budgeted)}
            </span>
          </div>
          <div className="space-y-1.5">
            <Label>Konto *</Label>
            <Select
              value={selAccountId}
              onValueChange={(v: string | null) => v && setSelAccountId(v)}
              items={accounts.map((a: Account) => ({ value: a.id, label: a.name }))}
              itemToStringLabel={(v: string) => accounts.find((a: Account) => a.id === v)?.name ?? v}
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a: Account) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Datum</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Beschreibung</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Beschreibung" />
          </div>
          <div className="space-y-1.5">
            <Label>Betrag</Label>
            <Input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          {state.cat.subAccountGroupId && (
            <div className="space-y-2 pt-2 border-t">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={skipSubAccountEntry}
                  onChange={e => {
                    setSkipSubAccountEntry(e.target.checked)
                    if (e.target.checked) setSkipPairedTransfer(true)
                    else setSkipPairedTransfer(false)
                  }}
                />
                <span>Unterkonto-Eintrag überspringen</span>
              </label>
              {state.cat.subAccountLinkType === 'TRANSFER' && (
                <label className={`flex items-center gap-2 text-sm select-none ${skipSubAccountEntry ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                  <input
                    type="checkbox"
                    checked={skipPairedTransfer}
                    disabled={skipSubAccountEntry}
                    onChange={e => setSkipPairedTransfer(e.target.checked)}
                  />
                  <span>Gegenbuchung überspringen</span>
                </label>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button
            onClick={() => bookMutation.mutate()}
            disabled={bookMutation.isPending || !selAccountId || !description.trim() || !amount}
          >
            {bookMutation.isPending ? 'Buchen...' : 'Transaktion buchen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
