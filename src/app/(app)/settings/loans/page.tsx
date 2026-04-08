'use client'

import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2, ArrowLeft, Pencil } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { calcAnnuityFromRates } from '@/lib/loans/amortization'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import type { Account, Loan } from '@/types/api'

interface LoanForm {
  name: string
  loanType: 'ANNUITAETENDARLEHEN' | 'RATENKREDIT'
  principal: string
  interestRate: string
  initialRepaymentRate: string
  termMonths: string
  startDate: string
  paidUntil: string
  accountId: string
  categoryId: string
  notes: string
}

const EMPTY: LoanForm = {
  name: '',
  loanType: 'ANNUITAETENDARLEHEN',
  principal: '',
  interestRate: '',
  initialRepaymentRate: '',
  termMonths: '',
  startDate: new Date().toISOString().slice(0, 10),
  paidUntil: '',
  accountId: '',
  categoryId: '',
  notes: '',
}

function LoanDialog({
  open, onClose, loan,
}: {
  open: boolean
  onClose: () => void
  loan?: Loan
}) {
  const qc = useQueryClient()
  const { currency } = useSettingsStore()
  const fmt = useFormatCurrency()
  const [form, setForm] = useState<LoanForm>(() => {
    if (loan) {
      const paidUntilValue = loan.paidUntil
        ? new Date(loan.paidUntil).toISOString().slice(0, 10)
        : ''
      return {
        name: loan.name,
        loanType: loan.loanType as 'ANNUITAETENDARLEHEN' | 'RATENKREDIT',
        principal: loan.principal.toString(),
        interestRate: (loan.interestRate * 100).toFixed(3),
        initialRepaymentRate: loan.initialRepaymentRate != null ? (loan.initialRepaymentRate * 100).toFixed(3) : '',
        termMonths: loan.termMonths.toString(),
        startDate: new Date(loan.startDate).toISOString().slice(0, 10),
        paidUntil: paidUntilValue,
        accountId: loan.accountId ?? '',
        categoryId: loan.categoryId ?? '',
        notes: loan.notes ?? '',
      }
    }
    return EMPTY
  })
  // paidUntilDraft is the source of truth for paidUntil — updated via native
  // DOM events so Safari's date picker is captured regardless of React's
  // synthetic event layer or Base UI portal timing.
  const [paidUntilDraft, setPaidUntilDraft] = useState(() => {
    return loan?.paidUntil ? new Date(loan.paidUntil).toISOString().slice(0, 10) : ''
  })
  const paidUntilInitValRef = useRef(loan?.paidUntil ? new Date(loan.paidUntil).toISOString().slice(0, 10) : '')  // holds the init value for deferred portal mount
  const paidUntilNodeRef = useRef<HTMLInputElement | null>(null)

  // Callback ref: fires when the input element mounts (handles Base UI portal
  // deferred rendering — element may mount after our useEffect runs).
  const paidUntilCallbackRef = useCallback((node: HTMLInputElement | null) => {
    paidUntilNodeRef.current = node
    if (!node) return
    // Restore value in case useEffect already ran before portal mounted
    node.value = paidUntilInitValRef.current
    // Native listeners catch Safari's date picker (React synthetic onChange misses it).
    // blur fires before the Speichern button click handler runs, so it catches
    // the case where the user types a date and immediately clicks Speichern.
    const handler = () => setPaidUntilDraft(node.value)
    node.addEventListener('change', handler)
    node.addEventListener('input', handler)
    node.addEventListener('blur', handler)
  }, [])

  const { data: accounts = [], isError: isErrorAccounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => fetch('/api/accounts').then(r => r.json()),
    enabled: open,
  })

  const { data: accountCategories = [], isError: isErrorCategories } = useQuery<{ id: string; name: string; categories: { id: string; name: string; color: string }[] }[]>({
    queryKey: ['account-category-groups', form.accountId],
    queryFn: () => fetch(`/api/accounts/${form.accountId}/category-groups`).then(r => r.json()),
    enabled: open && !!form.accountId,
  })

  const set = (k: keyof LoanForm, v: string) => setForm(f => ({ ...f, [k]: v }))

  const computedMonthlyPayment = (() => {
    if (form.loanType !== 'ANNUITAETENDARLEHEN') return null
    const p = parseFloat(form.principal.replace(',', '.'))
    const z = parseFloat(form.interestRate.replace(',', '.')) / 100
    const t = parseFloat(form.initialRepaymentRate.replace(',', '.')) / 100
    if (p > 0 && z >= 0 && t >= 0 && !isNaN(p) && !isNaN(z) && !isNaN(t)) {
      return calcAnnuityFromRates(p, z, t)
    }
    return null
  })()

  const payload = () => ({
    name: form.name,
    loanType: form.loanType,
    principal: parseFloat(form.principal.replace(',', '.')),
    interestRate: parseFloat(form.interestRate.replace(',', '.')) / 100,
    initialRepaymentRate: form.initialRepaymentRate
      ? parseFloat(form.initialRepaymentRate.replace(',', '.')) / 100
      : 0,
    termMonths: parseInt(form.termMonths),
    startDate: form.startDate,
    // paidUntilDraft is updated by native events; fall back to direct DOM read
    // in case blur/change hadn't fired yet (e.g. keyboard entry without tabbing away).
    paidUntil: paidUntilDraft || paidUntilNodeRef.current?.value || null,
    accountId: form.accountId || null,
    categoryId: form.categoryId || null,
    notes: form.notes || null,
  })

  const createMutation = useMutation({
    mutationFn: () => fetch('/api/loans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload()),
    }).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loans'] }); toast.success('Kredit angelegt'); onClose() },
    onError: () => toast.error('Fehler beim Anlegen'),
  })

  const updateMutation = useMutation({
    mutationFn: () => fetch(`/api/loans/${loan!.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload()),
    }).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loans'] }); toast.success('Kredit gespeichert'); onClose() },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  const isPending = createMutation.isPending || updateMutation.isPending
  const isValid = form.name.trim() && form.principal && form.interestRate && form.termMonths && form.startDate
    && (form.loanType === 'RATENKREDIT' || form.initialRepaymentRate)

  // Prüfen ob Finanzparameter sich geändert haben (→ Warnung anzeigen)
  const financialChanged = loan && (
    loan.loanType !== form.loanType ||
    loan.principal !== parseFloat(form.principal.replace(',', '.') || '0') ||
    Math.abs(loan.interestRate * 100 - parseFloat(form.interestRate || '0')) > 0.0001 ||
    Math.abs(loan.initialRepaymentRate * 100 - parseFloat(form.initialRepaymentRate || '0')) > 0.0001 ||
    loan.termMonths !== parseInt(form.termMonths || '0') ||
    new Date(loan.startDate).toISOString().slice(0, 10) !== form.startDate
  )

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{loan ? 'Kredit bearbeiten' : 'Neuer Kredit'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {(isErrorAccounts || isErrorCategories) && (
            <div className="text-sm text-destructive p-4">Fehler beim Laden der Daten</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="z.B. Autokredit" />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label>Kreditart *</Label>
              <Select
                value={form.loanType}
                onValueChange={(v: string | null) => v && set('loanType', v as LoanForm['loanType'])}
                itemToStringLabel={(v: string) => ({ ANNUITAETENDARLEHEN: 'Annuitätendarlehen (konstante Rate)', RATENKREDIT: 'Ratenkredit (konstante Tilgung)' }[v as string] ?? v as string)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ANNUITAETENDARLEHEN">Annuitätendarlehen (konstante Rate)</SelectItem>
                  <SelectItem value="RATENKREDIT">Ratenkredit (konstante Tilgung)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {form.loanType === 'ANNUITAETENDARLEHEN'
                  ? 'Gleiche Monatsrate über gesamte Laufzeit. Zinsanteil sinkt, Tilgungsanteil steigt.'
                  : 'Gleiche Tilgung pro Monat. Gesamtrate sinkt mit der Zeit durch abnehmende Zinsen.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Darlehensbetrag ({currency}) *</Label>
              <Input
                type="number" min="0" step="100"
                value={form.principal}
                onChange={e => set('principal', e.target.value)}
                placeholder="z.B. 20000"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Zinssatz p.a. (%) *</Label>
              <Input
                type="number" min="0" step="0.001"
                value={form.interestRate}
                onChange={e => set('interestRate', e.target.value)}
                placeholder="z.B. 3.5"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Laufzeit (Monate) *</Label>
              <Input
                type="number" min="1" step="1"
                value={form.termMonths}
                onChange={e => set('termMonths', e.target.value)}
                placeholder="z.B. 60"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Erste Rate am *</Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={e => set('startDate', e.target.value)}
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label>Bezahlt bis</Label>
              <input
                ref={paidUntilCallbackRef}
                type="date"
                min={form.startDate}
                className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <p className="text-xs text-muted-foreground">
                Alle Raten bis zu diesem Datum werden ohne Buchung als bezahlt markiert.
              </p>
            </div>

            {form.loanType === 'ANNUITAETENDARLEHEN' && (
              <div className="col-span-2 space-y-1.5">
                <Label>Anfangstilgungssatz p.a. (%) *</Label>
                <Input
                  type="number" min="0.001" step="0.001"
                  value={form.initialRepaymentRate}
                  onChange={e => set('initialRepaymentRate', e.target.value)}
                  placeholder="z.B. 2.0"
                />
                <p className="text-xs text-muted-foreground">
                  {computedMonthlyPayment !== null
                    ? `→ Monatliche Rate: ${fmt(computedMonthlyPayment)} · Restschuld nach ${form.termMonths || '?'} Monaten verbleibt`
                    : 'Monatliche Rate = Kreditsumme × (Zinssatz + Tilgungssatz) ÷ 12'}
                </p>
              </div>
            )}

            <div className="col-span-2 space-y-1.5">
              <Label>Verknüpftes Konto</Label>
              <Select
                value={form.accountId}
                onValueChange={(v: string | null) => { set('accountId', v ?? ''); set('categoryId', '') }}
                items={accounts.map((a: Account) => ({ value: a.id, label: a.name }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kein Konto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Kein Konto</SelectItem>
                  {accounts.map((a: Account) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label>Buchungskategorie für Kreditraten</Label>
              <Select
                value={form.categoryId}
                onValueChange={(v: string | null) => set('categoryId', v ?? '')}
                disabled={!form.accountId}
                items={accountCategories.flatMap(g => g.categories.map(c => ({ value: c.id, label: c.name })))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={form.accountId ? 'Kategorie wählen (optional)' : 'Zuerst Konto wählen'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Keine Kategorie</SelectItem>
                  {accountCategories.map(group => (
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
              <p className="text-xs text-muted-foreground">Wird beim Markieren einer Rate als bezahlt automatisch gebucht</p>
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label>Notizen</Label>
              <Input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional" />
            </div>
          </div>
        </div>

        {loan && financialChanged && (
          <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-3 py-2">
            Achtung: Finanzparameter wurden geändert. Der Tilgungsplan wird vollständig neu berechnet und bereits markierte Raten werden zurückgesetzt.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button
            onClick={() => loan ? updateMutation.mutate() : createMutation.mutate()}
            disabled={!isValid || isPending}
          >
            {isPending ? '...' : loan ? 'Speichern' : 'Kredit anlegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function LoansSettingsPage() {
  const qc = useQueryClient()
  const fmt = useFormatCurrency()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editLoan, setEditLoan] = useState<Loan | undefined>(undefined)

  const openEdit = (loan: Loan) => { setEditLoan(loan); setDialogOpen(true) }
  const openCreate = () => { setEditLoan(undefined); setDialogOpen(true) }
  const closeDialog = () => { setDialogOpen(false); setEditLoan(undefined) }

  const { data: loans = [], isLoading, isError } = useQuery({
    queryKey: ['loans'],
    queryFn: () => fetch('/api/loans').then(r => r.json()),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/loans/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loans'] }); toast.success('Kredit gelöscht') },
    onError: () => toast.error('Fehler beim Löschen'),
  })

  const TYPE_LABELS: Record<string, string> = {
    ANNUITAETENDARLEHEN: 'Annuitätendarlehen',
    RATENKREDIT: 'Ratenkredit',
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/settings">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zurück
          </Button>
        </Link>
        <h1 className="text-2xl font-bold flex-1">Bankkredite</h1>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Neuer Kredit
        </Button>
      </div>

      {isError ? (
        <div className="text-sm text-destructive p-4">Fehler beim Laden der Daten</div>
      ) : isLoading ? (
        <p className="text-muted-foreground">Laden...</p>
      ) : loans.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-muted-foreground">
          <p>Noch keine Kredite angelegt.</p>
          <Button className="mt-4" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Ersten Kredit anlegen
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Art</th>
                <th className="text-right p-3 font-medium">Betrag</th>
                <th className="text-right p-3 font-medium">Zinssatz</th>
                <th className="text-right p-3 font-medium">Laufzeit</th>
                <th className="text-right p-3 font-medium">Tilgung / Rate</th>
                <th className="p-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {loans.map((loan: Loan) => (
                <tr key={loan.id} className="border-t hover:bg-muted/30">
                  <td className="p-3 font-medium">{loan.name}</td>
                  <td className="p-3 text-muted-foreground text-xs">{TYPE_LABELS[loan.loanType]}</td>
                  <td className="p-3 text-right">{fmt(loan.principal)}</td>
                  <td className="p-3 text-right">{(loan.interestRate * 100).toFixed(2)} %</td>
                  <td className="p-3 text-right">{loan.termMonths} Mt.</td>
                  <td className="p-3 text-right">
                    {loan.loanType === 'ANNUITAETENDARLEHEN'
                      ? <>
                          <span className="text-xs text-muted-foreground">{(loan.initialRepaymentRate * 100).toFixed(3)} % Tilg.</span>
                          <br />
                          <span>{fmt(loan.monthlyPayment)}</span>
                        </>
                      : 'variabel'}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1 justify-end">
                      <Button
                        variant="ghost" size="sm" className="h-7 w-7 p-0"
                        onClick={() => openEdit(loan)}
                        title="Bearbeiten"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => { if (confirm(`"${loan.name}" löschen?`)) deleteMutation.mutate(loan.id) }}
                        title="Löschen"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <LoanDialog key={`${dialogOpen ? 'open' : 'closed'}-${editLoan?.id ?? 'new'}`} open={dialogOpen} onClose={closeDialog} loan={editLoan} />
    </div>
  )
}
