'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Pencil } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import type { SavingsEntry } from '@/types/api'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

const FREQ_LABELS: Record<string, string> = {
  MONTHLY: 'Monatlich',
  QUARTERLY: 'Quartärlich',
  ANNUALLY: 'Jährlich',
}

const TYPE_LABELS: Record<string, string> = {
  SPARPLAN: 'Sparplan',
  FESTGELD: 'Festgeld',
}

export default function SavingsDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const qc = useQueryClient()
  const fmt = useFormatCurrency()

  const [viewYears, setViewYears] = useState<number | null>(5)

  const { data, isLoading } = useQuery({
    queryKey: ['savings', id],
    queryFn: () => fetch(`/api/savings/${id}`).then(r => r.json()),
  })

  // For unlimited plans: ensure schedule covers 24 months ahead (idempotent)
  const isUnlimited = data && !data.error && data.termMonths === null
  useEffect(() => {
    if (!isUnlimited) return
    fetch(`/api/savings/${id}/extend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ months: 24 }),
    }).then(r => r.json()).then(res => {
      if (res.added > 0) qc.invalidateQueries({ queryKey: ['savings', id] })
    })
  }, [isUnlimited, id, qc])

  const payMutation = useMutation({
    mutationFn: (paidUntil: string) =>
      fetch(`/api/savings/${id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paidUntil }),
      }).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json() }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['savings', id] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      toast.success(`${res.paid} Eintrag/Einträge gebucht`)
    },
    onError: () => toast.error('Fehler beim Buchen'),
  })

  const unPayMutation = useMutation({
    mutationFn: (entryId: string) =>
      fetch(`/api/savings/${id}/entries/${entryId}/pay`, { method: 'DELETE' })
        .then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['savings', id] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Buchung rückgängig gemacht')
    },
    onError: () => toast.error('Fehler'),
  })

  if (isLoading) return <div className="p-6 text-muted-foreground">Laden…</div>
  if (!data || data.error) {
    return (
      <div className="p-6">
        <p className="text-destructive">Sparkonto nicht gefunden.</p>
        <Button variant="ghost" onClick={() => router.push('/accounts')} className="mt-2">
          <ArrowLeft className="h-4 w-4 mr-2" /> Zurück
        </Button>
      </div>
    )
  }

  const cfg = data
  const account = cfg.account
  const entries: SavingsEntry[] = cfg.entries ?? []

  const visibleEntries = viewYears === null
    ? entries
    : (() => {
        const now = new Date()
        const from = new Date(now)
        from.setFullYear(from.getFullYear() - viewYears)
        const to = new Date(now)
        to.setFullYear(to.getFullYear() + viewYears)
        return entries.filter((e: SavingsEntry) => {
          const d = new Date(e.dueDate)
          return d >= from && d <= to
        })
      })()

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/accounts">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Konten
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{account.name}</h1>
          <p className="text-sm text-muted-foreground">
            {TYPE_LABELS[account.type]} · {(cfg.interestRate * 100).toFixed(2)} % p.a. ·{' '}
            Zinsen {FREQ_LABELS[cfg.interestFrequency]}
            {cfg.savingsType === 'SPARPLAN' && cfg.contributionAmount > 0 &&
              ` · ${fmt(cfg.contributionAmount)} ${FREQ_LABELS[cfg.contributionFrequency ?? 'MONTHLY']}`}
            {(cfg.upfrontFee ?? 0) > 0 && ` · Gebühr: ${fmt(cfg.upfrontFee)}`}
            {cfg.accountNumber && ` · ${cfg.accountNumber}`}
          </p>
        </div>
        <Link href={`/savings/${id}/edit`}>
          <Button variant="outline" size="sm">
            <Pencil className="h-4 w-4 mr-1" /> Bearbeiten
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground mb-1">Aktueller Saldo</p>
          <p className="text-xl font-bold">{fmt(account.currentBalance)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground mb-1">Zinsen gesamt (gebucht)</p>
          <p className="text-xl font-bold">{fmt(cfg.stats.totalInterestPaid)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground mb-1">Nächste Sparrate</p>
          <p className="text-xl font-bold">
            {cfg.stats.nextDueDate
              ? format(new Date(cfg.stats.nextDueDate), 'dd.MM.yyyy', { locale: de })
              : '—'}
          </p>
        </div>
      </div>

      {/* Zahlungsplan Header */}
      <div className="flex items-center gap-4 mb-3 flex-wrap">
        <h2 className="text-base font-semibold flex-1">Zahlungsplan</h2>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Anzeige:</span>
          {([1, 2, 5, 10] as const).map(y => (
            <button
              key={y}
              onClick={() => setViewYears(y)}
              className={`px-2 py-0.5 rounded text-xs border ${viewYears === y ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted'}`}
            >
              {y} J.
            </button>
          ))}
          <button
            onClick={() => setViewYears(null)}
            className={`px-2 py-0.5 rounded text-xs border ${viewYears === null ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted'}`}
          >
            Alle
          </button>
        </div>
      </div>

      {/* Tabelle */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left p-3 font-medium">Datum</th>
              <th className="text-left p-3 font-medium">Typ</th>
              <th className="text-right p-3 font-medium">Betrag</th>
              <th className="text-right p-3 font-medium">Saldo</th>
              <th className="p-3 font-medium text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {visibleEntries.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  Keine Einträge im gewählten Zeitraum.
                </td>
              </tr>
            )}
            {visibleEntries.map((entry: SavingsEntry) => {
              const isInterest = entry.entryType === 'INTEREST'
              const isFee = entry.entryType === 'FEE'
              const isPaid = entry.paidAt !== null
              // initialized = marked paid during account creation, no transaction record
              const isInitialized = isPaid && entry.transactionId === null
              return (
                <tr key={entry.id} className={`border-t ${isInterest ? 'bg-muted/20' : ''} ${isFee ? 'bg-red-50 dark:bg-red-950/20' : ''}`}>
                  <td className="p-3 text-muted-foreground">
                    {format(new Date(entry.dueDate), 'dd.MM.yyyy', { locale: de })}
                  </td>
                  <td className="p-3">
                    {isFee ? (
                      <span className="text-xs text-red-600 dark:text-red-400 font-medium">Gebühr</span>
                    ) : isInterest ? (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Zinsen</span>
                    ) : (
                      <span className="text-xs font-medium">Sparrate</span>
                    )}
                  </td>
                  <td className={`p-3 text-right ${isFee ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {entry.scheduledAmount < 0 ? '' : '+'}{fmt(entry.scheduledAmount)}
                  </td>
                  <td className="p-3 text-right font-mono text-xs">
                    {fmt(entry.scheduledBalance)}
                  </td>
                  <td className="p-3 text-right">
                    {isInitialized ? (
                      <span className="text-xs text-muted-foreground">
                        ✓ initialisiert
                      </span>
                    ) : isPaid ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs text-muted-foreground">
                          ✓ {isInterest ? 'automatisch' : 'gebucht'}
                        </span>
                        {!isInterest && (
                          <button
                            onClick={() => unPayMutation.mutate(entry.id)}
                            disabled={unPayMutation.isPending}
                            className="text-xs text-muted-foreground hover:text-destructive underline"
                          >
                            rückgängig
                          </button>
                        )}
                      </div>
                    ) : isInterest ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-xs px-2"
                        onClick={() => {
                          const d = format(new Date(entry.dueDate), 'yyyy-MM-dd')
                          payMutation.mutate(d)
                        }}
                        disabled={payMutation.isPending}
                      >
                        Bezahlen
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
