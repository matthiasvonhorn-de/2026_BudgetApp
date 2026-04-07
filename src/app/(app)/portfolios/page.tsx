'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { TrendingUp, Plus } from 'lucide-react'
import {
  LineChart, Line, ResponsiveContainer,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PortfolioDialog } from '@/components/portfolios/PortfolioDialog'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import type { PortfolioListItem } from '@/types/api'

export default function PortfoliosPage() {
  const fmt = useFormatCurrency()
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: portfolios = [], isLoading } = useQuery<PortfolioListItem[]>({
    queryKey: ['portfolios'],
    queryFn: () => fetch('/api/portfolios').then(r => r.json()),
  })

  const totalValue = portfolios.reduce((sum, p) => sum + (p.currentValue ?? 0), 0)

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">Aktiendepots</h1>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Neues Depot
        </Button>
      </div>

      {portfolios.length > 0 && (
        <p className="text-muted-foreground text-sm mb-6">
          Gesamtwert: <span className="font-semibold text-foreground">{fmt(totalValue)}</span>
        </p>
      )}

      {portfolios.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-64 text-center">
          <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">Keine Depots vorhanden</h2>
          <p className="text-muted-foreground text-sm mb-4">
            Lege dein erstes Depot an, um Kurswerte zu verfolgen.
          </p>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Neues Depot
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {portfolios.map((portfolio) => (
            <Link key={portfolio.id} href={`/portfolios/${portfolio.id}`}>
              <div className="rounded-xl border bg-card p-5 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="h-3 w-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: portfolio.color }}
                    />
                    <h3 className="font-semibold text-base truncate">{portfolio.name}</h3>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <p className="text-lg font-bold">
                      {portfolio.currentValue != null ? fmt(portfolio.currentValue) : '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">Aktueller Wert</p>
                  </div>
                </div>

                {portfolio.sparklineData.length > 1 ? (
                  <div className="h-12">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={portfolio.sparklineData}>
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke={portfolio.color}
                          strokeWidth={1.5}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-12 flex items-center">
                    <p className="text-xs text-muted-foreground">Noch keine Verlaufsdaten</p>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      <PortfolioDialog key={`portfolio-new-${dialogOpen ? 'open' : 'closed'}`} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}
