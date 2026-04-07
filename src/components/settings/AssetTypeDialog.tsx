'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Home, Car, Palette, FileText, Gem, Watch,
  Landmark, Sailboat, TreePine, Building2, Coins, Package,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AssetType } from '@/types/api'

const ICON_OPTIONS = [
  { name: 'Home', icon: Home },
  { name: 'Car', icon: Car },
  { name: 'Palette', icon: Palette },
  { name: 'FileText', icon: FileText },
  { name: 'Gem', icon: Gem },
  { name: 'Watch', icon: Watch },
  { name: 'Landmark', icon: Landmark },
  { name: 'Sailboat', icon: Sailboat },
  { name: 'TreePine', icon: TreePine },
  { name: 'Building2', icon: Building2 },
  { name: 'Coins', icon: Coins },
  { name: 'Package', icon: Package },
] as const

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  editType?: AssetType | null
}

interface FormState {
  name: string
  icon: string
  color: string
}

const EMPTY: FormState = {
  name: '',
  icon: 'Package',
  color: '#6366f1',
}

export function AssetTypeDialog({ open, onOpenChange, editType }: Props) {
  const qc = useQueryClient()
  const isEdit = !!editType
  const [form, setForm] = useState<FormState>(() =>
    editType ? { name: editType.name, icon: editType.icon, color: editType.color } : EMPTY
  )
  const set = (k: keyof FormState, v: string) => setForm(f => ({ ...f, [k]: v }))

  const mutation = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name.trim(),
        icon: form.icon,
        color: form.color,
      }
      const url = isEdit ? `/api/asset-types/${editType!.id}` : '/api/asset-types'
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asset-types'] })
      toast.success(isEdit ? 'Typ aktualisiert' : 'Typ erstellt')
      onOpenChange(false)
    },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  const isValid = form.name.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Typ bearbeiten' : 'Neuer Sachwert-Typ'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="z.B. Immobilie"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Farbe</Label>
              <input
                type="color"
                value={form.color}
                onChange={e => set('color', e.target.value)}
                className="h-8 w-12 cursor-pointer rounded border"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Icon</Label>
            <div className="grid grid-cols-6 gap-2">
              {ICON_OPTIONS.map(opt => {
                const Icon = opt.icon
                const selected = form.icon === opt.name
                return (
                  <button
                    key={opt.name}
                    type="button"
                    onClick={() => set('icon', opt.name)}
                    className={cn(
                      'flex items-center justify-center h-10 w-10 rounded-lg border transition-colors',
                      selected
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-muted hover:border-foreground/30',
                    )}
                    title={opt.name}
                  >
                    <Icon className="h-5 w-5" />
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!isValid || mutation.isPending}
          >
            {mutation.isPending ? '...' : isEdit ? 'Speichern' : 'Anlegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
