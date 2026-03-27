'use client'

import { useQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { ArrowLeft, Plus } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ACCOUNT_TYPE_LABELS, formatDate } from '@/lib/utils'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import { useState } from 'react'
import { ReconcileDialog } from '@/components/accounts/ReconcileDialog'
import { SubAccountsSection } from '@/components/accounts/SubAccountsSection'
import { AccountBudgetTab } from '@/components/accounts/AccountBudgetTab'
import { TransactionFormDialog } from '@/components/transactions/TransactionFormDialog'

const TABS = ['Transaktionen', 'Unterkonten', 'Budget'] as const
type Tab = typeof TABS[number]

export default function AccountDetailPage() {
  const { id } = useParams()
  const [reconcileOpen, setReconcileOpen] = useState(false)
  const [newTxOpen, setNewTxOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('Transaktionen')

  const fmt = useFormatCurrency()
  const { data: account, isLoading } = useQuery({
    queryKey: ['accounts', id],
    queryFn: () => fetch(`/api/accounts/${id}`).then(r => r.json()),
  })

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
            <h2 className="text-lg font-semibold">Letzte Transaktionen</h2>
            <Button size="sm" onClick={() => setNewTxOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Neue Transaktion
            </Button>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-3 font-medium">Datum</th>
                  <th className="text-left p-3 font-medium">Beschreibung</th>
                  <th className="text-left p-3 font-medium">Kategorie</th>
                  <th className="text-right p-3 font-medium">Betrag</th>
                </tr>
              </thead>
              <tbody>
                {account.transactions?.length === 0 ? (
                  <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Keine Transaktionen</td></tr>
                ) : account.transactions?.map((t: any) => (
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
                    <td className={`p-3 text-right font-semibold ${t.amount < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                      {fmt(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <TransactionFormDialog
        open={newTxOpen}
        onOpenChange={setNewTxOpen}
        defaultAccountId={id as string}
        hideAccountSelector
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
