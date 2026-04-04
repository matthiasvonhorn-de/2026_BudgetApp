'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { Account, AccountType } from '@/types/api'

const ALL_TYPES: { value: AccountType; label: string }[] = [
  { value: 'CHECKING', label: 'Girokonto' },
  { value: 'SAVINGS', label: 'Sparkonto' },
  { value: 'CREDIT_CARD', label: 'Kreditkarte' },
  { value: 'CASH', label: 'Bargeld' },
  { value: 'INVESTMENT', label: 'Depot' },
  { value: 'SPARPLAN', label: 'Sparplan' },
  { value: 'FESTGELD', label: 'Festgeld' },
]

const FREQ_LABELS: Record<string, string> = {
  MONTHLY: 'Monatlich',
  QUARTERLY: 'Quartärlich',
  ANNUALLY: 'Jährlich',
}

interface FormState {
  type: AccountType
  name: string
  bank: string
  iban: string
  color: string
  currentBalance: string
  // Savings fields
  initialBalance: string
  upfrontFee: string
  interestRate: string
  interestFrequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY'
  startDate: string
  termMonths: string
  contributionAmount: string
  contributionFrequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY'
  linkedAccountId: string
  categoryId: string
  notes: string
  initializedUntil: string
}

const EMPTY: FormState = {
  type: 'CHECKING',
  name: '',
  bank: '',
  iban: '',
  color: '#6366f1',
  currentBalance: '0',
  initialBalance: '0',
  upfrontFee: '0',
  interestRate: '',
  interestFrequency: 'MONTHLY',
  startDate: new Date().toISOString().slice(0, 10),
  termMonths: '',
  contributionAmount: '',
  contributionFrequency: 'MONTHLY',
  linkedAccountId: '',
  categoryId: '',
  notes: '',
  initializedUntil: '',
}

function isSavingsType(type?: string): boolean {
  return type === 'SPARPLAN' || type === 'FESTGELD'
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  account?: Account
}

export function AccountFormDialog({ open, onOpenChange, account }: Props) {
  const qc = useQueryClient()
  const isEdit = !!account
  const [form, setForm] = useState<FormState>(EMPTY)
  const set = (k: keyof FormState, v: string) => setForm(f => ({ ...f, [k]: v }))

  const isSavings = isSavingsType(form.type)
  const isSparplan = form.type === 'SPARPLAN'

  // Date input refs (Safari-safe)
  const startDateInitRef = useRef('')
  const startDateNodeRef = useRef<HTMLInputElement | null>(null)
  const startDateCallbackRef = useCallback((node: HTMLInputElement | null) => {
    startDateNodeRef.current = node
    if (!node) return
    node.value = startDateInitRef.current
    const handler = () => set('startDate', node.value)
    node.addEventListener('change', handler)
    node.addEventListener('input', handler)
    node.addEventListener('blur', handler)
  }, [])

  const initUntilInitRef = useRef('')
  const initUntilNodeRef = useRef<HTMLInputElement | null>(null)
  const initUntilCallbackRef = useCallback((node: HTMLInputElement | null) => {
    initUntilNodeRef.current = node
    if (!node) return
    node.value = initUntilInitRef.current
    const handler = () => set('initializedUntil', node.value)
    node.addEventListener('change', handler)
    node.addEventListener('input', handler)
    node.addEventListener('blur', handler)
  }, [])

  // Load SavingsConfig when editing a savings account
  const { data: savingsConfig, isLoading: savingsLoading } = useQuery({
    queryKey: ['savings', account?.id],
    queryFn: () => fetch(`/api/savings/${account!.id}`).then(r => r.json()),
    enabled: open && isEdit && isSavingsType(account?.type),
  })

  // Load accounts for linked account dropdown
  const { data: allAccounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => fetch('/api/accounts').then(r => r.json()),
    enabled: open && isSavings,
  })

  const giroAccounts = allAccounts.filter(a => !isSavingsType(a.type) && a.isActive)

  // Load categories for linked account
  const { data: categoryGroups = [] } = useQuery<{ id: string; name: string; categories: { id: string; name: string }[] }[]>({
    queryKey: ['account-category-groups', form.linkedAccountId],
    queryFn: () => fetch(`/api/accounts/${form.linkedAccountId}/category-groups`).then(r => r.json()),
    enabled: open && !!form.linkedAccountId,
  })

  // Populate form on open
  useEffect(() => {
    if (!open) return

    if (!isEdit) {
      setForm(EMPTY)
      startDateInitRef.current = EMPTY.startDate
      initUntilInitRef.current = ''
      if (startDateNodeRef.current) startDateNodeRef.current.value = EMPTY.startDate
      if (initUntilNodeRef.current) initUntilNodeRef.current.value = ''
      return
    }

    // Edit mode — regular account
    if (!isSavingsType(account.type)) {
      setForm({
        ...EMPTY,
        type: account.type,
        name: account.name,
        bank: account.bank ?? '',
        iban: account.iban ?? '',
        color: account.color,
        currentBalance: Math.round((account.currentBalance ?? 0) * 100 / 100).toString(),
      })
      return
    }

    // Edit mode — savings: wait for savingsConfig to load (handled in next effect)
  }, [open, isEdit, account])

  // Populate savings fields when savingsConfig loads
  useEffect(() => {
    if (!open || !isEdit || !savingsConfig || savingsConfig.error) return
    if (!isSavingsType(account?.type)) return

    setForm({
      ...EMPTY,
      type: account!.type,
      name: savingsConfig.account?.name ?? account!.name,
      iban: savingsConfig.accountNumber ?? '',
      color: savingsConfig.account?.color ?? account!.color,
      interestRate: (savingsConfig.interestRate * 100).toFixed(2),
      interestFrequency: savingsConfig.interestFrequency ?? 'MONTHLY',
      upfrontFee: (savingsConfig.upfrontFee ?? 0).toString(),
      linkedAccountId: savingsConfig.linkedAccountId ?? '',
      categoryId: savingsConfig.categoryId ?? '',
      notes: savingsConfig.notes ?? '',
      initializedUntil: '',
    })
  }, [open, isEdit, savingsConfig, account])

  // Mutation
  const mutation = useMutation({
    mutationFn: async () => {
      if (isSavings) {
        if (isEdit) {
          // PUT /api/savings/{id}
          const body = {
            name: form.name,
            color: form.color,
            accountNumber: form.iban || null,
            interestRate: parseFloat(form.interestRate.replace(',', '.')) / 100,
            upfrontFee: parseFloat(form.upfrontFee || '0'),
            linkedAccountId: form.linkedAccountId || null,
            categoryId: form.categoryId || null,
            notes: form.notes || null,
            ...(form.initializedUntil && { initializedUntil: form.initializedUntil }),
          }
          const res = await fetch(`/api/savings/${account!.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
          if (!res.ok) throw new Error(await res.text())
        } else {
          // POST /api/savings
          const startDate = startDateNodeRef.current?.value || form.startDate
          const initUntilVal = initUntilNodeRef.current?.value || form.initializedUntil
          const body = {
            name: form.name,
            savingsType: form.type,
            color: form.color,
            initialBalance: parseFloat(form.initialBalance || '0'),
            upfrontFee: parseFloat(form.upfrontFee || '0'),
            accountNumber: form.iban || null,
            interestRate: parseFloat(form.interestRate.replace(',', '.')) / 100,
            interestFrequency: form.interestFrequency,
            startDate,
            termMonths: form.termMonths ? parseInt(form.termMonths) : null,
            ...(isSparplan && {
              contributionAmount: parseFloat(form.contributionAmount.replace(',', '.') || '0'),
              contributionFrequency: form.contributionFrequency,
              linkedAccountId: form.linkedAccountId || null,
              categoryId: form.categoryId || null,
            }),
            notes: form.notes || null,
            initializedUntil: initUntilVal || null,
          }
          const res = await fetch('/api/savings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
          if (!res.ok) throw new Error(await res.text())
        }
      } else {
        // Regular account
        const body = {
          name: form.name,
          bank: form.bank || null,
          iban: form.iban || null,
          type: form.type,
          color: form.color,
          currentBalance: parseFloat(form.currentBalance || '0'),
        }
        const url = isEdit ? `/api/accounts/${account!.id}` : '/api/accounts'
        const res = await fetch(url, {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error(await res.text())
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      if (isSavings) qc.invalidateQueries({ queryKey: ['savings'] })
      toast.success(isEdit ? 'Konto aktualisiert' : 'Konto erstellt')
      onOpenChange(false)
    },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  const isValid = form.name.trim() &&
    (!isSavings || form.interestRate) &&
    (!isSparplan || !(!isEdit && !form.contributionAmount))

  const showSavingsLoading = isEdit && isSavingsType(account?.type) && savingsLoading

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Konto bearbeiten' : 'Neues Konto'}</DialogTitle>
        </DialogHeader>

        {showSavingsLoading ? (
          <div className="py-8 text-center text-muted-foreground">Laden…</div>
        ) : (
          <div className="space-y-4 py-1">
            {/* Kontotyp */}
            <div className="space-y-1.5">
              <Label>Kontotyp *</Label>
              <Select
                value={form.type}
                onValueChange={(v: string | null) => {
                  if (!v || isEdit) return
                  const newType = v as AccountType
                  setForm(f => ({
                    ...EMPTY,
                    type: newType,
                    name: f.name,
                    iban: f.iban,
                    color: isSavingsType(newType) ? '#10b981' : '#6366f1',
                  }))
                }}
                disabled={isEdit}
                itemToStringLabel={(v: string) => ALL_TYPES.find(t => t.value === v)?.label ?? v}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Name + Farbe */}
            <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="z.B. Girokonto" />
              </div>
              <div className="space-y-1.5">
                <Label>Farbe</Label>
                <input
                  type="color"
                  value={form.color}
                  onChange={e => set('color', e.target.value)}
                  className="h-8 w-12 cursor-pointer rounded border"
                />
              </div>
            </div>

            {/* Bank (nur reguläre Konten) */}
            {!isSavings && (
              <div className="space-y-1.5">
                <Label>Bank</Label>
                <Input value={form.bank} onChange={e => set('bank', e.target.value)} placeholder="z.B. Deutsche Bank" />
              </div>
            )}

            {/* IBAN */}
            <div className="space-y-1.5">
              <Label>{isSavings ? 'IBAN / Kontonummer' : 'IBAN'}</Label>
              <Input value={form.iban} onChange={e => set('iban', e.target.value)} placeholder={isSavings ? 'optional' : 'DE89 3704 0044 0532 0130 00'} />
            </div>

            {/* === Reguläre Konten === */}
            {!isSavings && (
              <div className="space-y-1.5">
                <Label>Aktueller Saldo</Label>
                <Input
                  type="number" step="0.01"
                  value={form.currentBalance}
                  onChange={e => set('currentBalance', e.target.value)}
                />
              </div>
            )}

            {/* === Savings-Felder === */}
            {isSavings && (
              <>
                {/* Startkapital (nur Create) */}
                {!isEdit && (
                  <div className="space-y-1.5">
                    <Label>{isSparplan ? 'Startkapital (€)' : 'Einlagenbetrag (€) *'}</Label>
                    <Input
                      type="number" min="0" step="100"
                      value={form.initialBalance}
                      onChange={e => set('initialBalance', e.target.value)}
                      placeholder="0"
                    />
                  </div>
                )}

                {/* Abschlussgebühr */}
                <div className="space-y-1.5">
                  <Label>Abschlussgebühr (€)</Label>
                  <Input
                    type="number" min="0" step="10"
                    value={form.upfrontFee}
                    onChange={e => set('upfrontFee', e.target.value)}
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground">
                    Einmalige Gebühr — wird vom Startkapital abgezogen.
                  </p>
                </div>

                {/* Zinssatz + Zinsgutschrift */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Zinssatz p.a. (%) *</Label>
                    <Input
                      type="number" min="0" step="0.01"
                      value={form.interestRate}
                      onChange={e => set('interestRate', e.target.value)}
                      placeholder="z.B. 3.5"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Zinsgutschrift *</Label>
                    <Select
                      value={form.interestFrequency}
                      onValueChange={(v: string | null) => v && set('interestFrequency', v)}
                      itemToStringLabel={(v: string) => FREQ_LABELS[v] ?? v}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MONTHLY">Monatlich</SelectItem>
                        <SelectItem value="QUARTERLY">Quartärlich</SelectItem>
                        <SelectItem value="ANNUALLY">Jährlich</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Datum + Laufzeit (nur Create) */}
                {!isEdit && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Erste Zahlung / Anlage *</Label>
                      <input
                        ref={startDateCallbackRef}
                        type="date"
                        className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Laufzeit (Monate)</Label>
                      <Input
                        type="number" min="1" step="1"
                        value={form.termMonths}
                        onChange={e => set('termMonths', e.target.value)}
                        placeholder="leer = unbegrenzt"
                      />
                    </div>
                  </div>
                )}

                {/* Sparplan-spezifisch */}
                {isSparplan && (
                  <>
                    {/* Sparrate (nur Create) */}
                    {!isEdit && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>Sparrate (€) *</Label>
                          <Input
                            type="number" min="0" step="10"
                            value={form.contributionAmount}
                            onChange={e => set('contributionAmount', e.target.value)}
                            placeholder="z.B. 100"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Einzahlungsfrequenz *</Label>
                          <Select
                            value={form.contributionFrequency}
                            onValueChange={(v: string | null) => v && set('contributionFrequency', v)}
                            itemToStringLabel={(v: string) => FREQ_LABELS[v] ?? v}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="MONTHLY">Monatlich</SelectItem>
                              <SelectItem value="QUARTERLY">Quartärlich</SelectItem>
                              <SelectItem value="ANNUALLY">Jährlich</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    {/* Verknüpftes Girokonto */}
                    <div className="space-y-1.5">
                      <Label>Verknüpftes Girokonto</Label>
                      <Select
                        value={form.linkedAccountId}
                        onValueChange={(v: string | null) => { set('linkedAccountId', v ?? ''); set('categoryId', '') }}
                        itemToStringLabel={(v: string) => {
                          if (!v) return 'Kein Konto'
                          return giroAccounts.find(a => a.id === v)?.name ?? v
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Kein Konto (optional)" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Kein Konto</SelectItem>
                          {giroAccounts.map(a => (
                            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Wenn verknüpft: Sparraten werden dort als Ausgabe gebucht
                      </p>
                    </div>

                    {/* Buchungskategorie */}
                    {form.linkedAccountId && (
                      <div className="space-y-1.5">
                        <Label>Buchungskategorie</Label>
                        <Select
                          value={form.categoryId}
                          onValueChange={(v: string | null) => set('categoryId', v ?? '')}
                          itemToStringLabel={(v: string) => {
                            if (!v) return 'Keine Kategorie'
                            for (const g of categoryGroups) {
                              const c = g.categories.find(c => c.id === v)
                              if (c) return c.name
                            }
                            return v
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder="Keine Kategorie (optional)" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Keine Kategorie</SelectItem>
                            {categoryGroups.map(g => (
                              <div key={g.id}>
                                <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">{g.name}</div>
                                {g.categories.map(c => (
                                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                              </div>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </>
                )}

                {/* Bezahlt bis */}
                <div className="space-y-1.5">
                  <Label>Bezahlt bis</Label>
                  <input
                    ref={initUntilCallbackRef}
                    type="date"
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                  <p className="text-xs text-muted-foreground">
                    Einträge bis zu diesem Datum werden ohne Transaktion als bezahlt markiert.
                  </p>
                </div>

                {/* Notizen */}
                <div className="space-y-1.5">
                  <Label>Notizen</Label>
                  <Input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="optional" />
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!isValid || mutation.isPending || showSavingsLoading}
          >
            {mutation.isPending ? '…' : isEdit ? 'Speichern' : 'Anlegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
