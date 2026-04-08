'use client'

import { useState, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, GripVertical, ChevronDown, ChevronRight, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { DraggableAttributes } from '@dnd-kit/core'
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities'
import { Button } from '@/components/ui/button'
import { InlineEdit } from './InlineEdit'
import { NewCategoryForm } from './NewCategoryForm'
import { EditCategoryForm } from './EditCategoryForm'
import type { Category, Group } from './types'

// ── Sortierbare Kategoriezeile ────────────────────────────────────────────────

function SortableCategoryRow({
  cat,
  groupId,
  allGroups,
  accountId,
  editingCat,
  setEditingCat,
  onDelete,
}: {
  cat: Category
  groupId: string
  allGroups: Group[]
  accountId: string
  editingCat: string | null
  setEditingCat: (id: string | null) => void
  onDelete: (cat: Category) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const typeColors: Record<string, string> = {
    INCOME: 'bg-emerald-100 text-emerald-700',
    EXPENSE: 'bg-red-100 text-red-700',
    TRANSFER: 'bg-blue-100 text-blue-700',
  }
  const typeLabels: Record<string, string> = { INCOME: 'E', EXPENSE: 'A', TRANSFER: 'T' }

  if (editingCat === cat.id) {
    return (
      <div ref={setNodeRef} style={style}>
        <EditCategoryForm
          category={{ ...cat, groupId }}
          groups={allGroups}
          accountId={accountId}
          onDone={() => setEditingCat(null)}
        />
      </div>
    )
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/50 group/cat">
      <button
        className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground flex-shrink-0 touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
      <span className="text-xs flex-1">{cat.name}</span>
      {cat.subAccountGroupId && (
        <span title={`Verknüpft mit: ${cat.subAccountGroup?.subAccount.name} · ${cat.subAccountGroup?.name}`}>
          <Link2 className="h-3 w-3 text-blue-500 flex-shrink-0" />
        </span>
      )}
      <span className={`text-xs px-1 py-0.5 rounded font-medium ${typeColors[cat.type]}`}>
        {typeLabels[cat.type]}
      </span>
      <div className="flex gap-0.5 opacity-0 group-hover/cat:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setEditingCat(cat.id)}>
          <Pencil className="h-2.5 w-2.5" />
        </Button>
        <Button
          variant="ghost" size="icon" className="h-5 w-5 text-destructive hover:text-destructive"
          onClick={() => onDelete(cat)}
        >
          <Trash2 className="h-2.5 w-2.5" />
        </Button>
      </div>
    </div>
  )
}

// ── Gruppenzeile ─────────────────────────────────────────────────────────────

export function GroupRow({
  group,
  accountId,
  allGroups,
  dragAttributes,
  dragListeners,
  onRenameGroup,
  onDeleteGroup,
}: {
  group: Group
  accountId: string
  allGroups: Group[]
  dragAttributes: DraggableAttributes
  dragListeners: SyntheticListenerMap | undefined
  onRenameGroup: (id: string, name: string) => void
  onDeleteGroup: (id: string, name: string) => void
}) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(true)
  const [editingGroup, setEditingGroup] = useState(false)
  const [addingCat, setAddingCat] = useState(false)
  const [editingCat, setEditingCat] = useState<string | null>(null)

  const baseSortedCats = useMemo(
    () => [...group.categories.filter(c => c.isActive)].sort((a, b) => a.sortOrder - b.sortOrder),
    [group.categories],
  )
  const [catDragOverride, setCatDragOverride] = useState<typeof baseSortedCats | null>(null)
  const orderedCats = catDragOverride ?? baseSortedCats

  const catSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const reorderCats = useMutation({
    mutationFn: (items: { id: string; sortOrder: number }[]) =>
      fetch('/api/categories/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items),
      }).then(r => r.json()),
    onSuccess: () => {
      setCatDragOverride(null)
      qc.invalidateQueries({ queryKey: ['category-groups', accountId] })
    },
    onError: () => {
      setCatDragOverride(null)
      toast.error('Reihenfolge konnte nicht gespeichert werden')
    },
  })

  const handleCategoryDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = orderedCats.findIndex(c => c.id === active.id)
    const newIdx = orderedCats.findIndex(c => c.id === over.id)
    const next = arrayMove(orderedCats, oldIdx, newIdx)
    setCatDragOverride(next)
    reorderCats.mutate(next.map((c, i) => ({ id: c.id, sortOrder: i })))
  }

  const deleteCat = useMutation({
    mutationFn: (id: string) => fetch(`/api/categories/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['category-groups', accountId] })
      qc.invalidateQueries({ queryKey: ['account-budget'] })
      toast.success('Kategorie gelöscht')
    },
    onError: () => toast.error('Fehler beim Löschen'),
  })

  return (
    <div className="border rounded-lg overflow-hidden border-primary/40 bg-primary/3">
      {/* Gruppenheader */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/40">
        <button
          className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground flex-shrink-0 touch-none"
          {...dragAttributes}
          {...dragListeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        <button onClick={() => setExpanded(e => !e)} className="flex items-center gap-1 flex-1 text-left">
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          }
          {editingGroup ? (
            <InlineEdit
              value={group.name}
              placeholder="Gruppenname"
              onSave={v => { onRenameGroup(group.id, v); setEditingGroup(false) }}
              onCancel={() => setEditingGroup(false)}
            />
          ) : (
            <span className="text-sm font-semibold flex-1">
              {group.name}
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">({orderedCats.length})</span>
            </span>
          )}
        </button>

        {!editingGroup && (
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-6 w-6" title="Kategorie hinzufügen"
              onClick={() => { setAddingCat(true); setExpanded(true) }}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" title="Gruppe umbenennen"
              onClick={() => setEditingGroup(true)}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" title="Gruppe löschen"
              onClick={() => onDeleteGroup(group.id, group.name)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {/* Kategorien */}
      {expanded && (
        <div className="px-3 py-2 space-y-1">
          <DndContext sensors={catSensors} collisionDetection={closestCenter} onDragEnd={handleCategoryDragEnd}>
            <SortableContext items={orderedCats.map(c => c.id)} strategy={verticalListSortingStrategy}>
              {orderedCats.map(cat => (
                <SortableCategoryRow
                  key={cat.id}
                  cat={cat}
                  groupId={group.id}
                  allGroups={allGroups}
                  accountId={accountId}
                  editingCat={editingCat}
                  setEditingCat={setEditingCat}
                  onDelete={cat => {
                    if (confirm(`Kategorie "${cat.name}" löschen?`)) deleteCat.mutate(cat.id)
                  }}
                />
              ))}
            </SortableContext>
          </DndContext>

          {addingCat ? (
            <NewCategoryForm groupId={group.id} accountId={accountId} onDone={() => setAddingCat(false)} />
          ) : (
            <button
              onClick={() => setAddingCat(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors py-0.5 w-full text-left"
            >
              <Plus className="h-3 w-3" />
              Kategorie hinzufügen
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sortierbare Gruppenzeile ──────────────────────────────────────────────────

export function SortableGroupRow(props: Omit<React.ComponentProps<typeof GroupRow>, 'dragAttributes' | 'dragListeners'>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.group.id })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <GroupRow {...props} dragAttributes={attributes} dragListeners={listeners} />
    </div>
  )
}
