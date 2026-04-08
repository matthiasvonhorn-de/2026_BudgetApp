'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ColorDot, PRESET_COLORS } from './ColorDot'
import type { Category, Group, SubAccountGroup } from './types'

export function EditCategoryForm({
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
  const [rolloverEnabled, setRolloverEnabled] = useState(category.rolloverEnabled ?? true)

  const { data: subAccountGroups = [] } = useQuery<(SubAccountGroup & { id: string })[]>({
    queryKey: ['sub-account-groups', accountId],
    queryFn: () => fetch(`/api/sub-account-groups?accountId=${accountId}`).then(r => r.json()),
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
          rolloverEnabled,
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
        <Select
          value={groupId}
          onValueChange={(v: string | null) => setGroupId(v ?? groupId)}
          itemToStringLabel={(v: string) => groups.find(g => g.id === v)?.name ?? v}
        >
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
        <Select
          value={subAccountGroupId}
          onValueChange={(v: string | null) => setSubAccountGroupId(v ?? '__none__')}
          itemToStringLabel={(v: string) => {
            if (v === '__none__') return 'Keine Verknüpfung'
            const sg = subAccountGroups.find(s => s.id === v)
            return sg ? `${sg.subAccount.name} · ${sg.name}` : v
          }}
        >
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
      <div className="flex items-center gap-2 pt-1">
        <input
          type="checkbox"
          id={`rollover-${category.id}`}
          checked={rolloverEnabled}
          onChange={e => setRolloverEnabled(e.target.checked)}
          className="rounded"
        />
        <label htmlFor={`rollover-${category.id}`} className="text-xs text-muted-foreground cursor-pointer">
          Übertrag aktivieren
        </label>
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
