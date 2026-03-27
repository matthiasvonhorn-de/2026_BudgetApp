'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { ArrowLeft, Check, X, TrendingDown } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import { formatDate } from '@/lib/utils'
import { toast } from 'sonner'

interface LoanPayment {
  id: string
  periodNumber: number
  dueDate: string
  scheduledPrincipal: number
  scheduledInterest: number
  scheduledBalance: number
  extraPayment: number
  paidAt: string | null
  transactionId: string | null
  notes: string | null
}

interface CategoryGroup {
  id: string
  name: string
  categories: { id: string; name: string; color: string; type: string }[]
}

interface LoanDetail {
  id: string
  name: string
  loanType: string
  principal: number
  interestRate: number
  initialRepaymentRate: number
  termMonths: number
  startDate: string
  monthlyPayment: number
  notes: string | null
  accountId: string | null
  categoryId: string | null
  account: { id: string; name: string; color: string } | null
  payments: LoanPayment[]
  stats: {
    totalInterestPaid: number
    totalPrincipalPaid: number
    remainingBalance: number
    periodsPaid: number
    totalPeriods: number
  }
}

interface EditState {
  period: number
  extraPayment: string
}

function amtCls(v: number) {
  return v < 0 ? 'text-destructive' : v > 0 ? 'text-emerald-600' : 'text-muted-foreground'
}

export default function LoanDetailPage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const fmt = useFormatCurrency()

  const [editState, setEditState] = useState<EditState | null>(null)
  const [pendingPaid, setPendingPaid] = useState<{ period: number; paid: boolean } | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState('')

  const { data: loan, isLoading } = useQuery<LoanDetail>({
    queryKey: ['loan', id],
    queryFn: () => fetch(`/api/loans/${id}`).then(r => r.json()),
  })

  const { data: categoryData } = useQuery<{ groups: CategoryGroup[] }>({
    queryKey: ['categories'],
    queryFn: () => fetch('/api/categories').then(r => r.json()),
    enabled: !!pendingPaid,
  })

  const paymentMutation = useMutation({
    mutationFn: ({ period, paid, extraPayment, categoryId }: { period: number; paid?: boolean; extraPayment?: number; categoryId?: string }) =>
      fetch(`/api/loans/${id}/payments/${period}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paid, extraPayment, categoryId }),
      }).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loan', id] })
      qc.invalidateQueries({ queryKey: ['loans'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      setEditState(null)
      setPendingPaid(null)
    },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  const handleTogglePaid = (period: number, paid: boolean) => {
    // Wenn Konto verknüpft, aber noch keine Buchungskategorie gesetzt → nachfragen
    if (paid && loan?.accountId && !loan.categoryId) {
      setSelectedCategoryId('')
      setPendingPaid({ period, paid })
    } else {
      paymentMutation.mutate({ period, paid })
    }
  }

  const confirmCategory = () => {
    if (!pendingPaid) return
    paymentMutation.mutate({
      period: pendingPaid.period,
      paid: pendingPaid.paid,
      categoryId: selectedCategoryId || undefined,
    })
  }

  const saveExtra = (period: number) => {
    const val = parseFloat((editState?.extraPayment ?? '0').replace(',', '.'))
    if (isNaN(val) || val < 0) { toast.error('Ungültiger Betrag'); return }
    paymentMutation.mutate({ period, extraPayment: val })
  }

  if (isLoading) {
    return <div className="p-6 space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-8 bg-muted rounded animate-pulse" />)}</div>
  }
  if (!loan || (loan as any).error) {
    return <div className="p-6 text-muted-foreground">Kredit nicht gefunden.</div>
  }

  const payments = loan.payments ?? []
  const totalInterestScheduled = payments.reduce((s, p) => s + p.scheduledInterest, 0)
  const TYPE_LABEL = loan.loanType === 'ANNUITAETENDARLEHEN' ? 'Annuitätendarlehen' : 'Ratenkredit'
  const progress = loan.stats.totalPeriods > 0
    ? Math.round((loan.stats.periodsPaid / loan.stats.totalPeriods) * 100)
    : 0

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b bg-card">
        <Link href="/loans">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Kredite
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <TrendingDown className="h-5 w-5 text-destructive" />
          <h1 className="text-xl font-bold">{loan.name}</h1>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{TYPE_LABEL}</span>
          {loan.account && (
            <span
              className="text-xs px-2 py-0.5 rounded font-medium"
              style={{ backgroundColor: loan.account.color + '22', color: loan.account.color }}
            >
              {loan.account.name}
            </span>
          )}
        </div>
      </div>

      {/* Kennzahlen-Karten */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-6 py-4 bg-card border-b">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Darlehensbetrag</p>
          <p className="text-lg font-bold">{fmt(loan.principal)}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">
            {loan.loanType === 'ANNUITAETENDARLEHEN' ? 'Restschuld nach Laufzeit' : 'Restschuld'}
          </p>
          <p className="text-lg font-bold text-destructive">{fmt(loan.stats.remainingBalance)}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Zinsen bezahlt</p>
          <p className="text-lg font-bold text-amber-600">{fmt(loan.stats.totalInterestPaid)}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Zinsen gesamt (geplant)</p>
          <p className="text-lg font-bold text-muted-foreground">{fmt(totalInterestScheduled)}</p>
        </div>
      </div>

      {/* Fortschritt */}
      <div className="px-6 py-3 border-b bg-card">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>{loan.stats.periodsPaid} von {loan.stats.totalPeriods} Raten bezahlt</span>
          <span>
            {progress} % · {(loan.interestRate * 100).toFixed(3)} % Zins
            {loan.loanType === 'ANNUITAETENDARLEHEN' && loan.initialRepaymentRate > 0
              ? ` + ${(loan.initialRepaymentRate * 100).toFixed(3)} % Tilg.`
              : ''}
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Tilgungsplan */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-muted z-10">
            <tr>
              <th className="text-right px-3 py-2 font-semibold border border-border w-14">#</th>
              <th className="text-left px-3 py-2 font-semibold border border-border w-28">Datum</th>
              <th className="text-right px-3 py-2 font-semibold border border-border w-32">Rate</th>
              <th className="text-right px-3 py-2 font-semibold border border-border w-32">Zinsen</th>
              <th className="text-right px-3 py-2 font-semibold border border-border w-32">Tilgung</th>
              <th className="text-right px-3 py-2 font-semibold border border-border w-36">Sondertilgung</th>
              <th className="text-right px-3 py-2 font-semibold border border-border w-36">Restschuld</th>
              <th className="px-3 py-2 border border-border w-24 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {payments.map(p => {
              const isPaid = p.paidAt !== null
              const isEditing = editState?.period === p.periodNumber
              const totalRate = p.scheduledPrincipal + p.scheduledInterest
              const dueDate = formatDate(p.dueDate)

              return (
                <tr
                  key={p.periodNumber}
                  className={`border-t border-border ${isPaid ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : 'hover:bg-muted/20'}`}
                >
                  <td className={`px-3 py-1.5 border border-border text-right text-xs font-mono ${isPaid ? 'text-muted-foreground line-through' : ''}`}>
                    {p.periodNumber}
                  </td>
                  <td className={`px-3 py-1.5 border border-border text-xs ${isPaid ? 'text-muted-foreground' : ''}`}>
                    {dueDate}
                  </td>
                  <td className="px-3 py-1.5 border border-border text-right tabular-nums">
                    {loan.loanType === 'ANNUITAETENDARLEHEN'
                      ? fmt(totalRate)
                      : fmt(totalRate)
                    }
                  </td>
                  <td className="px-3 py-1.5 border border-border text-right tabular-nums text-amber-600">
                    {fmt(p.scheduledInterest)}
                  </td>
                  <td className="px-3 py-1.5 border border-border text-right tabular-nums text-emerald-600">
                    {fmt(p.scheduledPrincipal)}
                  </td>

                  {/* Sondertilgung — inline editierbar */}
                  <td className="px-2 py-1 border border-border text-right">
                    {isEditing ? (
                      <div className="flex items-center gap-1 justify-end">
                        <Input
                          autoFocus
                          type="number"
                          min="0"
                          step="100"
                          value={editState.extraPayment}
                          onChange={e => setEditState(s => s ? { ...s, extraPayment: e.target.value } : null)}
                          className="h-7 w-28 text-right text-xs"
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveExtra(p.periodNumber)
                            if (e.key === 'Escape') setEditState(null)
                          }}
                        />
                        <Button
                          variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0"
                          onClick={() => saveExtra(p.periodNumber)}
                          disabled={paymentMutation.isPending}
                        >
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0"
                          onClick={() => setEditState(null)}
                        >
                          <X className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        className="w-full text-right hover:bg-primary/10 rounded px-1 transition-colors min-h-[28px] flex items-center justify-end"
                        onClick={() => setEditState({ period: p.periodNumber, extraPayment: p.extraPayment.toString() })}
                        title="Klicken für Sondertilgung"
                      >
                        {p.extraPayment > 0
                          ? <span className="font-semibold text-primary tabular-nums">{fmt(p.extraPayment)}</span>
                          : <span className="text-muted-foreground text-xs">—</span>
                        }
                      </button>
                    )}
                  </td>

                  <td className="px-3 py-1.5 border border-border text-right tabular-nums font-semibold">
                    <span className={amtCls(p.scheduledBalance)}>{fmt(p.scheduledBalance)}</span>
                    {p.extraPayment > 0 && (
                      <span className="ml-1 text-xs text-primary">
                        (nach ST: {fmt(p.scheduledBalance)})
                      </span>
                    )}
                  </td>

                  {/* Status — klickbar zum Markieren */}
                  <td className="px-2 py-1 border border-border text-center">
                    <button
                      onClick={() => handleTogglePaid(p.periodNumber, !isPaid)}
                      disabled={paymentMutation.isPending}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                        isPaid
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900 dark:text-emerald-300'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                      title={isPaid
                        ? p.transactionId ? 'Als offen markieren (Transaktion wird storniert)' : 'Als offen markieren'
                        : 'Als bezahlt markieren'}
                    >
                      {isPaid ? '✓ Bezahlt' : 'Offen'}
                    </button>
                    {isPaid && p.transactionId && (
                      <div className="text-[10px] text-emerald-600 mt-0.5">gebucht</div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>

          {/* Summenzeile */}
          <tfoot>
            <tr className="bg-muted font-semibold border-t-2 border-border">
              <td colSpan={2} className="px-3 py-2 border border-border text-xs text-muted-foreground">Gesamt</td>
              <td className="px-3 py-2 border border-border text-right tabular-nums">
                {fmt(payments.reduce((s, p) => s + p.scheduledPrincipal + p.scheduledInterest, 0))}
              </td>
              <td className="px-3 py-2 border border-border text-right tabular-nums text-amber-600">
                {fmt(totalInterestScheduled)}
              </td>
              <td className="px-3 py-2 border border-border text-right tabular-nums text-emerald-600">
                {fmt(payments.reduce((s, p) => s + p.scheduledPrincipal, 0))}
              </td>
              <td className="px-3 py-2 border border-border text-right tabular-nums text-primary">
                {fmt(payments.reduce((s, p) => s + p.extraPayment, 0))}
              </td>
              <td colSpan={2} className="px-3 py-2 border border-border" />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="px-4 py-1.5 border-t text-xs text-muted-foreground bg-card">
        Klick auf &quot;Sondertilgung&quot;-Spalte zum Eingeben · Klick auf Status zum Markieren
      </div>

      {/* Kategorie-Dialog bei erster Buchung */}
      <Dialog open={!!pendingPaid} onOpenChange={v => !v && setPendingPaid(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Buchungskategorie wählen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Welche Kategorie soll für Kreditraten-Buchungen bei <strong>{loan?.name}</strong> verwendet werden?
            Diese Einstellung wird dauerhaft gespeichert.
          </p>
          <Select value={selectedCategoryId} onValueChange={(v) => v !== null && setSelectedCategoryId(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Kategorie wählen (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Keine Kategorie</SelectItem>
              {categoryData?.groups.map(group => (
                <div key={group.id}>
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">{group.name}</div>
                  {group.categories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <span className="flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                        {cat.name}
                      </span>
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingPaid(null)}>Abbrechen</Button>
            <Button onClick={confirmCategory} disabled={paymentMutation.isPending}>
              Speichern &amp; Buchen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
