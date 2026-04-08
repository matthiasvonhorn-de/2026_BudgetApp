'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { InlineEdit } from './budget/InlineEdit'
import { SortableGroupRow } from './budget/GroupRow'
import type { Group } from './budget/types'

// ── Kern-Inhalt (wiederverwendbar) ────────────────────────────────────────────

export function CategoryGroupManagerContent({
  accountId,
  enabled = true,
}: {
  accountId: string
  enabled?: boolean
}) {
  const qc = useQueryClient()
  const [addingGroup, setAddingGroup] = useState(false)

  const { data: groupsData } = useQuery<Group[]>({
    queryKey: ['category-groups', accountId],
    queryFn: () => fetch(`/api/category-groups?accountId=${accountId}`).then(r => r.json()),
    enabled,
  })

  const baseSortedGroups = useMemo(
    () => groupsData ? [...groupsData].sort((a, b) => a.sortOrder - b.sortOrder) : [],
    [groupsData],
  )
  const [groupDragOverride, setGroupDragOverride] = useState<Group[] | null>(null)
  const orderedGroups = groupDragOverride ?? baseSortedGroups

  const groupSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const reorderGroups = useMutation({
    mutationFn: (items: { id: string; sortOrder: number }[]) =>
      fetch('/api/category-groups/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items),
      }).then(r => r.json()),
    onSuccess: () => {
      setGroupDragOverride(null)
      qc.invalidateQueries({ queryKey: ['category-groups', accountId] })
    },
    onError: () => {
      setGroupDragOverride(null)
      toast.error('Reihenfolge konnte nicht gespeichert werden')
    },
  })

  const handleGroupDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = orderedGroups.findIndex(g => g.id === active.id)
    const newIdx = orderedGroups.findIndex(g => g.id === over.id)
    const next = arrayMove(orderedGroups, oldIdx, newIdx)
    setGroupDragOverride(next)
    reorderGroups.mutate(next.map((g, i) => ({ id: g.id, sortOrder: i })))
  }

  const createGroup = useMutation({
    mutationFn: (name: string) =>
      fetch('/api/category-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, accountId }),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['category-groups', accountId] })
      qc.invalidateQueries({ queryKey: ['account-budget', accountId] })
      toast.success('Gruppe erstellt')
      setAddingGroup(false)
    },
    onError: () => toast.error('Fehler beim Erstellen'),
  })

  const renameGroup = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      fetch(`/api/category-groups/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['category-groups', accountId] })
      qc.invalidateQueries({ queryKey: ['account-budget', accountId] })
      toast.success('Gruppe gespeichert')
    },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  const deleteGroup = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/category-groups/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['category-groups', accountId] })
      qc.invalidateQueries({ queryKey: ['account-budget', accountId] })
      toast.success('Gruppe gelöscht')
    },
    onError: () => toast.error('Fehler beim Löschen'),
  })

  return (
    <div className="space-y-3">
      <DndContext sensors={groupSensors} collisionDetection={closestCenter} onDragEnd={handleGroupDragEnd}>
        <SortableContext items={orderedGroups.map(g => g.id)} strategy={verticalListSortingStrategy}>
          {orderedGroups.map(group => (
            <SortableGroupRow
              key={group.id}
              group={group}
              accountId={accountId}
              allGroups={orderedGroups}
              onRenameGroup={(id, name) => renameGroup.mutate({ id, name })}
              onDeleteGroup={(id, name) => {
                if (confirm(`Gruppe "${name}" und alle Kategorien darin löschen?`)) {
                  deleteGroup.mutate(id)
                }
              }}
            />
          ))}
        </SortableContext>
      </DndContext>

      {addingGroup ? (
        <div className="border rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Neue Gruppe</p>
          <InlineEdit
            value=""
            placeholder="Gruppenname"
            onSave={name => createGroup.mutate(name)}
            onCancel={() => setAddingGroup(false)}
          />
        </div>
      ) : (
        <Button variant="outline" size="sm" className="w-full" onClick={() => setAddingGroup(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Neue Gruppe anlegen
        </Button>
      )}
    </div>
  )
}

// ── Haupt-Komponente (Sheet-Wrapper) ──────────────────────────────────────────

export function AccountBudgetConfig({
  accountId,
  open,
  onClose,
}: {
  accountId: string
  open: boolean
  onClose: () => void
}) {
  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-[420px] sm:w-[480px] overflow-y-auto flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle>Gruppen & Kategorien</SheetTitle>
          <p className="text-sm text-muted-foreground">
            Verwalte Gruppen und Kategorien für dieses Konto. Reihenfolge per Drag & Drop ändern.
          </p>
        </SheetHeader>
        <div className="flex-1 px-4 py-4 overflow-y-auto">
          <CategoryGroupManagerContent accountId={accountId} enabled={open} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
