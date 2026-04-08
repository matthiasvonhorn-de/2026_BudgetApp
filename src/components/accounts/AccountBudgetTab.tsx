'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, RefreshCw, ArrowRightToLine, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUIStore } from '@/store/useUIStore'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import { getMonthName } from '@/lib/budget/calculations'
import { useState, useRef } from 'react'
import { toast } from 'sonner'
import { AccountBudgetConfig } from '@/components/accounts/AccountBudgetConfig'
import { CategoryActivityDialog } from './budget/CategoryActivityDialog'
import { BookTransactionDialog } from './budget/BookTransactionDialog'
import { BudgetTableBody } from './budget/BudgetTableBody'
import { amountColor } from './budget/utils'
import type { AccountBudgetData, BookDialogState, CategoryData } from './budget/types'
import type { Account } from '@/types/api'

// ── Haupt-Komponente ─────────────────────────────────────────────────────────

export function AccountBudgetTab({ accountId }: { accountId: string }) {
  const { budgetYear, budgetMonth, goToPrevMonth, goToNextMonth } = useUIStore()
  const qc = useQueryClient()
  const fmt = useFormatCurrency()

  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [bookDialog, setBookDialog] = useState<BookDialogState>({ open: false })
  const [activityDialog, setActivityDialog] = useState<{ open: boolean; cat?: CategoryData }>({ open: false })
  const [configOpen, setConfigOpen] = useState(false)

  const { data, isLoading } = useQuery<AccountBudgetData>({
    queryKey: ['account-budget', accountId, budgetYear, budgetMonth],
    queryFn: () =>
      fetch(`/api/accounts/${accountId}/budget/${budgetYear}/${budgetMonth}`).then(r => r.json()),
  })

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => fetch('/api/accounts').then(r => r.json()),
  })

  const saveMutation = useMutation<
    unknown,
    Error,
    { categoryId: string; budgeted: number },
    { previous?: AccountBudgetData }
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
      const queryKey = ['account-budget', accountId, budgetYear, budgetMonth] as const
      await qc.cancelQueries({ queryKey })
      const previous = qc.getQueryData<AccountBudgetData>(queryKey)
      qc.setQueryData<AccountBudgetData>(queryKey, (old) => {
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
        qc.setQueryData(['account-budget', accountId, budgetYear, budgetMonth], context.previous)
      }
      toast.error('Fehler beim Speichern')
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['account-budget', accountId, budgetYear, budgetMonth] })
      qc.invalidateQueries({ queryKey: ['budget', budgetYear, budgetMonth] })
    },
  })

  const rolloverCheck = useMutation({
    mutationFn: () =>
      fetch(`/api/accounts/${accountId}/budget/${budgetYear}/${budgetMonth}/rollover`).then(r => r.json()),
  })

  const rolloverMutation = useMutation({
    mutationFn: (mode: 'create' | 'update') =>
      fetch(`/api/accounts/${accountId}/budget/${budgetYear}/${budgetMonth}/rollover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      }).then(r => r.json()),
    onSuccess: (d) => {
      const msg = d.cascadedMonths > 0
        ? `Übertrag für ${d.entries} Kategorien aktualisiert (${d.cascadedMonths} Folgemonate)`
        : `Übertrag für ${d.entries} Kategorien in ${d.nextMonth}/${d.nextYear} gespeichert`
      toast.success(msg)
      qc.invalidateQueries({ queryKey: ['account-budget'] })
      qc.invalidateQueries({ queryKey: ['budget'] })
    },
    onError: () => toast.error('Fehler beim Übertrag'),
  })

  const handleRollover = async () => {
    try {
      const check = await rolloverCheck.mutateAsync()
      if (!check.hasExistingEntries) {
        rolloverMutation.mutate('create')
      } else {
        const ok = confirm(
          `Im Folgemonat (${check.nextMonth}/${check.nextYear}) existieren bereits ${check.existingCount} Budgetvorgaben.\n\nSollen die Überträge aktualisiert werden? Die monatlichen Budgets bleiben unverändert.`
        )
        if (ok) rolloverMutation.mutate('update')
      }
    } catch {
      toast.error('Fehler beim Prüfen des Folgemonats')
    }
  }

  const startEdit = (categoryId: string, current: number) => {
    setEditingCell(categoryId)
    setEditValue(current.toFixed(2))
    setTimeout(() => inputRef.current?.select(), 10)
  }

  const commitEdit = (categoryId: string) => {
    const val = parseFloat(editValue.replace(',', '.'))
    if (!isNaN(val)) saveMutation.mutate({ categoryId, budgeted: val })
    setEditingCell(null)
  }

  if (isLoading) {
    return (
      <div className="p-4 space-y-1">
        {[...Array(6)].map((_, i) => <div key={i} className="h-8 bg-muted rounded animate-pulse" />)}
      </div>
    )
  }

  const opening = data?.openingBalance ?? 0
  const openingPlan = data?.openingBalancePlan ?? 0
  const subAccountsBalance = data?.subAccountsBalance ?? 0
  const groups = data?.groups ?? []
  const summary = data?.summary
  const closingPlan = summary?.closingBalancePlan ?? opening
  const closingActual = summary?.closingBalanceActual ?? opening
  const dateStr = `01.${String(budgetMonth).padStart(2, '0')}.${budgetYear}`

  const allCats = groups.flatMap(g => g.categories)
  const incomePlan = allCats.filter(c => c.type === 'INCOME').reduce((s, c) => s + c.budgeted, 0)
  const incomeActual = allCats.filter(c => c.type === 'INCOME').reduce((s, c) => s + c.activity, 0)
  const expensePlan = allCats.filter(c => c.type === 'EXPENSE').reduce((s, c) => s + c.budgeted, 0)
  const expenseActual = allCats.filter(c => c.type === 'EXPENSE').reduce((s, c) => s + c.activity, 0)

  return (
    <div className="flex flex-col">
      {/* Monat-Navigation */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-card">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goToPrevMonth} aria-label="Vorheriger Monat">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-semibold text-sm w-44 text-center">
            {getMonthName(budgetMonth, budgetYear)}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goToNextMonth} aria-label="Nächster Monat">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setConfigOpen(true)}
            title="Kategoriegruppen konfigurieren"
            aria-label="Kategoriegruppen konfigurieren"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRollover}
            disabled={rolloverMutation.isPending || rolloverCheck.isPending}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Übertrag
          </Button>
        </div>
      </div>

      <div className="overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            {/* Titelzeile */}
            <tr className="bg-blue-50 dark:bg-blue-950/30">
              <td colSpan={6} className="px-3 py-1.5 text-center text-sm font-medium text-foreground border border-border">
                Budget · {getMonthName(budgetMonth, budgetYear)}
              </td>
            </tr>

            {/* 1. Gesamtsaldo */}
            <tr className="bg-blue-100/80 dark:bg-blue-900/30 font-bold">
              <td colSpan={2} className="px-3 py-1 border border-border text-right text-xs font-bold text-foreground">
                Gesamtsaldo
              </td>
              <td className={`px-3 py-1 border border-border text-right tabular-nums ${amountColor(closingPlan + subAccountsBalance)}`}>
                {fmt(closingPlan + subAccountsBalance)}
              </td>
              <td className={`px-3 py-1 border border-border text-right tabular-nums ${amountColor(closingActual + subAccountsBalance)}`}>
                {fmt(closingActual + subAccountsBalance)}
              </td>
              <td className={`px-3 py-1 border border-border text-right tabular-nums ${amountColor(closingActual + subAccountsBalance - (closingPlan + subAccountsBalance))}`}>
                {fmt(closingActual + subAccountsBalance - (closingPlan + subAccountsBalance))}
              </td>
              <td className="px-3 py-1 border border-border" />
            </tr>

            {/* 2. Saldo Unterkonten (nur wenn vorhanden) */}
            {subAccountsBalance !== 0 && (
              <tr className="bg-blue-50/70 dark:bg-blue-950/25">
                <td className="px-3 py-1 border border-border" />
                <td className="px-3 py-1 border border-border text-right text-xs font-semibold text-muted-foreground">
                  Saldo Unterkonten
                </td>
                <td className={`px-3 py-1 border border-border text-right tabular-nums font-semibold ${amountColor(subAccountsBalance)}`}>
                  {fmt(subAccountsBalance)}
                </td>
                <td className={`px-3 py-1 border border-border text-right tabular-nums font-semibold ${amountColor(subAccountsBalance)}`}>
                  {fmt(subAccountsBalance)}
                </td>
                <td className="px-3 py-1 border border-border text-right text-xs text-muted-foreground tabular-nums">
                  {fmt(0)}
                </td>
                <td className="px-3 py-1 border border-border" />
              </tr>
            )}

            {/* 3. Saldo Hauptkonto */}
            <tr className="bg-blue-50/70 dark:bg-blue-950/25">
              <td className="px-3 py-1 border border-border" />
              <td className="px-3 py-1 border border-border text-right text-xs font-semibold text-muted-foreground">
                Saldo Hauptkonto
              </td>
              <td className={`px-3 py-1 border border-border text-right tabular-nums font-semibold ${amountColor(closingPlan)}`}>
                {fmt(closingPlan)}
              </td>
              <td className={`px-3 py-1 border border-border text-right tabular-nums font-semibold ${amountColor(closingActual)}`}>
                {fmt(closingActual)}
              </td>
              <td className={`px-3 py-1 border border-border text-right tabular-nums font-semibold ${amountColor(closingActual - closingPlan)}`}>
                {fmt(closingActual - closingPlan)}
              </td>
              <td className="px-3 py-1 border border-border" />
            </tr>

            {/* Spaltenkoepfe */}
            <tr className="bg-muted border-t-2 border-border">
              <th className="text-left px-3 py-2 font-semibold border border-border w-28">Datum</th>
              <th className="text-left px-3 py-2 font-semibold border border-border">Beschreibung</th>
              <th className="text-right px-3 py-2 font-semibold border border-border w-36">Betr. geplant</th>
              <th className="text-right px-3 py-2 font-semibold border border-border w-36">Betrag</th>
              <th className="text-right px-3 py-2 font-semibold border border-border w-32">Soll-Ist</th>
              <th className="px-2 py-2 border border-border w-10" />
            </tr>
          </thead>

          <BudgetTableBody
            groups={groups}
            dateStr={dateStr}
            openingPlan={openingPlan}
            opening={opening}
            budgetMonth={budgetMonth}
            budgetYear={budgetYear}
            editingCell={editingCell}
            editValue={editValue}
            inputRef={inputRef}
            onStartEdit={startEdit}
            onCommitEdit={commitEdit}
            onCancelEdit={() => setEditingCell(null)}
            onEditValueChange={setEditValue}
            onOpenActivity={(cat) => setActivityDialog({ open: true, cat })}
            onOpenBookDialog={(cat) => setBookDialog({ open: true, cat })}
            onOpenConfig={() => setConfigOpen(true)}
          />

          <tfoot>
            {/* Einnahmen */}
            <tr className="bg-slate-100 dark:bg-slate-800/50 font-semibold border-t-2 border-border">
              <td colSpan={2} className="px-3 py-1.5 border border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Einnahmen
              </td>
              <td className={`px-3 py-1.5 border border-border text-right tabular-nums ${amountColor(incomePlan)}`}>
                {fmt(incomePlan)}
              </td>
              <td className={`px-3 py-1.5 border border-border text-right tabular-nums ${amountColor(incomeActual)}`}>
                {fmt(incomeActual)}
              </td>
              <td className={`px-3 py-1.5 border border-border text-right tabular-nums ${amountColor(incomeActual - incomePlan)}`}>
                {fmt(incomeActual - incomePlan)}
              </td>
              <td className="px-3 py-1.5 border border-border" />
            </tr>
            {/* Ausgaben */}
            <tr className="bg-slate-100 dark:bg-slate-800/50 font-semibold">
              <td colSpan={2} className="px-3 py-1.5 border border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Ausgaben
              </td>
              <td className="px-3 py-1.5 border border-border text-right tabular-nums text-muted-foreground">
                {fmt(Math.abs(expensePlan))}
              </td>
              <td className="px-3 py-1.5 border border-border text-right tabular-nums text-muted-foreground">
                {fmt(Math.abs(expenseActual))}
              </td>
              <td className={`px-3 py-1.5 border border-border text-right tabular-nums ${amountColor(expenseActual - expensePlan)}`}>
                {fmt(expenseActual - expensePlan)}
              </td>
              <td className="px-3 py-1.5 border border-border" />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="px-4 py-1.5 border-t text-xs text-muted-foreground bg-card">
        Klick auf &quot;Betr. geplant&quot; zum Bearbeiten ·{' '}
        <ArrowRightToLine className="inline h-3 w-3 mb-0.5" /> Planwert buchen ·{' '}
        Doppelklick auf &quot;Betrag&quot; für Details ·{' '}
        <Settings2 className="inline h-3 w-3 mb-0.5" /> Gruppen konfigurieren
      </div>

      <CategoryActivityDialog
        open={activityDialog.open}
        onClose={() => setActivityDialog({ open: false })}
        cat={activityDialog.cat}
        accountId={accountId}
        year={budgetYear}
        month={budgetMonth}
      />

      <BookTransactionDialog
        state={bookDialog}
        onClose={() => setBookDialog({ open: false })}
        accounts={accounts}
        accountId={accountId}
        budgetYear={budgetYear}
        budgetMonth={budgetMonth}
      />

      <AccountBudgetConfig
        accountId={accountId}
        open={configOpen}
        onClose={() => setConfigOpen(false)}
      />
    </div>
  )
}
