'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, RefreshCw, ArrowRightToLine, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUIStore } from '@/store/useUIStore'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import { getMonthName } from '@/lib/budget/calculations'
import { formatDate } from '@/lib/utils'
import { useState, useRef, Fragment } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AccountBudgetConfig } from '@/components/accounts/AccountBudgetConfig'

// ── Typen ────────────────────────────────────────────────────────────────────

interface CategoryData {
  id: string
  name: string
  color: string
  type: string
  budgeted: number
  rolledOver: number
  activity: number
  available: number
  subAccountGroupId: string | null
  subAccountLinkType: string
}

interface GroupData {
  id: string
  name: string
  categories: CategoryData[]
}

interface AccountBudgetData {
  account: { id: string; name: string; color: string }
  year: number
  month: number
  openingBalance: number
  openingBalancePlan: number
  subAccountsBalance: number
  groups: GroupData[]
  summary: {
    totalBudgeted: number
    totalActivity: number
    closingBalancePlan: number
    closingBalanceActual: number
  }
}

interface BookDialogState {
  open: boolean
  cat?: CategoryData
}

// ── Transaktionsdetail-Dialog ─────────────────────────────────────────────────

function CategoryActivityDialog({
  open, onClose, cat, accountId, year, month,
}: {
  open: boolean
  onClose: () => void
  cat: CategoryData | undefined
  accountId: string
  year: number
  month: number
}) {
  const fmt = useFormatCurrency()
  const lastDay = new Date(year, month, 0).getDate()
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data: transactions = [], isLoading } = useQuery<any[]>({
    queryKey: ['transactions-detail', accountId, cat?.id, year, month],
    queryFn: () =>
      fetch(`/api/transactions?accountId=${accountId}&categoryId=${cat!.id}&from=${from}&to=${to}&limit=500`)
        .then(r => r.json()),
    enabled: open && !!cat,
  })

  if (!cat) return null

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
              {cat.name} — {getMonthName(month, year)}
            </div>
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1">
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Laden...</div>
          ) : transactions.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Keine Transaktionen in diesem Monat</div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-3 font-medium">Datum</th>
                    <th className="text-left p-3 font-medium">Beschreibung</th>
                    <th className="text-right p-3 font-medium">Betrag</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t: any) => (
                    <tr key={t.id} className="border-t hover:bg-muted/50">
                      <td className="p-3 text-muted-foreground whitespace-nowrap">{formatDate(t.date)}</td>
                      <td className="p-3">
                        <p className="font-medium">{t.description}</p>
                        {t.payee && <p className="text-xs text-muted-foreground">{t.payee}</p>}
                      </td>
                      <td className={`p-3 text-right font-semibold tabular-nums ${t.amount < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                        {fmt(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/50 font-semibold">
                    <td colSpan={2} className="p-3 text-right text-sm text-muted-foreground">Summe</td>
                    <td className={`p-3 text-right tabular-nums ${amountColor(cat.activity)}`}>
                      {fmt(cat.activity)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Buchen-Dialog ────────────────────────────────────────────────────────────

function BookTransactionDialog({
  state, onClose, accounts, accountId, budgetYear, budgetMonth,
}: {
  state: BookDialogState
  onClose: () => void
  accounts: any[]
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
      const signedAmount = state.cat.type === 'INCOME' ? Math.abs(raw) : -Math.abs(raw)
      return fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date, amount: signedAmount, description,
          accountId: selAccountId,
          categoryId: state.cat.id,
          type: state.cat.type as 'INCOME' | 'EXPENSE' | 'TRANSFER',
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
              items={accounts.map((a: any) => ({ value: a.id, label: a.name }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
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

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

function amountColor(v: number) {
  return v < 0 ? 'text-destructive' : v > 0 ? 'text-emerald-600' : 'text-muted-foreground'
}

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

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => fetch('/api/accounts').then(r => r.json()),
  })

  const { data: subAccountsData } = useQuery<{
    subAccounts: Array<{ id: string; name: string; color: string; accountId: string; balance: number }>
  }>({
    queryKey: ['sub-accounts-summary'],
    queryFn: () => fetch('/api/sub-accounts').then(r => r.json()),
  })

  const saveMutation = useMutation({
    mutationFn: async ({ categoryId, budgeted }: { categoryId: string; budgeted: number }) => {
      const res = await fetch(`/api/budget/${budgetYear}/${budgetMonth}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ categoryId, budgeted }]),
      })
      if (!res.ok) throw new Error('Fehler')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['account-budget', accountId, budgetYear, budgetMonth] })
      qc.invalidateQueries({ queryKey: ['budget', budgetYear, budgetMonth] })
    },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  const rolloverMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/accounts/${accountId}/budget/${budgetYear}/${budgetMonth}/rollover`, { method: 'POST' }).then(r => r.json()),
    onSuccess: (d) => {
      toast.success(`Übertrag für ${d.entries} Kategorien in ${d.nextMonth}/${d.nextYear} gespeichert`)
      qc.invalidateQueries({ queryKey: ['account-budget'] })
      qc.invalidateQueries({ queryKey: ['budget'] })
    },
    onError: () => toast.error('Fehler beim Übertrag'),
  })

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

  // Sub-Accounts dieses Kontos
  const subAccounts = (subAccountsData?.subAccounts ?? []).filter(sa => sa.accountId === accountId)

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
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goToPrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-semibold text-sm w-44 text-center">
            {getMonthName(budgetMonth, budgetYear)}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goToNextMonth}>
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
          >
            <Settings2 className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => rolloverMutation.mutate()}
            disabled={rolloverMutation.isPending}
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

            {/* ── 1. Gesamtsaldo ───────────────────────────────────── */}
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
              <td className={`px-3 py-1 border border-border text-right tabular-nums ${amountColor(closingActual - closingPlan)}`}>
                {fmt(closingActual - closingPlan)}
              </td>
              <td className="px-3 py-1 border border-border" />
            </tr>

            {/* ── 2. Saldo Unterkonten (nur wenn vorhanden) ─────────── */}
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

            {/* ── 3. Saldo Hauptkonto ───────────────────────────────── */}
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

            {/* ── Spaltenköpfe ──────────────────────────────────────────── */}
            <tr className="bg-muted border-t-2 border-border">
              <th className="text-left px-3 py-2 font-semibold border border-border w-28">Datum</th>
              <th className="text-left px-3 py-2 font-semibold border border-border">Beschreibung</th>
              <th className="text-right px-3 py-2 font-semibold border border-border w-36">Betr. geplant</th>
              <th className="text-right px-3 py-2 font-semibold border border-border w-36">Betrag</th>
              <th className="text-right px-3 py-2 font-semibold border border-border w-32">Soll-Ist</th>
              <th className="px-2 py-2 border border-border w-10" />
            </tr>
          </thead>

          <tbody>
            {/* ── Saldoübertrag aus Vormonat ─────────────────────────── */}
            <tr className="bg-slate-100 dark:bg-slate-800/50 font-semibold">
              <td className="px-3 py-1.5 border border-border text-xs text-muted-foreground">
                {`01.${String(budgetMonth).padStart(2, '0')}.${budgetYear}`}
              </td>
              <td className="px-3 py-1.5 border border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Saldoübertrag aus Vormonat
              </td>
              <td className={`px-3 py-1.5 border border-border text-right tabular-nums ${amountColor(openingPlan)}`}>
                {fmt(openingPlan)}
              </td>
              <td className={`px-3 py-1.5 border border-border text-right tabular-nums ${amountColor(opening)}`}>
                {fmt(opening)}
              </td>
              <td className={`px-3 py-1.5 border border-border text-right tabular-nums ${amountColor(opening - openingPlan)}`}>
                {fmt(opening - openingPlan)}
              </td>
              <td className="px-3 py-1.5 border border-border" />
            </tr>

            {/* ── Kategoriegruppen ──────────────────────────────────── */}
            {groups.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground text-sm">
                  Keine Kategoriegruppen konfiguriert.{' '}
                  <button
                    onClick={() => setConfigOpen(true)}
                    className="text-primary hover:underline"
                  >
                    Gruppen zuweisen
                  </button>
                </td>
              </tr>
            ) : (
              groups.map(group => {
                const groupBudgeted = group.categories.reduce((s, c) => s + c.budgeted, 0)
                const groupActivity = group.categories.reduce((s, c) => s + c.activity, 0)
                const groupAvailable = group.categories.reduce((s, c) => s + c.available, 0)

                return (
                  <Fragment key={group.id}>
                    {/* Gruppenzeile */}
                    <tr className="bg-muted/30 border-t border-border">
                      <td className="px-3 py-1.5 border border-border text-xs text-muted-foreground">{dateStr}</td>
                      <td className="px-3 py-1.5 border border-border font-bold">{group.name}</td>
                      <td className="px-3 py-1.5 border border-border text-right font-bold tabular-nums">
                        {groupBudgeted !== 0
                          ? <span className={amountColor(groupBudgeted)}>{fmt(groupBudgeted)}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-1.5 border border-border text-right font-bold tabular-nums">
                        {groupActivity !== 0
                          ? <span className={amountColor(groupActivity)}>{fmt(groupActivity)}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-1.5 border border-border text-right font-bold tabular-nums">
                        {groupAvailable !== 0
                          ? <span className={amountColor(groupAvailable)}>{fmt(groupAvailable)}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-2 py-1.5 border border-border" />
                    </tr>

                    {/* Kategoriezeilen */}
                    {group.categories.map(cat => (
                      <tr key={cat.id} className="border-t border-border hover:bg-muted/20">
                        <td className="px-3 py-1.5 border border-border text-xs text-muted-foreground">{dateStr}</td>
                        <td className="px-3 py-1.5 border border-border">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                            <span>{cat.name}</span>
                            {cat.rolledOver !== 0 && (
                              <span className={`text-xs ${cat.rolledOver > 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                                ({fmt(cat.rolledOver)})
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Betr. geplant — klickbar */}
                        <td className="px-3 py-1.5 border border-border text-right tabular-nums">
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
                              className="w-28 text-right border rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                            />
                          ) : (
                            <button
                              onClick={() => startEdit(cat.id, cat.budgeted)}
                              className="w-full text-right hover:bg-primary/10 rounded px-1 transition-colors"
                              title="Klicken zum Bearbeiten"
                            >
                              {cat.budgeted !== 0
                                ? <span className={amountColor(cat.budgeted)}>{fmt(cat.budgeted)}</span>
                                : <span className="text-muted-foreground">—</span>}
                            </button>
                          )}
                        </td>

                        {/* Betrag (Ist) — Doppelklick öffnet Transaktionsdetails */}
                        <td
                          className={`px-3 py-1.5 border border-border text-right tabular-nums ${cat.activity !== 0 ? 'cursor-pointer select-none' : ''}`}
                          onDoubleClick={() => cat.activity !== 0 && setActivityDialog({ open: true, cat })}
                          title={cat.activity !== 0 ? 'Doppelklick für Transaktionsdetails' : undefined}
                        >
                          {cat.activity !== 0
                            ? <span className={amountColor(cat.activity)}>{fmt(cat.activity)}</span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>

                        {/* Soll-Ist */}
                        <td className="px-3 py-1.5 border border-border text-right tabular-nums">
                          {cat.available !== 0
                            ? <span className={amountColor(cat.available)}>{fmt(cat.available)}</span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>

                        {/* Buchen-Button */}
                        <td className="px-1.5 py-1 border border-border text-center">
                          {cat.budgeted !== 0 && (
                            <button
                              onClick={() => setBookDialog({ open: true, cat })}
                              title="Planwert als Transaktion buchen"
                              className="text-muted-foreground hover:text-primary transition-colors p-0.5 rounded hover:bg-primary/10"
                            >
                              <ArrowRightToLine className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                )
              })
            )}
          </tbody>

          <tfoot>
            {/* ── Einnahmen ────────────────────────────────────── */}
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
            {/* ── Ausgaben ─────────────────────────────────────── */}
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
