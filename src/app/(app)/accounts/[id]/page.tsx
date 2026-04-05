'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { ArrowLeft, Plus, Pencil } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink,
  PaginationPrevious, PaginationNext, PaginationEllipsis,
} from '@/components/ui/pagination'
import { ACCOUNT_TYPE_LABELS, formatDate } from '@/lib/utils'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import { useState } from 'react'
import { ReconcileDialog } from '@/components/accounts/ReconcileDialog'
import { SubAccountsSection } from '@/components/accounts/SubAccountsSection'
import { AccountBudgetTab } from '@/components/accounts/AccountBudgetTab'
import { TransactionFormDialog } from '@/components/transactions/TransactionFormDialog'
import { toast } from 'sonner'
import type { Transaction } from '@/types/api'

const TABS = ['Transaktionen', 'Unterkonten', 'Budget'] as const
type Tab = typeof TABS[number]

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

export default function AccountDetailPage() {
  const { id } = useParams()
  const [reconcileOpen, setReconcileOpen] = useState(false)
  const [newTxOpen, setNewTxOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [tab, setTab] = useState<Tab>('Transaktionen')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  const queryClient = useQueryClient()

  const fmt = useFormatCurrency()

  const deleteMutation = useMutation({
    mutationFn: (txId: string) =>
      fetch(`/api/transactions/${txId}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['account-transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['sub-accounts'] })
      queryClient.invalidateQueries({ queryKey: ['account-budget'] })
      queryClient.invalidateQueries({ queryKey: ['budget'] })
      toast.success('Transaktion gelöscht')
    },
  })
  const { data: account, isLoading } = useQuery({
    queryKey: ['accounts', id],
    queryFn: () => fetch(`/api/accounts/${id}`).then(r => r.json()),
  })

  const { data: txResult, isPlaceholderData } = useQuery({
    queryKey: ['account-transactions', id, page, pageSize],
    queryFn: () => {
      const params = new URLSearchParams({ accountId: id as string, page: String(page), pageSize: String(pageSize) })
      return fetch(`/api/transactions?${params}`).then(r => r.json())
    },
    placeholderData: (prev) => prev,
    enabled: tab === 'Transaktionen',
  })

  const transactions = txResult?.data ?? []
  const txTotal = txResult?.total ?? 0
  const totalPages = pageSize > 0 ? Math.ceil(txTotal / pageSize) : 1

  if (isLoading) return <div className="p-6">Laden...</div>
  if (!account) return <div className="p-6">Konto nicht gefunden</div>

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/accounts">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zurück
          </Button>
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: account.color }} />
            <h1 className="text-2xl font-bold">{account.name}</h1>
            <Badge variant="secondary">{ACCOUNT_TYPE_LABELS[account.type]}</Badge>
          </div>
          {account.bank && <p className="text-muted-foreground text-sm">{account.bank}</p>}
          {account.iban && <p className="text-muted-foreground text-xs font-mono">{account.iban}</p>}
        </div>
      </div>

      <div className="mb-6 p-4 rounded-xl border bg-card flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Aktueller Saldo</p>
          <p className={`text-3xl font-bold ${account.currentBalance < 0 ? 'text-destructive' : ''}`}>
            {fmt(account.currentBalance)}
          </p>
        </div>
        <Button variant="outline" onClick={() => setReconcileOpen(true)}>
          Kontoabgleich
        </Button>
      </div>

      <ReconcileDialog
        accountId={id as string}
        accountName={account.name}
        open={reconcileOpen}
        onOpenChange={setReconcileOpen}
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Transaktionen' && (
        <>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Transaktionen</h2>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
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
                <span className="text-sm text-muted-foreground">{txTotal} gesamt</span>
              </div>
              <Button size="sm" onClick={() => setNewTxOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Neue Transaktion
              </Button>
            </div>
          </div>
          <div className={`rounded-lg border overflow-hidden ${isPlaceholderData ? 'opacity-60' : ''}`}>
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-3 font-medium">Datum</th>
                  <th className="text-left p-3 font-medium">Beschreibung</th>
                  <th className="text-left p-3 font-medium">Kategorie</th>
                  <th className="text-right p-3 font-medium">Betrag</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Keine Transaktionen</td></tr>
                ) : transactions.map((t: Transaction) => {
                  const displayAmt = t.mainAmount != null ? t.mainAmount : (t.subAmount ?? 0)
                  return (
                    <tr key={t.id} className="border-t hover:bg-muted/50">
                      <td className="p-3 text-muted-foreground">{formatDate(t.date)}</td>
                      <td className="p-3">
                        <p className="font-medium">{t.description}</p>
                        {t.payee && <p className="text-xs text-muted-foreground">{t.payee}</p>}
                      </td>
                      <td className="p-3">
                        {t.category ? (
                          <Badge variant="outline" style={{ borderColor: t.category.color, color: t.category.color }}>
                            {t.category.name}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">Keine Kategorie</span>
                        )}
                      </td>
                      <td className={`p-3 text-right font-semibold ${displayAmt < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                        {fmt(displayAmt)}
                      </td>
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
                            onClick={() => { if (confirm('Transaktion löschen?')) deleteMutation.mutate(t.id) }}
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
        </>
      )}

      <TransactionFormDialog
        open={newTxOpen}
        onOpenChange={setNewTxOpen}
        defaultAccountId={id as string}
        hideAccountSelector
      />

      <TransactionFormDialog
        open={!!editingTransaction}
        onOpenChange={(v) => { if (!v) setEditingTransaction(null) }}
        editTransaction={editingTransaction}
      />

      {tab === 'Unterkonten' && (
        <SubAccountsSection accountId={id as string} />
      )}

      {tab === 'Budget' && (
        <AccountBudgetTab accountId={id as string} />
      )}
    </div>
  )
}
