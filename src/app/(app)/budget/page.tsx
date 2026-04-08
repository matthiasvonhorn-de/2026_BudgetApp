'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUIStore } from '@/store/useUIStore'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import { getAvailableBg, getMonthName } from '@/lib/budget/calculations'
import { useState, useRef, Fragment } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface CategoryData {
  id: string
  name: string
  color: string
  type: string
  budgeted: number
  activity: number
  available: number
  rolledOver: number
}

interface GroupData {
  id: string
  name: string
  categories: CategoryData[]
}

interface BudgetData {
  year: number
  month: number
  groups: GroupData[]
  summary: {
    totalBudgeted: number
    totalActivity: number
    totalAvailable: number
    readyToAssign: number
    totalIncome: number
  }
}

export default function BudgetPage() {
  const { budgetYear, budgetMonth, goToPrevMonth, goToNextMonth } = useUIStore()
  const queryClient = useQueryClient()
  const fmt = useFormatCurrency()
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const { data, isLoading } = useQuery<BudgetData>({
    queryKey: ['budget', budgetYear, budgetMonth],
    queryFn: () => fetch(`/api/budget/${budgetYear}/${budgetMonth}`).then(r => r.json()),
  })

  const saveMutation = useMutation<
    unknown,
    Error,
    { categoryId: string; budgeted: number },
    { previous?: BudgetData }
  >({
    mutationFn: async ({ categoryId, budgeted }) => {
      const res = await fetch(`/api/budget/${budgetYear}/${budgetMonth}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ categoryId, budgeted }]),
      })
      if (!res.ok) throw new Error('Fehler')
      return res.json()
    },
    onMutate: async ({ categoryId, budgeted }) => {
      const queryKey = ['budget', budgetYear, budgetMonth] as const
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<BudgetData>(queryKey)
      queryClient.setQueryData<BudgetData>(queryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          groups: old.groups.map((g) => ({
            ...g,
            categories: g.categories.map((c) =>
              c.id === categoryId ? { ...c, budgeted } : c
            ),
          })),
        }
      })
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['budget', budgetYear, budgetMonth], context.previous)
      }
      toast.error('Fehler beim Speichern')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['budget', budgetYear, budgetMonth] })
    },
  })

  const rolloverMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/budget/${budgetYear}/${budgetMonth}/rollover`, { method: 'POST' }).then(r => r.json()),
    onSuccess: (data) => {
      toast.success(`Übertrag für ${data.entries} Kategorien in ${data.nextMonth}/${data.nextYear} gespeichert`)
      queryClient.invalidateQueries({ queryKey: ['budget'] })
    },
    onError: () => toast.error('Fehler beim Übertrag'),
  })

  const startEdit = (categoryId: string, currentBudgeted: number) => {
    setEditingCell(categoryId)
    setEditValue(currentBudgeted.toFixed(2))
    setTimeout(() => inputRef.current?.select(), 10)
  }

  const commitEdit = (categoryId: string) => {
    const val = parseFloat(editValue.replace(',', '.'))
    if (!isNaN(val)) {
      saveMutation.mutate({ categoryId, budgeted: val })
    }
    setEditingCell(null)
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse mb-4" />
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}
        </div>
      </div>
    )
  }

  const summary = data?.summary
  const readyToAssignColor = (summary?.readyToAssign ?? 0) >= 0 ? 'text-emerald-600' : 'text-destructive'

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={goToPrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold w-52 text-center">
            {getMonthName(budgetMonth, budgetYear)}
          </h1>
          <Button variant="ghost" size="icon" onClick={goToNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-4">
          {summary && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Noch zuzuteilen</p>
              <p className={`text-lg font-bold ${readyToAssignColor}`}>
                {fmt(summary.readyToAssign)}
              </p>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => rolloverMutation.mutate()} disabled={rolloverMutation.isPending}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Übertrag auf nächsten Monat
          </Button>
        </div>
      </div>

      {/* Budget-Tabelle */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left p-3 font-medium">Kategorie</th>
              <th className="text-right p-3 font-medium w-36">Budgetiert</th>
              <th className="text-right p-3 font-medium w-36">Ausgegeben</th>
              <th className="text-right p-3 font-medium w-36">Verfügbar</th>
            </tr>
          </thead>
          <tbody>
            {data?.groups.filter(g => g.categories.length > 0).map(group => (
              <Fragment key={group.id}>
                {/* Gruppenzeile */}
                <tr className="bg-muted/40 border-t">
                  <td colSpan={4} className="px-3 py-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {group.name}
                    </span>
                  </td>
                </tr>
                {/* Kategorie-Zeilen */}
                {group.categories.map(cat => (
                  <tr key={cat.id} className="border-t hover:bg-muted/20 group">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                        <span>{cat.name}</span>
                        {cat.rolledOver !== 0 && (
                          <span className={cn('text-xs', cat.rolledOver > 0 ? 'text-emerald-600' : 'text-destructive')}>
                            ({cat.rolledOver > 0 ? '+' : ''}{fmt(cat.rolledOver)} Übertrag)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      {editingCell === cat.id ? (
                        <input
                          ref={inputRef}
                          type="number"
                          step="0.01"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={() => commitEdit(cat.id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitEdit(cat.id)
                            if (e.key === 'Escape') setEditingCell(null)
                          }}
                          className="w-28 text-right border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      ) : (
                        <button
                          onClick={() => startEdit(cat.id, cat.budgeted)}
                          className="w-28 text-right hover:bg-muted rounded px-2 py-1 transition-colors font-medium"
                        >
                          {fmt(cat.budgeted)}
                        </button>
                      )}
                    </td>
                    <td className={`p-3 text-right font-medium ${cat.activity < 0 ? 'text-destructive' : cat.activity > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                      {cat.activity !== 0 ? fmt(cat.activity) : '—'}
                    </td>
                    <td className="p-3 text-right">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold', getAvailableBg(cat.available))}>
                        {fmt(cat.available)}
                      </span>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
            {/* Summenzeile */}
            {summary && (
              <tr className="border-t-2 bg-muted font-semibold">
                <td className="p-3">Gesamt</td>
                <td className="p-3 text-right">{fmt(summary.totalBudgeted)}</td>
                <td className={`p-3 text-right ${summary.totalActivity < 0 ? 'text-destructive' : ''}`}>
                  {fmt(summary.totalActivity)}
                </td>
                <td className="p-3 text-right">{fmt(summary.totalAvailable)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Legende */}
      <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Verfügbar</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-destructive inline-block" /> Überzogen</span>
        <span className="text-muted-foreground">Klick auf Betrag zum Bearbeiten</span>
      </div>
    </div>
  )
}
