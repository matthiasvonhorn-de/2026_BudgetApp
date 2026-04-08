'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CategoryGroupManagerContent } from '@/components/accounts/AccountBudgetConfig'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Account {
  id: string
  name: string
  color: string
}

export default function CategoriesSettingsPage() {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)

  const { data: accounts = [], isError } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => fetch('/api/accounts').then(r => r.json()),
  })

  const accountId = selectedAccountId ?? accounts[0]?.id ?? null

  return (
    <div className="p-6 max-w-2xl space-y-4">
      <div>
        <div className="flex items-center gap-4">
          <Link href="/settings">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Zurück
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Kategorien & Gruppen</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Gruppen und Kategorien sind pro Konto konfigurierbar.
        </p>
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium">Konto</p>
        <Select
          value={accountId ?? ''}
          onValueChange={v => setSelectedAccountId(v)}
          items={accounts.map(a => ({ value: a.id, label: a.name }))}
          itemToStringLabel={(v: string) => accounts.find(a => a.id === v)?.name ?? v}
        >
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Konto wählen…" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map(a => (
              <SelectItem key={a.id} value={a.id}>
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: a.color }} />
                  {a.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError ? (
        <div className="text-sm text-destructive p-4">Fehler beim Laden der Daten</div>
      ) : accountId ? (
        <CategoryGroupManagerContent accountId={accountId} />
      ) : (
        <p className="text-sm text-muted-foreground">Kein Konto vorhanden.</p>
      )}
    </div>
  )
}
