'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Landmark, Plus } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AssetDialog } from '@/components/assets/AssetDialog'
import { ASSET_TYPE_ICONS } from '@/components/assets/icon-map'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import type { AssetListItem } from '@/types/api'

type TimeFilter = '3M' | '6M' | '1J' | 'Gesamt'

const TIME_FILTERS: { label: TimeFilter; months: number }[] = [
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '1J', months: 12 },
  { label: 'Gesamt', months: 0 },
]

function buildAggregateChart(assets: AssetListItem[], months: number) {
  const dateMap = new Map<string, number>()
  for (const asset of assets) {
    const factor = asset.ownershipPercent / 100
    for (const pt of asset.sparklineData) {
      dateMap.set(pt.date, (dateMap.get(pt.date) ?? 0) + pt.value * factor)
    }
  }
  let entries = [...dateMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }))

  if (months > 0) {
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - months)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    entries = entries.filter(e => e.date >= cutoffStr)
  }

  return entries
}

export default function AssetsPage() {
  const fmt = useFormatCurrency()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('Gesamt')

  const { data: assets = [], isLoading, isError } = useQuery<AssetListItem[]>({
    queryKey: ['assets'],
    queryFn: () => fetch('/api/assets').then(r => r.json()),
  })

  const totalValue = assets.reduce(
    (sum, a) => sum + (a.currentValue ?? 0) * (a.ownershipPercent / 100),
    0,
  )

  const totalPurchase = assets.reduce(
    (sum, a) => sum + a.purchasePrice * (a.ownershipPercent / 100),
    0,
  )

  const totalGain = totalValue - totalPurchase
  const totalGainPct = totalPurchase > 0 ? (totalGain / totalPurchase) * 100 : 0

  const activeMonths = TIME_FILTERS.find(f => f.label === timeFilter)?.months ?? 0
  const chartData = buildAggregateChart(assets, activeMonths)

  if (isError) {
    return (
      <div className="p-6">
        <div className="text-sm text-destructive p-4">Fehler beim Laden der Daten</div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        <Skeleton className="h-24 w-full rounded-xl" />
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
        <h1 className="text-2xl font-bold">Sachwerte</h1>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Neuer Sachwert
        </Button>
      </div>

      {assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-64 text-center">
          <Landmark className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">Keine Sachwerte vorhanden</h2>
          <p className="text-muted-foreground text-sm mb-4">
            Lege deinen ersten Sachwert an, um Werte zu verfolgen.
          </p>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Neuer Sachwert
          </Button>
        </div>
      ) : (
        <>
          {/* Summary card */}
          <div className="rounded-xl border bg-card p-5 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Gesamtwert (anteilig)</p>
                <p className="text-3xl font-bold">{fmt(totalValue)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground mb-1">Gewinn / Verlust</p>
                <p className={`text-lg font-semibold ${totalGain >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                  {totalGain >= 0 ? '+' : ''}{fmt(totalGain)} ({totalGainPct >= 0 ? '+' : ''}{totalGainPct.toFixed(1)}%)
                </p>
              </div>
            </div>
          </div>

          {/* Aggregate chart */}
          {chartData.length > 1 && (
            <div className="rounded-xl border bg-card p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-sm">Gesamtverlauf</h2>
                <div className="flex gap-1">
                  {TIME_FILTERS.map(f => (
                    <Button
                      key={f.label}
                      variant={timeFilter === f.label ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setTimeFilter(f.label)}
                    >
                      {f.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={v => fmt(v)} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={90} />
                    <Tooltip formatter={(v) => typeof v === 'number' ? fmt(v) : v} />
                    <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={chartData.length <= 30} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Asset cards grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {assets.map((asset) => {
              const Icon = ASSET_TYPE_ICONS[asset.assetType.icon] ?? ASSET_TYPE_ICONS.Package
              const ownValue = (asset.currentValue ?? 0) * (asset.ownershipPercent / 100)
              const ownPurchase = asset.purchasePrice * (asset.ownershipPercent / 100)
              const gain = ownValue - ownPurchase
              const gainPct = ownPurchase > 0 ? (gain / ownPurchase) * 100 : 0
              const sparkline = asset.sparklineData.map(d => ({
                ...d,
                value: d.value * (asset.ownershipPercent / 100),
              }))

              return (
                <Link key={asset.id} href={`/assets/${asset.id}`}>
                  <div className="rounded-xl border bg-card p-5 hover:shadow-md transition-shadow cursor-pointer">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="flex items-center justify-center h-8 w-8 rounded-lg flex-shrink-0"
                          style={{ backgroundColor: asset.color + '20', color: asset.color }}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-base truncate">{asset.name}</h3>
                          <p className="text-xs text-muted-foreground">{asset.assetType.name}</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <p className="text-lg font-bold">
                          {asset.currentValue != null ? fmt(ownValue) : '—'}
                        </p>
                        {asset.ownershipPercent < 100 && (
                          <p className="text-xs text-muted-foreground">{asset.ownershipPercent}% Anteil</p>
                        )}
                      </div>
                    </div>

                    {asset.currentValue != null && (
                      <p className={`text-xs font-medium mb-2 ${gain >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                        {gain >= 0 ? '+' : ''}{fmt(gain)} ({gainPct >= 0 ? '+' : ''}{gainPct.toFixed(1)}%)
                      </p>
                    )}

                    {sparkline.length > 1 ? (
                      <div className="h-12">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={sparkline}>
                            <Line
                              type="monotone"
                              dataKey="value"
                              stroke={asset.color}
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
              )
            })}
          </div>
        </>
      )}

      <AssetDialog key={`asset-new-${dialogOpen ? 'open' : 'closed'}`} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}
