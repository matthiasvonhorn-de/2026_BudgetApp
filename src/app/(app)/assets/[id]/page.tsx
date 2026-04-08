'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Pencil, Trash2, Plus, Check, X } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import { formatDate } from '@/lib/utils'
import { ASSET_TYPE_ICONS } from '@/components/assets/icon-map'
import { AssetDialog } from '@/components/assets/AssetDialog'
import type { AssetDetail, AssetValueEntry } from '@/types/api'

const TODAY = new Date().toISOString().slice(0, 10)

type TimeFilter = '3M' | '6M' | '1J' | 'Gesamt'

const TIME_FILTERS: { label: TimeFilter; months: number }[] = [
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '1J', months: 12 },
  { label: 'Gesamt', months: 0 },
]

function filterByMonths(entries: AssetValueEntry[], months: number): AssetValueEntry[] {
  if (months === 0) return entries
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  return entries.filter(e => new Date(e.date) >= cutoff)
}

interface AddRowState {
  date: string
  value: string
  notes: string
}

interface EditRowState {
  id: string
  date: string
  value: string
  notes: string
}

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const fmt = useFormatCurrency()

  const [timeFilter, setTimeFilter] = useState<TimeFilter>('Gesamt')
  const [addRow, setAddRow] = useState<AddRowState | null>(null)
  const [editRow, setEditRow] = useState<EditRowState | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)

  const { data: asset, isLoading, isError } = useQuery<AssetDetail>({
    queryKey: ['assets', id],
    queryFn: () => fetch(`/api/assets/${id}`).then(r => r.json()),
  })

  const createMutation = useMutation({
    mutationFn: async (body: { date: string; value: number; notes: string | null }) => {
      const res = await fetch(`/api/assets/${id}/values`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] })
      toast.success('Wertstand hinzugefügt')
      setAddRow(null)
    },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ valueId, body }: { valueId: string; body: { date: string; value: number; notes: string | null } }) => {
      const res = await fetch(`/api/assets/${id}/values/${valueId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] })
      toast.success('Wertstand aktualisiert')
      setEditRow(null)
    },
    onError: () => toast.error('Fehler beim Aktualisieren'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (valueId: string) => {
      const res = await fetch(`/api/assets/${id}/values/${valueId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] })
      toast.success('Wertstand gelöscht')
    },
    onError: () => toast.error('Fehler beim Löschen'),
  })

  if (isError) {
    return (
      <div className="p-6">
        <div className="text-sm text-destructive p-4">Fehler beim Laden der Daten</div>
      </div>
    )
  }

  if (isLoading || !asset) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  const Icon = ASSET_TYPE_ICONS[asset.assetType.icon] ?? ASSET_TYPE_ICONS.Package
  const factor = asset.ownershipPercent / 100

  const valuesSorted = [...asset.values].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )

  const activeMonths = TIME_FILTERS.find(f => f.label === timeFilter)?.months ?? 0
  const filteredValues = filterByMonths(valuesSorted, activeMonths)
  const chartData = [...filteredValues].reverse().map(v => ({
    date: formatDate(v.date),
    value: v.value * factor,
  }))

  const currentValue = valuesSorted[0]?.value ?? null
  const ownValue = currentValue != null ? currentValue * factor : null
  const ownPurchase = asset.purchasePrice * factor
  const gain = ownValue != null ? ownValue - ownPurchase : null
  const gainPct = gain != null && ownPurchase > 0 ? (gain / ownPurchase) * 100 : null

  const handleSaveAdd = () => {
    if (!addRow) return
    const value = parseFloat(addRow.value.replace(',', '.'))
    if (isNaN(value) || !addRow.date) {
      toast.error('Bitte Datum und Wert angeben')
      return
    }
    createMutation.mutate({
      date: addRow.date,
      value,
      notes: addRow.notes.trim() || null,
    })
  }

  const handleSaveEdit = () => {
    if (!editRow) return
    const value = parseFloat(editRow.value.replace(',', '.'))
    if (isNaN(value) || !editRow.date) {
      toast.error('Bitte Datum und Wert angeben')
      return
    }
    updateMutation.mutate({
      valueId: editRow.id,
      body: {
        date: editRow.date,
        value,
        notes: editRow.notes.trim() || null,
      },
    })
  }

  const handleDeleteValue = (entry: AssetValueEntry) => {
    if (confirm(`Wertstand vom ${formatDate(entry.date)} löschen?`)) {
      deleteMutation.mutate(entry.id)
    }
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/assets">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zurück
          </Button>
        </Link>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span
            className="flex items-center justify-center h-8 w-8 rounded-lg flex-shrink-0"
            style={{ backgroundColor: asset.color + '20', color: asset.color }}
          >
            <Icon className="h-4 w-4" />
          </span>
          <h1 className="text-2xl font-bold truncate">{asset.name}</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(true)}>
          <Pencil className="h-4 w-4 mr-1" /> Bearbeiten
        </Button>
      </div>

      {/* Info row */}
      <div className="flex flex-wrap items-center gap-3 mb-4 text-sm text-muted-foreground">
        <span className="bg-muted px-2 py-0.5 rounded text-xs font-medium">{asset.assetType.name}</span>
        <span>Kaufdatum: {formatDate(asset.purchaseDate)}</span>
        {asset.ownershipPercent < 100 && (
          <span>Anteil: {asset.ownershipPercent}%</span>
        )}
      </div>

      {asset.notes && (
        <p className="text-muted-foreground text-sm mb-4">{asset.notes}</p>
      )}

      {/* Value card */}
      <div className="rounded-xl border bg-card p-5 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Aktueller Wert {asset.ownershipPercent < 100 ? '(anteilig)' : ''}</p>
            <p className="text-3xl font-bold">
              {ownValue != null ? fmt(ownValue) : '—'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground mb-1">Kaufpreis {asset.ownershipPercent < 100 ? '(anteilig)' : ''}</p>
            <p className="text-lg font-medium">{fmt(ownPurchase)}</p>
            {gain != null && (
              <p className={`text-sm font-semibold ${gain >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                {gain >= 0 ? '+' : ''}{fmt(gain)} ({gainPct != null ? `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%` : ''})
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 1 && (
        <div className="rounded-xl border bg-card p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm">Wertverlauf</h2>
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
                <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={90} />
                <Tooltip formatter={(v) => typeof v === 'number' ? fmt(v) : v} />
                <Line type="monotone" dataKey="value" stroke={asset.color} strokeWidth={2} dot={chartData.length <= 30} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Value Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold">Wertstände</h2>
          <Button
            size="sm"
            onClick={() => {
              setAddRow({ date: TODAY, value: '', notes: '' })
              setEditRow(null)
            }}
            disabled={!!addRow}
          >
            <Plus className="h-4 w-4 mr-1" /> Neuer Wertstand
          </Button>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left p-3 font-medium">Datum</th>
              <th className="text-right p-3 font-medium">Gesamtwert</th>
              <th className="text-right p-3 font-medium">Anteilig</th>
              <th className="text-left p-3 font-medium">Notiz</th>
              <th className="p-3 w-20" />
            </tr>
          </thead>
          <tbody>
            {/* Add row */}
            {addRow && (
              <tr className="border-t bg-muted/30">
                <td className="p-2">
                  <Input
                    type="date"
                    value={addRow.date}
                    max={TODAY}
                    onChange={e => setAddRow(r => r ? { ...r, date: e.target.value } : r)}
                    className="h-7 text-xs"
                  />
                </td>
                <td className="p-2">
                  <Input
                    type="number"
                    step="0.01"
                    value={addRow.value}
                    onChange={e => setAddRow(r => r ? { ...r, value: e.target.value } : r)}
                    placeholder="0.00"
                    className="h-7 text-xs text-right"
                  />
                </td>
                <td className="p-2 text-right text-xs text-muted-foreground">
                  {addRow.value && !isNaN(parseFloat(addRow.value.replace(',', '.')))
                    ? fmt(parseFloat(addRow.value.replace(',', '.')) * factor)
                    : '—'}
                </td>
                <td className="p-2">
                  <Input
                    value={addRow.notes}
                    onChange={e => setAddRow(r => r ? { ...r, notes: e.target.value } : r)}
                    placeholder="optional"
                    className="h-7 text-xs"
                  />
                </td>
                <td className="p-2">
                  <div className="flex gap-1 justify-end">
                    <Button
                      variant="ghost" size="sm" className="h-7 w-7 p-0 text-emerald-600"
                      onClick={handleSaveAdd}
                      disabled={createMutation.isPending}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="sm" className="h-7 w-7 p-0"
                      onClick={() => setAddRow(null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            )}

            {/* Data rows */}
            {valuesSorted.length === 0 && !addRow && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  Noch keine Wertstände eingetragen.
                </td>
              </tr>
            )}
            {valuesSorted.map((entry) => {
              const isEditing = editRow?.id === entry.id
              return (
                <tr key={entry.id} className="border-t hover:bg-muted/30">
                  {isEditing ? (
                    <>
                      <td className="p-2">
                        <Input
                          type="date"
                          value={editRow.date}
                          max={TODAY}
                          onChange={e => setEditRow(r => r ? { ...r, date: e.target.value } : r)}
                          className="h-7 text-xs"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={editRow.value}
                          onChange={e => setEditRow(r => r ? { ...r, value: e.target.value } : r)}
                          className="h-7 text-xs text-right"
                        />
                      </td>
                      <td className="p-2 text-right text-xs text-muted-foreground">
                        {editRow.value && !isNaN(parseFloat(editRow.value.replace(',', '.')))
                          ? fmt(parseFloat(editRow.value.replace(',', '.')) * factor)
                          : '—'}
                      </td>
                      <td className="p-2">
                        <Input
                          value={editRow.notes}
                          onChange={e => setEditRow(r => r ? { ...r, notes: e.target.value } : r)}
                          placeholder="optional"
                          className="h-7 text-xs"
                        />
                      </td>
                      <td className="p-2">
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost" size="sm" className="h-7 w-7 p-0 text-emerald-600"
                            onClick={handleSaveEdit}
                            disabled={updateMutation.isPending}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="sm" className="h-7 w-7 p-0"
                            onClick={() => setEditRow(null)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-3">{formatDate(entry.date)}</td>
                      <td className="p-3 text-right font-medium">{fmt(entry.value)}</td>
                      <td className="p-3 text-right text-muted-foreground">{fmt(entry.value * factor)}</td>
                      <td className="p-3 text-muted-foreground text-xs">{entry.notes ?? '—'}</td>
                      <td className="p-3">
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost" size="sm" className="h-7 w-7 p-0"
                            onClick={() => {
                              setEditRow({
                                id: entry.id,
                                date: entry.date.slice(0, 10),
                                value: entry.value.toString(),
                                notes: entry.notes ?? '',
                              })
                              setAddRow(null)
                            }}
                            title="Bearbeiten"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteValue(entry)}
                            title="Löschen"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <AssetDialog
        key={`${editDialogOpen ? 'open' : 'closed'}-${asset?.id ?? 'new'}`}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        editAsset={asset}
      />
    </div>
  )
}
