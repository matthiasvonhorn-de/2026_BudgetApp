'use client'

import { useQuery } from '@tanstack/react-query'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { SortableAccountCard } from '@/components/accounts/SortableAccountCard'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import { useAccountReorder } from '@/hooks/useAccountReorder'
import { Button } from '@/components/ui/button'
import type { Account } from '@/types/api'

export default function AccountsPage() {
  const fmt = useFormatCurrency()
  const sensors = useSensors(useSensor(PointerSensor))

  const { data: accounts = [], isLoading, isError } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => fetch('/api/accounts').then(r => r.json()),
  })

  const { isReordering, localAccounts, startReorder, cancelReorder, saveReorder, handleDragEnd, isSaving } =
    useAccountReorder(accounts)

  const totalBalance = localAccounts.reduce((sum, a) => sum + a.currentBalance, 0 as number)

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Konten</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gesamtvermögen: <span className="font-semibold text-foreground">{fmt(totalBalance)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
        {!isLoading && accounts.length > 1 && (
          isReordering ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={cancelReorder} disabled={isSaving}>
                Abbrechen
              </Button>
              <Button size="sm" onClick={saveReorder} disabled={isSaving}>
                {isSaving ? 'Speichern...' : 'Speichern'}
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={startReorder}>
              Reihenfolge bearbeiten
            </Button>
          )
        )}
        </div>
      </div>

      {isError ? (
        <div className="text-sm text-destructive p-4">Fehler beim Laden der Daten</div>
      ) : isLoading ? (
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={localAccounts.map((a: Account) => a.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {localAccounts.map((account: Account) => (
                <SortableAccountCard key={account.id} account={account} isReordering={isReordering} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}
