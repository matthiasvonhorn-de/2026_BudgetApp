'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronRight, GripVertical, Link2 } from 'lucide-react'
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
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// ── Typen ────────────────────────────────────────────────────────────────────

interface SubAccountGroup {
  id: string
  name: string
  subAccount: { name: string }
}

interface Category {
  id: string
  name: string
  color: string
  type: string
  sortOrder: number
  isActive: boolean
  subAccountGroupId?: string | null
  subAccountLinkType?: string | null
  subAccountGroup?: SubAccountGroup | null
}

interface Group {
  id: string
  name: string
  sortOrder: number
  categories: Category[]
}

// ── Konstanten ───────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#10b981', '#14b8a6', '#06b6d4',
  '#3b82f6', '#64748b',
]

function ColorDot({ color, selected, onClick }: { color: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-6 h-6 rounded-full border-2 transition-transform ${selected ? 'border-foreground scale-110' : 'border-transparent'}`}
      style={{ backgroundColor: color }}
    />
  )
}

// ── Inline-Bearbeitungsfeld ──────────────────────────────────────────────────

function InlineEdit({
  value,
  onSave,
  onCancel,
  placeholder,
}: {
  value: string
  onSave: (v: string) => void
  onCancel: () => void
  placeholder?: string
}) {
  const [val, setVal] = useState(value)
  return (
    <div className="flex items-center gap-1 flex-1">
      <Input
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        placeholder={placeholder}
        className="h-7 text-sm"
        onKeyDown={e => {
          if (e.key === 'Enter' && val.trim()) onSave(val.trim())
          if (e.key === 'Escape') onCancel()
        }}
      />
      <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0" onClick={() => val.trim() && onSave(val.trim())}>
        <Check className="h-3.5 w-3.5 text-emerald-600" />
      </Button>
      <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0" onClick={onCancel}>
        <X className="h-3.5 w-3.5 text-destructive" />
      </Button>
    </div>
  )
}

// ── Neue Kategorie Formular ──────────────────────────────────────────────────

function NewCategoryForm({ groupId, accountId, onDone }: { groupId: string; accountId: string; onDone: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [type, setType] = useState('EXPENSE')
  const [color, setColor] = useState('#6366f1')

  const createCat = useMutation({
    mutationFn: () =>
      fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color, type, groupId }),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['category-groups', accountId] })
      qc.invalidateQueries({ queryKey: ['account-budget'] })
      toast.success('Kategorie erstellt')
      onDone()
    },
    onError: () => toast.error('Fehler beim Erstellen'),
  })

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Kategoriename"
          className="h-7 text-sm flex-1"
          onKeyDown={e => {
            if (e.key === 'Enter' && name.trim()) createCat.mutate()
            if (e.key === 'Escape') onDone()
          }}
        />
        <Select value={type} onValueChange={(v: string | null) => v && setType(v)}>
          <SelectTrigger className="h-7 text-xs w-28">
            <SelectValue>{{ EXPENSE: 'Ausgabe', INCOME: 'Einnahme', TRANSFER: 'Transfer' }[type] ?? type}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="EXPENSE">Ausgabe</SelectItem>
            <SelectItem value="INCOME">Einnahme</SelectItem>
            <SelectItem value="TRANSFER">Transfer</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap gap-1">
        {PRESET_COLORS.map(c => (
          <ColorDot key={c} color={c} selected={color === c} onClick={() => setColor(c)} />
        ))}
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" className="h-7 text-xs" onClick={() => name.trim() && createCat.mutate()} disabled={!name.trim() || createCat.isPending}>
          Erstellen
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onDone}>
          Abbrechen
        </Button>
      </div>
    </div>
  )
}

// ── Kategorie bearbeiten Formular ────────────────────────────────────────────

function EditCategoryForm({
  category,
  groups,
  accountId,
  onDone,
}: {
  category: Category & { groupId: string }
  groups: Group[]
  accountId: string
  onDone: () => void
}) {
  const qc = useQueryClient()
  const [name, setName] = useState(category.name)
  const [type, setType] = useState(category.type)
  const [color, setColor] = useState(category.color)
  const [groupId, setGroupId] = useState(category.groupId)
  const [subAccountGroupId, setSubAccountGroupId] = useState<string>(category.subAccountGroupId ?? '__none__')
  const [subAccountLinkType, setSubAccountLinkType] = useState(category.subAccountLinkType ?? 'BOOKING')

  const { data: subAccountGroups = [] } = useQuery<(SubAccountGroup & { id: string })[]>({
    queryKey: ['sub-account-groups'],
    queryFn: () => fetch('/api/sub-account-groups').then(r => r.json()),
  })

  const updateCat = useMutation({
    mutationFn: () =>
      fetch(`/api/categories/${category.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, color, type, groupId,
          subAccountGroupId: subAccountGroupId === '__none__' ? null : subAccountGroupId,
          subAccountLinkType,
        }),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['category-groups', accountId] })
      qc.invalidateQueries({ queryKey: ['account-budget'] })
      toast.success('Kategorie gespeichert')
      onDone()
    },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Kategoriename"
          className="h-7 text-sm flex-1"
        />
        <Select value={type} onValueChange={(v: string | null) => v && setType(v)}>
          <SelectTrigger className="h-7 text-xs w-28">
            <SelectValue>{{ EXPENSE: 'Ausgabe', INCOME: 'Einnahme', TRANSFER: 'Transfer' }[type] ?? type}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="EXPENSE">Ausgabe</SelectItem>
            <SelectItem value="INCOME">Einnahme</SelectItem>
            <SelectItem value="TRANSFER">Transfer</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Gruppe</Label>
        <Select value={groupId} onValueChange={(v: string | null) => setGroupId(v ?? groupId)}>
          <SelectTrigger className="h-7 text-xs w-full">
            <SelectValue>{groups.find(g => g.id === groupId)?.name ?? 'Keine Gruppe'}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Unterkonto-Verknüpfung</Label>
        <Select value={subAccountGroupId} onValueChange={(v: string | null) => setSubAccountGroupId(v ?? '__none__')}>
          <SelectTrigger className="h-7 text-xs w-full">
            <SelectValue>
              {subAccountGroupId === '__none__'
                ? 'Keine Verknüpfung'
                : (() => { const sg = subAccountGroups.find(s => s.id === subAccountGroupId); return sg ? `${sg.subAccount.name} · ${sg.name}` : '…' })()}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Keine Verknüpfung</SelectItem>
            {subAccountGroups.map(sg => (
              <SelectItem key={sg.id} value={sg.id}>
                {sg.subAccount.name} · {sg.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {subAccountGroupId !== '__none__' && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Buchungstyp</Label>
          <Select value={subAccountLinkType} onValueChange={(v: string | null) => v && setSubAccountLinkType(v)}>
            <SelectTrigger className="h-7 text-xs w-full">
              <SelectValue>{{ BOOKING: 'Buchung (intern, kein Saldo-Transfer)', TRANSFER: 'Transfer (Gegenbuchung auf Zielkonto)' }[subAccountLinkType] ?? subAccountLinkType}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BOOKING">Buchung (intern, kein Saldo-Transfer)</SelectItem>
              <SelectItem value="TRANSFER">Transfer (Gegenbuchung auf Zielkonto)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        {PRESET_COLORS.map(c => (
          <ColorDot key={c} color={c} selected={color === c} onClick={() => setColor(c)} />
        ))}
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" className="h-7 text-xs" onClick={() => name.trim() && updateCat.mutate()} disabled={!name.trim() || updateCat.isPending}>
          Speichern
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onDone}>
          Abbrechen
        </Button>
      </div>
    </div>
  )
}

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

function GroupRow({
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

  const activeCategories = group.categories.filter(c => c.isActive)
  const [orderedCats, setOrderedCats] = useState(
    [...activeCategories].sort((a, b) => a.sortOrder - b.sortOrder)
  )

  useEffect(() => {
    setOrderedCats([...group.categories.filter(c => c.isActive)].sort((a, b) => a.sortOrder - b.sortOrder))
  }, [group.categories])

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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['category-groups', accountId] }),
    onError: () => toast.error('Reihenfolge konnte nicht gespeichert werden'),
  })

  const handleCategoryDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = orderedCats.findIndex(c => c.id === active.id)
    const newIdx = orderedCats.findIndex(c => c.id === over.id)
    const next = arrayMove(orderedCats, oldIdx, newIdx)
    setOrderedCats(next)
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

function SortableGroupRow(props: Omit<React.ComponentProps<typeof GroupRow>, 'dragAttributes' | 'dragListeners'>) {
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
  const [orderedGroups, setOrderedGroups] = useState<Group[]>([])

  const { data: groupsData } = useQuery<Group[]>({
    queryKey: ['category-groups', accountId],
    queryFn: () => fetch(`/api/category-groups?accountId=${accountId}`).then(r => r.json()),
    enabled,
  })

  useEffect(() => {
    if (groupsData) {
      setOrderedGroups([...groupsData].sort((a, b) => a.sortOrder - b.sortOrder))
    }
  }, [groupsData])

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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['category-groups', accountId] }),
    onError: () => toast.error('Reihenfolge konnte nicht gespeichert werden'),
  })

  const handleGroupDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = orderedGroups.findIndex(g => g.id === active.id)
    const newIdx = orderedGroups.findIndex(g => g.id === over.id)
    const next = arrayMove(orderedGroups, oldIdx, newIdx)
    setOrderedGroups(next)
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
