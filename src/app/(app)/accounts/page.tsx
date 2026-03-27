'use client'

import { useQuery } from '@tanstack/react-query'
import { AccountCard } from '@/components/accounts/AccountCard'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'

export default function AccountsPage() {
  const fmt = useFormatCurrency()

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => fetch('/api/accounts').then(r => r.json()),
  })

  const totalBalance = accounts.reduce((sum: number, a: any) => sum + a.currentBalance, 0)

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Konten</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gesamtvermögen: <span className="font-semibold text-foreground">{fmt(totalBalance)}</span>
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <p className="text-lg font-medium">Noch keine Konten angelegt</p>
          <p className="text-sm mt-1">Konten können unter Einstellungen → Allgemein hinzugefügt werden.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((account: any) => (
            <AccountCard key={account.id} account={account} />
          ))}
        </div>
      )}
    </div>
  )
}
