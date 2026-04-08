'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Link from 'next/link'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import { useAccountReorder } from '@/hooks/useAccountReorder'
import { Button } from '@/components/ui/button'
import { Plus, Pencil, Trash2, GripVertical, ArrowLeft } from 'lucide-react'
import { AccountFormDialog } from '@/components/accounts/AccountFormDialog'
import { ACCOUNT_TYPE_LABELS } from '@/lib/utils'
import type { Account } from '@/types/api'

interface AccountRowProps {
  account: Account
  isReordering: boolean
  fmt: (n: number) => string
  onEdit: () => void
  onDelete: () => void
}

function SortableAccountRow({ account, isReordering, fmt, onEdit, onDelete }: AccountRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: account.id,
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="flex items-center justify-between py-2 px-3 rounded-lg border bg-background"
    >
      <div className="flex items-center gap-3">
        {isReordering && (
          <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground" aria-label="Ziehen zum Sortieren">
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: account.color }} />
        <div>
          <p className="text-sm font-medium">{account.name}</p>
          <p className="text-xs text-muted-foreground">{ACCOUNT_TYPE_LABELS[account.type]}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className={`text-sm font-semibold tabular-nums ${account.currentBalance < 0 ? 'text-destructive' : ''}`}>
          {fmt(account.currentBalance)}
        </span>
        {!isReordering && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} aria-label="Konto bearbeiten">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete} aria-label="Konto löschen">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AccountSettingsPage() {
  const fmt = useFormatCurrency()
  const qc = useQueryClient()
  const sensors = useSensors(useSensor(PointerSensor))
  const [accountDialog, setAccountDialog] = useState<{ open: boolean; account?: Account }>({ open: false })

  const { data: accounts = [], isLoading, isError } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => fetch('/api/accounts').then(r => r.json()),
  })

  const deleteAccount = useMutation({
    mutationFn: (id: string) => fetch(`/api/accounts/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts'] }); toast.success('Konto gelöscht') },
    onError: () => toast.error('Fehler beim Löschen'),
  })

  const { isReordering, localAccounts, startReorder, cancelReorder, saveReorder, handleDragEnd, isSaving } =
    useAccountReorder(accounts)

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/settings">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Zurück
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Konten</h1>
        </div>
        <div className="flex items-center gap-2">
          {accounts.length > 1 && (
            isReordering ? (
              <>
                <Button variant="outline" size="sm" onClick={cancelReorder} disabled={isSaving}>
                  Abbrechen
                </Button>
                <Button size="sm" onClick={saveReorder} disabled={isSaving}>
                  {isSaving ? 'Speichern...' : 'Speichern'}
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={startReorder}>
                Reihenfolge bearbeiten
              </Button>
            )
          )}
          {!isReordering && (
            <Button size="sm" onClick={() => setAccountDialog({ open: true })}>
              <Plus className="h-4 w-4 mr-1" /> Konto hinzufügen
            </Button>
          )}
        </div>
      </div>

      {isError ? (
        <div className="text-sm text-destructive p-4">Fehler beim Laden der Daten</div>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Laden...</p>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Konten angelegt.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={localAccounts.map((a: Account) => a.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {localAccounts.map((a: Account) => (
                <SortableAccountRow
                  key={a.id}
                  account={a}
                  isReordering={isReordering}
                  fmt={fmt}
                  onEdit={() => setAccountDialog({ open: true, account: a })}
                  onDelete={() => { if (confirm(`Konto "${a.name}" löschen?`)) deleteAccount.mutate(a.id) }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <AccountFormDialog
        key={`${accountDialog.open ? 'open' : 'closed'}-${accountDialog.account?.id ?? 'new'}`}
        open={accountDialog.open}
        onOpenChange={(open) => setAccountDialog({ open })}
        account={accountDialog.account}
      />
    </div>
  )
}
