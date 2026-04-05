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
  mainType: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
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

  // Transfer-specific state
  const [sourceType, setSourceType] = useState<'MAIN' | 'SUB'>('MAIN')
  const [targetType, setTargetType] = useState<'MAIN' | 'SUB'>('MAIN')
  const [sourceSubGroupId, setSourceSubGroupId] = useState('')
  const [sourceCatGroupId, setSourceCatGroupId] = useState('')
  const [sourceCategoryId, setSourceCategoryId] = useState('')
  const [targetCatGroupId, setTargetCatGroupId] = useState('')
  const [targetCategoryId, setTargetCategoryId] = useState('')

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
      mainType: 'EXPENSE',
      notes: '',
    },
  })

  const watchedAccountId = form.watch('accountId')
  const currentType = form.watch('mainType')

  // Kategoriegruppen des gewählten Kontos laden
  const { data: categoryGroups = [] } = useQuery<CategoryGroup[]>({
    queryKey: ['category-groups', watchedAccountId],
    queryFn: () => fetch(`/api/category-groups?accountId=${watchedAccountId}`).then(r => r.json()),
    enabled: !!watchedAccountId && currentType !== 'TRANSFER',
  })

  // Transfer: Kategoriegruppen des Quellkontos
  const { data: sourceCategoryGroups = [] } = useQuery<CategoryGroup[]>({
    queryKey: ['category-groups', watchedAccountId],
    queryFn: () => fetch(`/api/category-groups?accountId=${watchedAccountId}`).then(r => r.json()),
    enabled: !!watchedAccountId && currentType === 'TRANSFER' && sourceType === 'MAIN',
  })

  // Transfer: Kategoriegruppen des Zielkontos
  const { data: targetCategoryGroups = [] } = useQuery<CategoryGroup[]>({
    queryKey: ['category-groups', transferTargetId],
    queryFn: () => fetch(`/api/category-groups?accountId=${transferTargetId}`).then(r => r.json()),
    enabled: !!transferTargetId && currentType === 'TRANSFER' && targetType === 'MAIN',
  })

  // Wenn Dialog öffnet: Transaktion vorbelegen (Edit) oder Standard-Konto setzen (Create)
  useEffect(() => {
    if (!open) return
    if (editTransaction) {
      const displayAmount = editTransaction.mainAmount != null ? editTransaction.mainAmount : (editTransaction.subAmount ?? 0)
      form.reset({
        date: format(new Date(editTransaction.date), 'yyyy-MM-dd'),
        amount: Math.abs(displayAmount),
        description: editTransaction.description,
        payee: editTransaction.payee ?? '',
        accountId: editTransaction.accountId,
        categoryId: editTransaction.categoryId ?? '',
        mainType: editTransaction.mainType,
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

  // Transfer: Sub-Account-Gruppen des Quellkontos
  const sourceAccountSubGroups = subAccountGroups.filter(
    g => g.subAccount.account.id === watchedAccountId,
  )

  // Transfer: Kategorien der gewählten Quell-Gruppe
  const sourceCatGroupCategories = sourceCatGroupId
    ? (sourceCategoryGroups.find(g => g.id === sourceCatGroupId)?.categories ?? [])
    : []

  // Transfer: Kategorien der gewählten Ziel-Gruppe
  const targetCatGroupCategories = targetCatGroupId
    ? (targetCategoryGroups.find(g => g.id === targetCatGroupId)?.categories ?? [])
    : []

  // Für Transfer: Sub-Account-Gruppen des Zielkontos
  const targetAccountSubGroups = subAccountGroups.filter(
    g => g.subAccount.account.id === transferTargetId,
  )

  // Same-Account-Check for transfer
  const isSameAccountTransfer = watchedAccountId && transferTargetId && watchedAccountId === transferTargetId

  function handleTypeChange(v: string) {
    form.setValue('mainType', v as FormValues['mainType'])
    setTransferTargetId('')
    setTransferGroupId('')
    setSelectedGroupId('')
    form.setValue('categoryId', '')
    // Reset transfer-specific state
    setSourceType('MAIN')
    setTargetType('MAIN')
    setSourceSubGroupId('')
    setSourceCatGroupId('')
    setSourceCategoryId('')
    setTargetCatGroupId('')
    setTargetCategoryId('')
  }

  function handleGroupChange(groupId: string) {
    setSelectedGroupId(groupId)
    form.setValue('categoryId', '')
  }

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (values.mainType === 'TRANSFER') {
        // Transfer: build payload for new transfer handling
        const amount = Math.abs(values.amount)
        const res = await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: values.date,
            mainAmount: sourceType === 'MAIN' ? -amount : null,
            mainType: sourceType === 'MAIN' ? 'EXPENSE' : 'INCOME',
            subAmount: sourceType === 'SUB' ? -amount : null,
            subType: sourceType === 'SUB' ? 'EXPENSE' : null,
            description: values.description,
            accountId: values.accountId,
            categoryId: sourceType === 'MAIN' ? sourceCategoryId || null : null,
            sourceType,
            sourceGroupId: sourceType === 'SUB' ? sourceSubGroupId : undefined,
            sourceCategoryId: sourceType === 'MAIN' ? sourceCategoryId : undefined,
            transferTargetAccountId: transferTargetId,
            transferTargetType: targetType,
            transferTargetCategoryId: targetType === 'MAIN' ? targetCategoryId : undefined,
            transferTargetGroupId: targetType === 'SUB' ? transferGroupId : undefined,
          }),
        })
        if (!res.ok) throw new Error('Fehler')
        return res.json()
      }

      const mainAmount = values.mainType === 'INCOME' ? Math.abs(values.amount) : -Math.abs(values.amount)
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: values.date,
          mainAmount,
          mainType: values.mainType,
          description: values.description,
          payee: values.payee || null,
          notes: values.notes || null,
          accountId: values.accountId,
          categoryId: values.categoryId || null,
        }),
      })
      if (!res.ok) throw new Error('Fehler')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['account-transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['sub-accounts'] })
      queryClient.invalidateQueries({ queryKey: ['account-budget'] })
      queryClient.invalidateQueries({ queryKey: ['budget'] })
      toast.success('Transaktion erstellt')
      handleClose()
    },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  const updateMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const isSubOnly = editTransaction!.mainAmount == null && editTransaction!.subAccountEntryId != null

      let body: Record<string, unknown>
      if (isSubOnly) {
        // Sub-Only-TX: nur subAmount/description/date ändern, mainAmount bleibt null
        const subAmount = -Math.abs(values.amount) // Sub-Entries sind negativ (Allokation)
        body = {
          date: values.date,
          subAmount,
          description: values.description,
          status: editTransaction!.status,
        }
      } else {
        const mainAmount = values.mainType === 'INCOME' ? Math.abs(values.amount) : -Math.abs(values.amount)
        body = {
          date: values.date,
          mainAmount,
          mainType: values.mainType,
          description: values.description,
          payee: values.payee || null,
          notes: values.notes || null,
          categoryId: values.categoryId || null,
          status: editTransaction!.status,
        }
      }

      const res = await fetch(`/api/transactions/${editTransaction!.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Fehler')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['account-transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['sub-accounts'] })
      queryClient.invalidateQueries({ queryKey: ['account-budget'] })
      queryClient.invalidateQueries({ queryKey: ['budget'] })
      toast.success('Transaktion aktualisiert')
      handleClose()
    },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  const mutation = editTransaction ? updateMutation : createMutation

  function handleClose() {
    onOpenChange(false)
    form.reset({ date: format(new Date(), 'yyyy-MM-dd'), mainType: 'EXPENSE', amount: 0 })
    setTransferTargetId('')
    setTransferGroupId('')
    setSelectedGroupId('')
    // Reset transfer-specific state
    setSourceType('MAIN')
    setTargetType('MAIN')
    setSourceSubGroupId('')
    setSourceCatGroupId('')
    setSourceCategoryId('')
    setTargetCatGroupId('')
    setTargetCategoryId('')
  }

  // Erkennung: Ist das eine Sub-Account-TX (nur Unterkonto, kein Hauptkonto)?
  const isSubOnlyTx = editTransaction?.subAccountEntry != null && editTransaction?.mainAmount == null
  const subGroupInfo = editTransaction?.subAccountEntry?.group

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editTransaction ? 'Transaktion bearbeiten' : 'Neue Transaktion'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">

            {/* Typ — read-only bei Sub-Only-TX */}
            {isSubOnlyTx ? (
              <FormItem>
                <FormLabel>Typ</FormLabel>
                <p className="text-sm text-muted-foreground">Unterkonto-Buchung</p>
              </FormItem>
            ) : (
              <FormField control={form.control} name="mainType" render={({ field }) => (
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
            )}

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

            {isSubOnlyTx ? (
              <>
                {/* Sub-Only-TX: Konto und Unterkonto-Gruppe als Info */}
                <FormItem>
                  <FormLabel>Konto</FormLabel>
                  <p className="text-sm">{editTransaction?.account?.name ?? '—'}</p>
                </FormItem>
                {subGroupInfo && (
                  <>
                    <FormItem>
                      <FormLabel>Unterkonto</FormLabel>
                      <p className="text-sm">{subGroupInfo.subAccount.name}</p>
                    </FormItem>
                    <FormItem>
                      <FormLabel>Gruppe</FormLabel>
                      <p className="text-sm">{subGroupInfo.name}</p>
                    </FormItem>
                  </>
                )}
              </>
            ) : currentType === 'TRANSFER' ? (
              editTransaction?.transferToId != null ? (
                /* ── Edit Transfer: read-only summary ── */
                <>
                  <FormItem>
                    <FormLabel>Von Konto</FormLabel>
                    <p className="text-sm">{editTransaction.account?.name ?? '—'}</p>
                  </FormItem>
                  <FormItem>
                    <FormLabel>Auf Konto</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      {/* transferToId exists but we don't have the target account name directly */}
                      Umbuchung (nur Betrag bearbeitbar)
                    </p>
                  </FormItem>
                </>
              ) : (
                /* ── Create Transfer: full form ── */
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
                          setSourceSubGroupId('')
                          setSourceCatGroupId('')
                          setSourceCategoryId('')
                          setTargetCatGroupId('')
                          setTargetCategoryId('')
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

                  {/* Buchungsart Quelle */}
                  {watchedAccountId && (
                    <FormItem>
                      <FormLabel>Buchungsart Quelle *</FormLabel>
                      <Select
                        onValueChange={(v) => {
                          const newVal = v as 'MAIN' | 'SUB'
                          setSourceType(newVal)
                          setSourceSubGroupId('')
                          setSourceCatGroupId('')
                          setSourceCategoryId('')
                          // Same-account sync: keep types identical
                          if (isSameAccountTransfer) {
                            setTargetType(newVal)
                            setTransferGroupId('')
                            setTargetCatGroupId('')
                            setTargetCategoryId('')
                          }
                        }}
                        value={sourceType}
                        items={[{ value: 'MAIN', label: 'Hauptkonto' }, { value: 'SUB', label: 'Unterkonto' }]}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Buchungsart wählen" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MAIN">Hauptkonto</SelectItem>
                          <SelectItem value="SUB">Unterkonto</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}

                  {/* Source: Hauptkonto → Gruppe + Kategorie */}
                  {watchedAccountId && sourceType === 'MAIN' && (
                    <>
                      <FormItem>
                        <FormLabel>Gruppe (Quelle) *</FormLabel>
                        <Select
                          onValueChange={(v) => {
                            if (v !== null) setSourceCatGroupId(v)
                            setSourceCategoryId('')
                          }}
                          value={sourceCatGroupId}
                          items={sourceCategoryGroups.map(g => ({ value: g.id, label: g.name }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Gruppe wählen" />
                          </SelectTrigger>
                          <SelectContent>
                            {sourceCategoryGroups.map(g => (
                              <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                      {sourceCatGroupId && sourceCatGroupCategories.length > 0 && (
                        <FormItem>
                          <FormLabel>Kategorie (Quelle) *</FormLabel>
                          <Select
                            onValueChange={(v) => { if (v !== null) setSourceCategoryId(v) }}
                            value={sourceCategoryId}
                            items={sourceCatGroupCategories.map(c => ({ value: c.id, label: c.name }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Kategorie wählen" />
                            </SelectTrigger>
                            <SelectContent>
                              {sourceCatGroupCategories.map(c => (
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
                      )}
                    </>
                  )}

                  {/* Source: Unterkonto → Sub-Account-Gruppe */}
                  {watchedAccountId && sourceType === 'SUB' && sourceAccountSubGroups.length > 0 && (
                    <FormItem>
                      <FormLabel>Gruppe (Quelle) *</FormLabel>
                      <Select
                        onValueChange={(v) => { if (v !== null) setSourceSubGroupId(v) }}
                        value={sourceSubGroupId}
                        items={sourceAccountSubGroups.map(g => ({ value: g.id, label: g.name }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Unterkonto-Gruppe wählen" />
                        </SelectTrigger>
                        <SelectContent>
                          {sourceAccountSubGroups.map(g => (
                            <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}

                  {/* Auf Konto */}
                  {watchedAccountId && (
                    <FormItem>
                      <FormLabel>Auf Konto *</FormLabel>
                      <Select
                        onValueChange={(v) => {
                          if (v !== null) setTransferTargetId(v)
                          setTransferGroupId('')
                          setTargetCatGroupId('')
                          setTargetCategoryId('')
                          // Same-account sync: when switching to same account, sync target type
                          if (v === watchedAccountId) {
                            setTargetType(sourceType)
                          }
                        }}
                        value={transferTargetId}
                        items={accounts.map((a: Account) => ({ value: a.id, label: a.name }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Zielkonto wählen" />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts.map((a: Account) => (
                            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}

                  {/* Buchungsart Ziel */}
                  {transferTargetId && (
                    <FormItem>
                      <FormLabel>Buchungsart Ziel *</FormLabel>
                      <Select
                        onValueChange={(v) => {
                          const newVal = v as 'MAIN' | 'SUB'
                          setTargetType(newVal)
                          setTransferGroupId('')
                          setTargetCatGroupId('')
                          setTargetCategoryId('')
                          // Same-account sync: keep types identical
                          if (isSameAccountTransfer) {
                            setSourceType(newVal)
                            setSourceSubGroupId('')
                            setSourceCatGroupId('')
                            setSourceCategoryId('')
                          }
                        }}
                        value={isSameAccountTransfer ? sourceType : targetType}
                        items={[{ value: 'MAIN', label: 'Hauptkonto' }, { value: 'SUB', label: 'Unterkonto' }]}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Buchungsart wählen" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MAIN">Hauptkonto</SelectItem>
                          <SelectItem value="SUB">Unterkonto</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}

                  {/* Target: Hauptkonto → Gruppe + Kategorie */}
                  {transferTargetId && targetType === 'MAIN' && (
                    <>
                      <FormItem>
                        <FormLabel>Gruppe (Ziel) *</FormLabel>
                        <Select
                          onValueChange={(v) => {
                            if (v !== null) setTargetCatGroupId(v)
                            setTargetCategoryId('')
                          }}
                          value={targetCatGroupId}
                          items={targetCategoryGroups.map(g => ({ value: g.id, label: g.name }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Gruppe wählen" />
                          </SelectTrigger>
                          <SelectContent>
                            {targetCategoryGroups.map(g => (
                              <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                      {targetCatGroupId && targetCatGroupCategories.length > 0 && (
                        <FormItem>
                          <FormLabel>Kategorie (Ziel) *</FormLabel>
                          <Select
                            onValueChange={(v) => { if (v !== null) setTargetCategoryId(v) }}
                            value={targetCategoryId}
                            items={targetCatGroupCategories.map(c => ({ value: c.id, label: c.name }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Kategorie wählen" />
                            </SelectTrigger>
                            <SelectContent>
                              {targetCatGroupCategories.map(c => (
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
                      )}
                    </>
                  )}

                  {/* Target: Unterkonto → Sub-Account-Gruppe */}
                  {transferTargetId && targetType === 'SUB' && targetAccountSubGroups.length > 0 && (
                    <FormItem>
                      <FormLabel>Gruppe (Ziel) *</FormLabel>
                      <Select
                        onValueChange={(v) => {
                          if (v !== null) setTransferGroupId(v)
                        }}
                        value={transferGroupId}
                        items={targetAccountSubGroups.map(g => ({ value: g.id, label: g.name }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Unterkonto-Gruppe wählen" />
                        </SelectTrigger>
                        <SelectContent>
                          {targetAccountSubGroups.map(g => (
                            <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                </>
              )
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
