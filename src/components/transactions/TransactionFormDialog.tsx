'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { format } from 'date-fns'
import { useSettingsStore } from '@/store/useSettingsStore'
import type { Account, Transaction } from '@/types/api'

const schema = z.object({
  date: z.string().min(1),
  amount: z.coerce.number().positive('Betrag muss positiv sein'),
  description: z.string().min(1, 'Beschreibung erforderlich'),
  payee: z.string().optional(),
  accountId: z.string().min(1, 'Konto erforderlich'),
  categoryId: z.string().optional(),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface Category {
  id: string
  name: string
  color: string
  type: string
}

interface CategoryGroup {
  id: string
  name: string
  categories: Category[]
}

interface SubAccountGroup {
  id: string
  name: string
  subAccount: {
    id: string
    name: string
    account: { id: string; name: string }
  }
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultAccountId?: string
  hideAccountSelector?: boolean
  editTransaction?: Transaction | null
}

export function TransactionFormDialog({ open, onOpenChange, defaultAccountId, hideAccountSelector, editTransaction }: Props) {
  const queryClient = useQueryClient()
  const { currency } = useSettingsStore()
  const [transferTargetId, setTransferTargetId] = useState('')
  const [transferGroupId, setTransferGroupId] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState('')

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => fetch('/api/accounts').then(r => r.json()),
  })

  const { data: subAccountGroups = [] } = useQuery<SubAccountGroup[]>({
    queryKey: ['sub-account-groups'],
    queryFn: () => fetch('/api/sub-account-groups').then(r => r.json()),
  })

  const form = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: {
      date: format(new Date(), 'yyyy-MM-dd'),
      amount: 0,
      description: '',
      payee: '',
      accountId: '',
      categoryId: '',
      type: 'EXPENSE',
      notes: '',
    },
  })

  const watchedAccountId = form.watch('accountId')
  const currentType = form.watch('type')

  // Kategoriegruppen des gewählten Kontos laden
  const { data: categoryGroups = [] } = useQuery<CategoryGroup[]>({
    queryKey: ['category-groups', watchedAccountId],
    queryFn: () => fetch(`/api/category-groups?accountId=${watchedAccountId}`).then(r => r.json()),
    enabled: !!watchedAccountId && currentType !== 'TRANSFER',
  })

  // Wenn Dialog öffnet: Transaktion vorbelegen (Edit) oder Standard-Konto setzen (Create)
  useEffect(() => {
    if (!open) return
    if (editTransaction) {
      form.reset({
        date: format(new Date(editTransaction.date), 'yyyy-MM-dd'),
        amount: Math.abs(editTransaction.amount),
        description: editTransaction.description,
        payee: editTransaction.payee ?? '',
        accountId: editTransaction.accountId,
        categoryId: editTransaction.categoryId ?? '',
        type: editTransaction.type,
        notes: editTransaction.notes ?? '',
      })
    } else if (defaultAccountId) {
      form.setValue('accountId', defaultAccountId)
    }
  }, [open, editTransaction, defaultAccountId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Wenn Konto wechselt: Gruppe und Kategorie zurücksetzen (nur im Create-Modus)
  useEffect(() => {
    if (editTransaction) return // Im Edit-Modus nicht zurücksetzen — der Prefill-Effect übernimmt
    setSelectedGroupId('')
    form.setValue('categoryId', '')
  }, [watchedAccountId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Im Edit-Modus: Gruppe und Kategorie setzen, sobald categoryGroups geladen sind
  useEffect(() => {
    if (!editTransaction || !categoryGroups.length) return
    const categoryId = editTransaction.categoryId
    if (!categoryId) return
    const group = categoryGroups.find(g => g.categories.some(c => c.id === categoryId))
    if (group) {
      setSelectedGroupId(group.id)
      form.setValue('categoryId', categoryId)
    }
  }, [editTransaction, categoryGroups]) // eslint-disable-line react-hooks/exhaustive-deps

  // Kategorien der ausgewählten Gruppe
  const groupCategories = selectedGroupId
    ? (categoryGroups.find(g => g.id === selectedGroupId)?.categories ?? [])
    : []

  // Für Transfer: Sub-Account-Gruppen des Zielkontos
  const targetAccountSubGroups = subAccountGroups.filter(
    g => g.subAccount.account.id === transferTargetId,
  )
  const transferSubGroupCategories: Category[] = [] // Transfer-Kategorie über Sub-Account-Gruppen (bestehende Logik)

  function handleTypeChange(v: string) {
    form.setValue('type', v as FormValues['type'])
    setTransferTargetId('')
    setTransferGroupId('')
    setSelectedGroupId('')
    form.setValue('categoryId', '')
  }

  function handleGroupChange(groupId: string) {
    setSelectedGroupId(groupId)
    form.setValue('categoryId', '')
  }

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const amount = values.type === 'INCOME' ? Math.abs(values.amount) : -Math.abs(values.amount)
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          amount,
          categoryId: values.categoryId || null,
          payee: values.payee || null,
        }),
      })
      if (!res.ok) throw new Error('Fehler')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['sub-accounts'] })
      toast.success('Transaktion erstellt')
      handleClose()
    },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  const updateMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const amount = values.type === 'INCOME' ? Math.abs(values.amount) : -Math.abs(values.amount)
      const res = await fetch(`/api/transactions/${editTransaction!.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: values.date,
          amount,
          description: values.description,
          payee: values.payee || null,
          notes: values.notes || null,
          categoryId: values.categoryId || null,
          status: editTransaction!.status,
        }),
      })
      if (!res.ok) throw new Error('Fehler')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['sub-accounts'] })
      toast.success('Transaktion aktualisiert')
      handleClose()
    },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  const mutation = editTransaction ? updateMutation : createMutation

  function handleClose() {
    onOpenChange(false)
    form.reset({ date: format(new Date(), 'yyyy-MM-dd'), type: 'EXPENSE', amount: 0 })
    setTransferTargetId('')
    setTransferGroupId('')
    setSelectedGroupId('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editTransaction ? 'Transaktion bearbeiten' : 'Neue Transaktion'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">

            {/* Typ */}
            <FormField control={form.control} name="type" render={({ field }) => (
              <FormItem>
                <FormLabel>Typ</FormLabel>
                <Select
                  onValueChange={(v) => v && handleTypeChange(v)}
                  value={field.value}
                  itemToStringLabel={(v: string) => ({ EXPENSE: 'Ausgabe', INCOME: 'Einnahme', TRANSFER: 'Umbuchung' }[v] ?? v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Typ wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EXPENSE">Ausgabe</SelectItem>
                    <SelectItem value="INCOME">Einnahme</SelectItem>
                    <SelectItem value="TRANSFER">Umbuchung</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )} />

            {/* Datum */}
            <FormField control={form.control} name="date" render={({ field }) => (
              <FormItem>
                <FormLabel>Datum *</FormLabel>
                <FormControl><Input type="date" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Beschreibung */}
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Beschreibung *</FormLabel>
                <FormControl><Input placeholder="z.B. REWE Einkauf" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Auftraggeber */}
            {currentType !== 'TRANSFER' && (
              <FormField control={form.control} name="payee" render={({ field }) => (
                <FormItem>
                  <FormLabel>Auftraggeber / Empfänger</FormLabel>
                  <FormControl><Input placeholder="optional" {...field} /></FormControl>
                </FormItem>
              )} />
            )}

            {/* Betrag */}
            <FormField control={form.control} name="amount" render={({ field }) => (
              <FormItem>
                <FormLabel>Betrag ({currency}) *</FormLabel>
                <FormControl><Input type="number" step="0.01" min="0" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {currentType === 'TRANSFER' ? (
              <>
                {/* Von Konto */}
                <FormField control={form.control} name="accountId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Von Konto *</FormLabel>
                    <Select
                      onValueChange={(v) => {
                        field.onChange(v)
                        setTransferTargetId('')
                        setTransferGroupId('')
                        form.setValue('categoryId', '')
                      }}
                      value={field.value}
                      items={accounts.map((a: Account) => ({ value: a.id, label: a.name }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Quellkonto wählen" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((a: Account) => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Auf Konto */}
                <FormItem>
                  <FormLabel>Auf Konto *</FormLabel>
                  <Select
                    onValueChange={(v) => {
                      if (v !== null) setTransferTargetId(v)
                      setTransferGroupId('')
                      form.setValue('categoryId', '')
                    }}
                    value={transferTargetId}
                    disabled={!form.watch('accountId')}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Zielkonto wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts
                        .filter((a: Account) => a.id !== form.watch('accountId'))
                        .map((a: Account) => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </FormItem>

                {/* Sub-Account-Gruppe (nur wenn Zielkonto Sub-Account-Gruppen hat) */}
                {transferTargetId && targetAccountSubGroups.length > 0 && (
                  <FormItem>
                    <FormLabel>Gruppe</FormLabel>
                    <Select
                      onValueChange={(v) => {
                        if (v !== null) setTransferGroupId(v)
                        form.setValue('categoryId', '')
                      }}
                      value={transferGroupId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Gruppe wählen" />
                      </SelectTrigger>
                      <SelectContent>
                        {targetAccountSubGroups.map(g => (
                          <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}

                {/* Kategorie für Transfer (über Sub-Account-Gruppen) */}
                {transferGroupId && transferSubGroupCategories.length > 0 && (
                  <FormField control={form.control} name="categoryId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kategorie</FormLabel>
                      <Select onValueChange={(v) => field.onChange(v)} value={field.value ?? ''}>
                        <SelectTrigger>
                          <SelectValue placeholder="Kategorie wählen" />
                        </SelectTrigger>
                        <SelectContent>
                          {transferSubGroupCategories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                )}
              </>
            ) : (
              <>
                {/* Konto (nur wenn nicht vorbelegt) */}
                {!hideAccountSelector && (
                  <FormField control={form.control} name="accountId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Konto *</FormLabel>
                      <Select
                        onValueChange={(v) => v && field.onChange(v)}
                        value={field.value}
                        items={accounts.map((a: Account) => ({ value: a.id, label: a.name }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Konto wählen" />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts.map((a: Account) => (
                            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}

                {/* Gruppe (nur wenn Konto gewählt und Gruppen vorhanden) */}
                {watchedAccountId && categoryGroups.length > 0 && (
                  <FormItem>
                    <FormLabel>Gruppe</FormLabel>
                    <Select
                      onValueChange={(v) => handleGroupChange(v === '__none__' ? '' : (v ?? ''))}
                      value={selectedGroupId || '__none__'}
                      items={[{ value: '__none__', label: '— Keine Gruppe —' }, ...categoryGroups.map(g => ({ value: g.id, label: g.name }))]}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Gruppe wählen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Keine Gruppe —</SelectItem>
                        {categoryGroups.map(g => (
                          <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}

                {/* Kategorie (nur wenn Gruppe gewählt) */}
                {selectedGroupId && (
                  <FormField control={form.control} name="categoryId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kategorie</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}
                        value={field.value || '__none__'}
                        items={[{ value: '__none__', label: '— Keine Kategorie —' }, ...groupCategories.map(c => ({ value: c.id, label: c.name }))]}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Kategorie wählen" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Keine Kategorie —</SelectItem>
                          {groupCategories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              <span className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: c.color }} />
                                {c.name}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                )}
              </>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>Abbrechen</Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Speichern...' : 'Speichern'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
