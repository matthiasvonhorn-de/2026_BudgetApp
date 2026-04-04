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
import type { Account } from '@/types/api'

interface SavingsForm {
  name: string
  savingsType: 'SPARPLAN' | 'FESTGELD'
  color: string
  initialBalance: string
  accountNumber: string
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

const EMPTY: SavingsForm = {
  name: '',
  savingsType: 'SPARPLAN',
  color: '#10b981',
  initialBalance: '0',
  accountNumber: '',
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

const FREQ_LABELS = {
  MONTHLY: 'Monatlich',
  QUARTERLY: 'Quartärlich',
  ANNUALLY: 'Jährlich',
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SavingsFormDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient()
  const [form, setForm] = useState<SavingsForm>(EMPTY)

  // date input via callback ref (Safari-safe)
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

  const initUntilNodeRef = useRef<HTMLInputElement | null>(null)
  const initUntilCallbackRef = useCallback((node: HTMLInputElement | null) => {
    initUntilNodeRef.current = node
    if (!node) return
    const handler = () => set('initializedUntil', node.value)
    node.addEventListener('change', handler)
    node.addEventListener('input', handler)
    node.addEventListener('blur', handler)
  }, [])

  useEffect(() => {
    if (open) {
      setForm(EMPTY)
      startDateInitRef.current = EMPTY.startDate
      if (startDateNodeRef.current) startDateNodeRef.current.value = EMPTY.startDate
    }
  }, [open])

  const set = (k: keyof SavingsForm, v: string) => setForm(f => ({ ...f, [k]: v }))

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => fetch('/api/accounts').then(r => r.json()),
    enabled: open,
  })

  const giroAccounts = accounts.filter((a: Account) =>
    !['SPARPLAN', 'FESTGELD'].includes(a.type) && a.isActive
  )

  const { data: categoryGroups = [] } = useQuery<{ id: string; name: string; categories: { id: string; name: string }[] }[]>({
    queryKey: ['account-category-groups', form.linkedAccountId],
    queryFn: () => fetch(`/api/accounts/${form.linkedAccountId}/category-groups`).then(r => r.json()),
    enabled: open && !!form.linkedAccountId,
  })

  const mutation = useMutation({
    mutationFn: async () => {
      const startDate = startDateNodeRef.current?.value || form.startDate
      const initUntilVal = initUntilNodeRef.current?.value || form.initializedUntil
      const body = {
        name: form.name,
        savingsType: form.savingsType,
        color: form.color,
        initialBalance: parseFloat(form.initialBalance || '0'),
        accountNumber: form.accountNumber || null,
        interestRate: parseFloat(form.interestRate.replace(',', '.')) / 100,
        interestFrequency: form.interestFrequency,
        startDate,
        termMonths: form.termMonths ? parseInt(form.termMonths) : null,
        ...(form.savingsType === 'SPARPLAN' && {
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
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['savings'] })
      toast.success('Sparkonto angelegt')
      onOpenChange(false)
    },
    onError: () => toast.error('Fehler beim Anlegen'),
  })

  const isSparplan = form.savingsType === 'SPARPLAN'
  const isValid = form.name.trim() &&
    form.interestRate &&
    (isSparplan ? form.contributionAmount : true)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Neues Sparkonto / Festgeld</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Typ */}
          <div className="space-y-1.5">
            <Label>Typ *</Label>
            <Select
              value={form.savingsType}
              onValueChange={(v: string | null) => v && set('savingsType', v as SavingsForm['savingsType'])}
              itemToStringLabel={(v: string) => ({ SPARPLAN: 'Sparplan', FESTGELD: 'Festgeld' }[v] ?? v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SPARPLAN">Sparplan</SelectItem>
                <SelectItem value="FESTGELD">Festgeld</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Name + Farbe */}
          <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="z.B. Tagesgeldkonto" />
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

          {/* Kontonummer / IBAN */}
          <div className="space-y-1.5">
            <Label>IBAN / Kontonummer</Label>
            <Input value={form.accountNumber} onChange={e => set('accountNumber', e.target.value)} placeholder="optional" />
          </div>

          {/* Startkapital */}
          <div className="space-y-1.5">
            <Label>{isSparplan ? 'Startkapital (€)' : 'Einlagenbetrag (€) *'}</Label>
            <Input
              type="number" min="0" step="100"
              value={form.initialBalance}
              onChange={e => set('initialBalance', e.target.value)}
              placeholder="0"
            />
          </div>

          {/* Zinssatz + Zinsgutschrift-Frequenz */}
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
                onValueChange={(v: string | null) => v && set('interestFrequency', v as SavingsForm['interestFrequency'])}
                itemToStringLabel={(v: string) => FREQ_LABELS[v as keyof typeof FREQ_LABELS] ?? v}
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

          {/* Datum + Laufzeit */}
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

          {/* Sparplan-spezifische Felder */}
          {isSparplan && (
            <>
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
                    onValueChange={(v: string | null) => v && set('contributionFrequency', v as SavingsForm['contributionFrequency'])}
                    itemToStringLabel={(v: string) => FREQ_LABELS[v as keyof typeof FREQ_LABELS] ?? v}
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

              <div className="space-y-1.5">
                <Label>Verknüpftes Girokonto</Label>
                <Select
                  value={form.linkedAccountId}
                  onValueChange={(v: string | null) => { set('linkedAccountId', v ?? ''); set('categoryId', '') }}
                  items={giroAccounts.map((a: Account) => ({ value: a.id, label: a.name }))}
                >
                  <SelectTrigger><SelectValue placeholder="Kein Konto (optional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Kein Konto</SelectItem>
                    {giroAccounts.map((a: Account) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Wenn verknüpft: Sparraten werden dort als Ausgabe gebucht
                </p>
              </div>

              {form.linkedAccountId && (
                <div className="space-y-1.5">
                  <Label>Buchungskategorie</Label>
                  <Select
                    value={form.categoryId}
                    onValueChange={(v: string | null) => set('categoryId', v ?? '')}
                    items={categoryGroups.flatMap(g => g.categories.map(c => ({ value: c.id, label: c.name })))}
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

          {/* Bezahlt bis (Initialisierung) */}
          <div className="space-y-1.5">
            <Label>Bezahlt bis (Initialisierung)</Label>
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={() => mutation.mutate()} disabled={!isValid || mutation.isPending}>
            {mutation.isPending ? '…' : 'Anlegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
