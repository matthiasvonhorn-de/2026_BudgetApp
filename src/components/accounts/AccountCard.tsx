'use client'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ACCOUNT_TYPE_LABELS } from '@/lib/utils'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import Link from 'next/link'

interface AccountCardProps {
  account: {
    id: string
    name: string
    bank?: string | null
    type: string
    color: string
    currentBalance: number
    _count?: { transactions: number }
    _savingsProgress?: { paid: number; total: number }
  }
}

const SAVINGS_TYPES = new Set(['SPARPLAN', 'FESTGELD'])

export function AccountCard({ account }: AccountCardProps) {
  const fmt = useFormatCurrency()
  const href = SAVINGS_TYPES.has(account.type)
    ? `/savings/${account.id}`
    : `/accounts/${account.id}`
  return (
    <Link href={href}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4" style={{ borderLeftColor: account.color }}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold text-base">{account.name}</p>
              {account.bank && (
                <p className="text-xs text-muted-foreground mt-0.5">{account.bank}</p>
              )}
            </div>
            <Badge variant="secondary" className="text-xs">
              {ACCOUNT_TYPE_LABELS[account.type] ?? account.type}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className={`text-2xl font-bold ${account.currentBalance < 0 ? 'text-destructive' : 'text-foreground'}`}>
            {fmt(account.currentBalance)}
          </p>
          {SAVINGS_TYPES.has(account.type) && account._savingsProgress ? (
            <p className="text-xs text-muted-foreground mt-1">
              {account._savingsProgress.paid} / {account._savingsProgress.total} Zahlungen
            </p>
          ) : account._count ? (
            <p className="text-xs text-muted-foreground mt-1">
              {account._count.transactions} Transaktionen
            </p>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  )
}
