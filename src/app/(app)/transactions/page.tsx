'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink,
  PaginationPrevious, PaginationNext, PaginationEllipsis,
} from '@/components/ui/pagination'
import { format } from 'date-fns'
import { formatDate } from '@/lib/utils'
import { AppSelect } from '@/components/ui/app-select'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import { TransactionFormDialog } from '@/components/transactions/TransactionFormDialog'
import { toast } from 'sonner'
import type { Transaction, TransactionPage, LoanPaymentRef, Account } from '@/types/api'

const PAGE_SIZES = [100, 250, 500, 1000, 0] as const

function getPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | 'ellipsis')[] = [1]
  if (current > 3) pages.push('ellipsis')
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.push(i)
  }
  if (current < total - 2) pages.push('ellipsis')
  pages.push(total)
  return pages
}

export default function TransactionsPage() {
  const fmt = useFormatCurrency()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; loanPayment: LoanPaymentRef } | null>(null)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [editingRows, setEditingRows] = useState<Record<string, Partial<{
    date: string
    description: string
    amount: number
    accountId: string
    categoryId: string | null
  }>>>({})
  const [isSaving, setIsSaving] = useState(false)
  const queryClient = useQueryClient()

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [search])

  const { data: result, isLoading, isPlaceholderData } = useQuery<TransactionPage>({
    queryKey: ['transactions', debouncedSearch, page, pageSize],
    queryFn: () => {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      params.set('page', String(page))
      params.set('pageSize', String(pageSize))
      return fetch(`/api/transactions?${params}`).then(r => r.json())
    },
    placeholderData: (prev) => prev,
  })

  const transactions = result?.data ?? []
  const total = result?.total ?? 0
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 1

  const { data: allAccounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => fetch('/api/accounts').then(r => r.json()),
    enabled: isEditMode,
  })

  const deleteMutation = useMutation({
    mutationFn: ({ id, revertLoan }: { id: string; revertLoan: boolean }) =>
      fetch(`/api/transactions/${id}?revertLoan=${revertLoan}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: (_, { revertLoan }) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['account-transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['sub-accounts'] })
      queryClient.invalidateQueries({ queryKey: ['account-budget'] })
      queryClient.invalidateQueries({ queryKey: ['budget'] })
      if (revertLoan) queryClient.invalidateQueries({ queryKey: ['loans'] })
      setPendingDelete(null)
      toast.success('Transaktion gelöscht')
    },
  })

  const handleDeleteClick = (t: Transaction) => {
    if (t.loanPayment) {
      setPendingDelete({ id: t.id, loanPayment: t.loanPayment })
    } else {
      if (confirm('Transaktion löschen?')) deleteMutation.mutate({ id: t.id, revertLoan: false })
    }
  }

  async function handleBatchSave() {
    setIsSaving(true)
    const errors: string[] = []

    for (const [id, changes] of Object.entries(editingRows)) {
      try {
        const original = transactions.find(t => t.id === id)
        if (!original) continue

        const body: Record<string, unknown> = {}
        if (changes.date !== undefined) body.date = changes.date
        if (changes.description !== undefined) body.description = changes.description
        if (changes.amount !== undefined) {
          body.mainAmount = original.mainType === 'INCOME' ? Math.abs(changes.amount) : -Math.abs(changes.amount)
        }
        if (changes.accountId !== undefined) body.accountId = changes.accountId
        if (changes.categoryId !== undefined) body.categoryId = changes.categoryId || null

        const res = await fetch(`/api/transactions/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error(`Fehler bei Transaktion ${original.description}`)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : 'Unbekannter Fehler')
      }
    }

    queryClient.invalidateQueries({ queryKey: ['transactions'] })
    queryClient.invalidateQueries({ queryKey: ['accounts'] })
    queryClient.invalidateQueries({ queryKey: ['sub-accounts'] })

    if (errors.length > 0) {
      toast.error(`${errors.length} Fehler beim Speichern`)
    } else {
      toast.success('Alle Änderungen gespeichert')
      setIsEditMode(false)
      setEditingRows({})
    }
    setIsSaving(false)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Transaktionen</h1>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Neue Transaktion
        </Button>
      </div>

      <div className="mb-4 flex items-center gap-4">
        <Input
          placeholder="Suchen nach Beschreibung oder Empfänger..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-sm text-muted-foreground">Pro Seite:</span>
          <Select
            value={String(pageSize)}
            onValueChange={v => { setPageSize(Number(v)); setPage(1) }}
          >
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map(size => (
                <SelectItem key={size} value={String(size)}>
                  {size === 0 ? 'Alle' : size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">{total} gesamt</span>
        </div>
      </div>

      <div className={`rounded-lg border overflow-hidden ${isPlaceholderData ? 'opacity-60' : ''}`}>
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left p-3 font-medium">Datum</th>
              <th className="text-left p-3 font-medium">Beschreibung</th>
              <th className="text-left p-3 font-medium">Konto</th>
              <th className="text-left p-3 font-medium">Kategorie</th>
              <th className="text-right p-3 font-medium">Betrag</th>
              <th className="p-3">
                {isEditMode ? (
                  <div className="flex items-center gap-1 justify-end">
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 px-2"
                      onClick={handleBatchSave}
                      disabled={isSaving || Object.keys(editingRows).length === 0}
                    >
                      {isSaving ? 'Speichern...' : 'Speichern'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => { setIsEditMode(false); setEditingRows({}) }}
                      disabled={isSaving}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-foreground h-7 px-2"
                    onClick={() => setIsEditMode(true)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Laden...</td></tr>
            ) : transactions.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Keine Transaktionen gefunden</td></tr>
            ) : transactions.map((t: Transaction) => {
              if (isEditMode) {
                const rowChanges = editingRows[t.id]
                const isChanged = !!rowChanges
                const hasEntry = !!t.subAccountEntryId

                const currentDate = rowChanges?.date ?? format(new Date(t.date), 'yyyy-MM-dd')
                const currentDesc = rowChanges?.description ?? t.description
                const displayAmount = t.mainAmount != null ? t.mainAmount : (t.subAmount ?? 0)
                const currentAmount = rowChanges?.amount ?? Math.abs(displayAmount)

                function updateRow(field: string, value: unknown) {
                  setEditingRows(prev => ({
                    ...prev,
                    [t.id]: { ...prev[t.id], [field]: value },
                  }))
                }

                return (
                  <tr key={t.id} className={`border-t ${isChanged ? 'bg-amber-50 dark:bg-amber-950/20' : 'hover:bg-muted/50'}`}>
                    <td className="p-2">
                      <Input type="date" value={currentDate} onChange={e => updateRow('date', e.target.value)} className="h-8 text-sm w-32" />
                    </td>
                    <td className="p-2">
                      <Input value={currentDesc} onChange={e => updateRow('description', e.target.value)} className="h-8 text-sm" />
                    </td>
                    <td className="p-2">
                      {hasEntry ? (
                        <span className="text-xs text-muted-foreground">{t.account?.name}</span>
                      ) : (
                        <AppSelect
                          value={rowChanges?.accountId ?? t.accountId}
                          onValueChange={v => updateRow('accountId', v)}
                          options={allAccounts.map((a: Account) => ({ value: a.id, label: a.name }))}
                          placeholder="Konto"
                        />
                      )}
                    </td>
                    <td className="p-2">
                      <span className="text-xs text-muted-foreground">{t.category?.name ?? '—'}</span>
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        step="0.01"
                        value={currentAmount}
                        onChange={e => updateRow('amount', parseFloat(e.target.value) || 0)}
                        className="h-8 text-sm text-right w-28"
                      />
                    </td>
                    <td className="p-2" />
                  </tr>
                )
              }

              return (
                <tr key={t.id} className="border-t hover:bg-muted/50">
                  <td className="p-3 text-muted-foreground whitespace-nowrap">{formatDate(t.date)}</td>
                  <td className="p-3">
                    <p className="font-medium">{t.description}</p>
                    {t.payee && <p className="text-xs text-muted-foreground">{t.payee}</p>}
                  </td>
                  <td className="p-3">
                    {t.account && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.account.color }} />
                        <span className="text-xs">{t.account.name}</span>
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    {t.category ? (
                      <Badge variant="outline" style={{ borderColor: t.category.color, color: t.category.color }}>
                        {t.category.name}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  {(() => {
                    const displayAmt = t.mainAmount != null ? t.mainAmount : (t.subAmount ?? 0)
                    return (
                      <td className={`p-3 text-right font-semibold whitespace-nowrap ${displayAmt < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                        {fmt(displayAmt)}
                      </td>
                    )
                  })()}
                  <td className="p-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-foreground h-7 px-2"
                        onClick={() => setEditingTransaction(t)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive h-7 px-2"
                        onClick={() => handleDeleteClick(t)}
                        disabled={deleteMutation.isPending}
                      >
                        ×
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pageSize > 0 && totalPages > 1 && (
        <div className="mt-4">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  text="Zurück"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className={page <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
              {getPageNumbers(page, totalPages).map((p, i) =>
                p === 'ellipsis' ? (
                  <PaginationItem key={`e${i}`}>
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={p}>
                    <PaginationLink
                      isActive={p === page}
                      onClick={() => setPage(p)}
                      className="cursor-pointer"
                    >
                      {p}
                    </PaginationLink>
                  </PaginationItem>
                )
              )}
              <PaginationItem>
                <PaginationNext
                  text="Weiter"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className={page >= totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      <TransactionFormDialog open={open} onOpenChange={setOpen} />
      <TransactionFormDialog
        open={!!editingTransaction}
        onOpenChange={(v) => { if (!v) setEditingTransaction(null) }}
        editTransaction={editingTransaction}
      />

      {/* Dialog für Kreditraten-Transaktionen */}
      <Dialog open={!!pendingDelete} onOpenChange={v => !v && setPendingDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Transaktion löschen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Diese Transaktion wurde automatisch beim Buchen von{' '}
            <strong>Rate {pendingDelete?.loanPayment.periodNumber}</strong> des Kredits{' '}
            <strong>„{pendingDelete?.loanPayment.loan.name}{'"'}</strong> erstellt.
          </p>
          <p className="text-sm text-muted-foreground">
            Soll der Zahlungsstatus der Rate ebenfalls auf <strong>„Offen{'"'}</strong> zurückgesetzt werden?
          </p>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate({ id: pendingDelete!.id, revertLoan: true })}
              disabled={deleteMutation.isPending}
            >
              Transaktion löschen & Rate zurücksetzen
            </Button>
            <Button
              variant="outline"
              onClick={() => deleteMutation.mutate({ id: pendingDelete!.id, revertLoan: false })}
              disabled={deleteMutation.isPending}
            >
              Nur Transaktion löschen
            </Button>
            <Button variant="ghost" onClick={() => setPendingDelete(null)} disabled={deleteMutation.isPending}>
              Abbrechen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
