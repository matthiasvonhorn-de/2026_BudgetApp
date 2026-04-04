'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { formatDate } from '@/lib/utils'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import { TransactionFormDialog } from '@/components/transactions/TransactionFormDialog'
import { toast } from 'sonner'

interface LoanPaymentRef {
  loanId: string
  periodNumber: number
  loan: { name: string }
}

export default function TransactionsPage() {
  const fmt = useFormatCurrency()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [pendingDelete, setPendingDelete] = useState<{ id: string; loanPayment: LoanPaymentRef } | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['transactions', debouncedSearch],
    queryFn: () => fetch(`/api/transactions?search=${encodeURIComponent(debouncedSearch)}&limit=10000`).then(r => r.json()),
  })

  const deleteMutation = useMutation({
    mutationFn: ({ id, revertLoan }: { id: string; revertLoan: boolean }) =>
      fetch(`/api/transactions/${id}?revertLoan=${revertLoan}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: (_, { revertLoan }) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      if (revertLoan) queryClient.invalidateQueries({ queryKey: ['loans'] })
      setPendingDelete(null)
      toast.success('Transaktion gelöscht')
    },
  })

  const handleDeleteClick = (t: any) => {
    if (t.loanPayment) {
      setPendingDelete({ id: t.id, loanPayment: t.loanPayment })
    } else {
      if (confirm('Transaktion löschen?')) deleteMutation.mutate({ id: t.id, revertLoan: false })
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Transaktionen</h1>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Neue Transaktion
        </Button>
      </div>

      <div className="mb-4">
        <Input
          placeholder="Suchen nach Beschreibung oder Empfänger..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left p-3 font-medium">Datum</th>
              <th className="text-left p-3 font-medium">Beschreibung</th>
              <th className="text-left p-3 font-medium">Konto</th>
              <th className="text-left p-3 font-medium">Kategorie</th>
              <th className="text-right p-3 font-medium">Betrag</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Laden...</td></tr>
            ) : transactions.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Keine Transaktionen gefunden</td></tr>
            ) : transactions.map((t: any) => (
              <tr key={t.id} className="border-t hover:bg-muted/50">
                <td className="p-3 text-muted-foreground whitespace-nowrap">{formatDate(t.date)}</td>
                <td className="p-3">
                  <p className="font-medium">{t.description}</p>
                  {t.payee && <p className="text-xs text-muted-foreground">{t.payee}</p>}
                </td>
                <td className="p-3">
                  {t.account && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.account.color }} />
                      <span className="text-xs">{t.account.name}</span>
                    </div>
                  )}
                </td>
                <td className="p-3">
                  {t.category ? (
                    <Badge variant="outline" style={{ borderColor: t.category.color, color: t.category.color }}>
                      {t.category.name}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </td>
                <td className={`p-3 text-right font-semibold whitespace-nowrap ${t.amount < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                  {fmt(t.amount)}
                </td>
                <td className="p-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive h-7 px-2"
                    onClick={() => handleDeleteClick(t)}
                    disabled={deleteMutation.isPending}
                  >
                    ×
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <TransactionFormDialog open={open} onOpenChange={setOpen} />

      {/* Dialog für Kreditraten-Transaktionen */}
      <Dialog open={!!pendingDelete} onOpenChange={v => !v && setPendingDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Transaktion löschen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Diese Transaktion wurde automatisch beim Buchen von{' '}
            <strong>Rate {pendingDelete?.loanPayment.periodNumber}</strong> des Kredits{' '}
            <strong>„{pendingDelete?.loanPayment.loan.name}"</strong> erstellt.
          </p>
          <p className="text-sm text-muted-foreground">
            Soll der Zahlungsstatus der Rate ebenfalls auf <strong>„Offen"</strong> zurückgesetzt werden?
          </p>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate({ id: pendingDelete!.id, revertLoan: true })}
              disabled={deleteMutation.isPending}
            >
              Transaktion löschen & Rate zurücksetzen
            </Button>
            <Button
              variant="outline"
              onClick={() => deleteMutation.mutate({ id: pendingDelete!.id, revertLoan: false })}
              disabled={deleteMutation.isPending}
            >
              Nur Transaktion löschen
            </Button>
            <Button variant="ghost" onClick={() => setPendingDelete(null)} disabled={deleteMutation.isPending}>
              Abbrechen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
