'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ColorDot, PRESET_COLORS } from './ColorDot'

export function NewCategoryForm({ groupId, accountId, onDone }: { groupId: string; accountId: string; onDone: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [type, setType] = useState('EXPENSE')
  const [color, setColor] = useState('#6366f1')
  const [rolloverEnabled, setRolloverEnabled] = useState(true)

  const createCat = useMutation({
    mutationFn: () =>
      fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color, type, groupId, rolloverEnabled }),
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
      <div className="flex items-center gap-2 pt-1">
        <input
          type="checkbox"
          id="rollover-new"
          checked={rolloverEnabled}
          onChange={e => setRolloverEnabled(e.target.checked)}
          className="rounded"
        />
        <label htmlFor="rollover-new" className="text-xs text-muted-foreground cursor-pointer">
          Übertrag aktivieren
        </label>
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
