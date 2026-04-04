'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { TrendingDown, Calendar, Euro, Percent } from 'lucide-react'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import { formatDate } from '@/lib/utils'
import type { Loan } from '@/types/api'

const TYPE_LABELS: Record<string, string> = {
  ANNUITAETENDARLEHEN: 'Annuitätendarlehen',
  RATENKREDIT: 'Ratenkredit',
}

export default function LoansPage() {
  const fmt = useFormatCurrency()

  const { data: loans = [], isLoading } = useQuery({
    queryKey: ['loans'],
    queryFn: () => fetch('/api/loans').then(r => r.json()),
  })

  if (isLoading) {
    return (
      <div className="p-6 space-y-3">
        {[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />)}
      </div>
    )
  }

  if (loans.length === 0) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-64 text-center">
        <TrendingDown className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold mb-2">Keine Kredite vorhanden</h2>
        <p className="text-muted-foreground text-sm mb-4">
          Kredite können in den Einstellungen angelegt werden.
        </p>
        <Link
          href="/settings/loans"
          className="text-primary hover:underline text-sm font-medium"
        >
          → Einstellungen / Bankkredite
        </Link>
      </div>
    )
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Bankkredite</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {loans.map((loan: Loan) => {
          const stats = loan.stats!
          const progress = loan.termMonths > 0
            ? Math.round((stats.periodsPaid / stats.totalPeriods) * 100)
            : 0
          const nextDue = stats.nextDueDate
            ? formatDate(stats.nextDueDate)
            : '—'

          return (
            <Link key={loan.id} href={`/loans/${loan.id}`}>
              <div className="rounded-xl border bg-card p-5 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-base">{loan.name}</h3>
                    <p className="text-xs text-muted-foreground">{TYPE_LABELS[loan.loanType]}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-destructive">{fmt(stats.remainingBalance)}</p>
                    <p className="text-xs text-muted-foreground">Restschuld</p>
                  </div>
                </div>

                {/* Fortschrittsbalken */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>{stats.periodsPaid} von {stats.totalPeriods} Raten</span>
                    <span>{progress} %</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Kennzahlen */}
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Euro className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-muted-foreground">Zinsen bezahlt</p>
                      <p className="font-semibold text-destructive">{fmt(stats.totalInterestPaid)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Percent className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-muted-foreground">Zinssatz</p>
                      <p className="font-semibold">{(loan.interestRate * 100).toFixed(3)} %</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-muted-foreground">Nächste Rate</p>
                      <p className="font-semibold">{nextDue}</p>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
