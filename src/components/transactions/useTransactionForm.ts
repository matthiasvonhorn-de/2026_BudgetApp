'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format } from 'date-fns'
import type { Account, Transaction } from '@/types/api'

// ── Schema & Types ──────────────────────────────────────────────────

export const transactionSchema = z.object({
  date: z.string().min(1),
  amount: z.coerce.number().positive('Betrag muss positiv sein'),
  description: z.string().min(1, 'Beschreibung erforderlich'),
  payee: z.string().optional(),
  accountId: z.string().min(1, 'Konto erforderlich'),
  categoryId: z.string().optional(),
  mainType: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
  notes: z.string().optional(),
})

export type FormValues = z.infer<typeof transactionSchema>

export interface Category {
  id: string
  name: string
  color: string
  type: string
}

export interface CategoryGroup {
  id: string
  name: string
  categories: Category[]
}

export interface SubAccountGroup {
  id: string
  name: string
  subAccount: {
    id: string
    name: string
    account: { id: string; name: string }
  }
}

// ── Transfer State ──────────────────────────────────────────────────

export interface TransferState {
  transferTargetId: string
  setTransferTargetId: (v: string) => void
  transferGroupId: string
  setTransferGroupId: (v: string) => void
  sourceType: 'MAIN' | 'SUB'
  setSourceType: (v: 'MAIN' | 'SUB') => void
  targetType: 'MAIN' | 'SUB'
  setTargetType: (v: 'MAIN' | 'SUB') => void
  sourceSubGroupId: string
  setSourceSubGroupId: (v: string) => void
  sourceCatGroupId: string
  setSourceCatGroupId: (v: string) => void
  sourceCategoryId: string
  setSourceCategoryId: (v: string) => void
  targetCatGroupId: string
  setTargetCatGroupId: (v: string) => void
  targetCategoryId: string
  setTargetCategoryId: (v: string) => void
}

// ── Hook ────────────────────────────────────────────────────────────

interface UseTransactionFormOptions {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultAccountId?: string
  editTransaction?: Transaction | null
}

export function useTransactionForm({
  open,
  onOpenChange,
  defaultAccountId,
  editTransaction,
}: UseTransactionFormOptions) {
  const queryClient = useQueryClient()
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
    resolver: zodResolver(transactionSchema) as any,
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

  // eslint-disable-next-line react-hooks/incompatible-library -- React Hook Form watch() is intentionally incompatible with React Compiler; the compiler skips this component which is acceptable
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

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['transactions'] })
    queryClient.invalidateQueries({ queryKey: ['account-transactions'] })
    queryClient.invalidateQueries({ queryKey: ['accounts'] })
    queryClient.invalidateQueries({ queryKey: ['sub-accounts'] })
    queryClient.invalidateQueries({ queryKey: ['account-budget'] })
    queryClient.invalidateQueries({ queryKey: ['budget'] })
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
      invalidateAll()
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
      invalidateAll()
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

  const transfer: TransferState = {
    transferTargetId,
    setTransferTargetId,
    transferGroupId,
    setTransferGroupId,
    sourceType,
    setSourceType,
    targetType,
    setTargetType,
    sourceSubGroupId,
    setSourceSubGroupId,
    sourceCatGroupId,
    setSourceCatGroupId,
    sourceCategoryId,
    setSourceCategoryId,
    targetCatGroupId,
    setTargetCatGroupId,
    targetCategoryId,
    setTargetCategoryId,
  }

  return {
    form,
    accounts,
    subAccountGroups,
    categoryGroups,
    sourceCategoryGroups,
    targetCategoryGroups,
    groupCategories,
    sourceCatGroupCategories,
    targetCatGroupCategories,
    sourceAccountSubGroups,
    targetAccountSubGroups,
    selectedGroupId,
    setSelectedGroupId,
    transfer,
    isSameAccountTransfer,
    watchedAccountId,
    currentType,
    isSubOnlyTx,
    subGroupInfo,
    mutation,
    handleTypeChange,
    handleGroupChange,
    handleClose,
  }
}
