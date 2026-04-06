'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AppSelect } from '@/components/ui/app-select'
import type { Asset, AssetType } from '@/types/api'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  editAsset?: Asset | null
}

interface FormState {
  name: string
  assetTypeId: string
  color: string
  ownershipPercent: string
  purchaseDate: string
  purchasePrice: string
  notes: string
}

const EMPTY: FormState = {
  name: '',
  assetTypeId: '',
  color: '#6366f1',
  ownershipPercent: '100',
  purchaseDate: new Date().toISOString().slice(0, 10),
  purchasePrice: '',
  notes: '',
}

export function AssetDialog({ open, onOpenChange, editAsset }: Props) {
  const qc = useQueryClient()
  const isEdit = !!editAsset
  const [form, setForm] = useState<FormState>(EMPTY)
  const set = (k: keyof FormState, v: string) => setForm(f => ({ ...f, [k]: v }))

  const { data: assetTypes = [] } = useQuery<AssetType[]>({
    queryKey: ['asset-types'],
    queryFn: () => fetch('/api/asset-types').then(r => r.json()),
  })

  useEffect(() => {
    if (!open) return
    if (editAsset) {
      setForm({
        name: editAsset.name,
        assetTypeId: editAsset.assetTypeId,
        color: editAsset.color,
        ownershipPercent: editAsset.ownershipPercent.toString(),
        purchaseDate: editAsset.purchaseDate.slice(0, 10),
        purchasePrice: editAsset.purchasePrice.toString(),
        notes: editAsset.notes ?? '',
      })
    } else {
      setForm(EMPTY)
    }
  }, [open, editAsset])

  const mutation = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name.trim(),
        assetTypeId: form.assetTypeId,
        color: form.color,
        ownershipPercent: parseFloat(form.ownershipPercent),
        purchaseDate: form.purchaseDate,
        purchasePrice: parseFloat(form.purchasePrice.replace(',', '.')),
        notes: form.notes.trim() || null,
      }
      const url = isEdit ? `/api/assets/${editAsset!.id}` : '/api/assets'
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] })
      toast.success(isEdit ? 'Sachwert aktualisiert' : 'Sachwert erstellt')
      onOpenChange(false)
    },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  const typeOptions = assetTypes.map(t => ({ value: t.id, label: t.name }))
  const price = parseFloat(form.purchasePrice.replace(',', '.'))
  const percent = parseFloat(form.ownershipPercent)
  const isValid =
    form.name.trim().length > 0 &&
    form.assetTypeId.length > 0 &&
    form.purchaseDate.length > 0 &&
    !isNaN(price) && price > 0 &&
    !isNaN(percent) && percent >= 1 && percent <= 100

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Sachwert bearbeiten' : 'Neuer Sachwert'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="z.B. Wohnung Schillerstr."
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
            <Label>Typ *</Label>
            <AppSelect
              value={form.assetTypeId}
              onValueChange={v => set('assetTypeId', v ?? '')}
              options={typeOptions}
              placeholder="Typ wählen..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Kaufdatum *</Label>
              <Input
                type="date"
                value={form.purchaseDate}
                onChange={e => set('purchaseDate', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Kaufpreis (Gesamt) *</Label>
              <Input
                type="number"
                step="0.01"
                value={form.purchasePrice}
                onChange={e => set('purchasePrice', e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Eigentumsanteil (%)</Label>
            <Input
              type="number"
              min="1"
              max="100"
              value={form.ownershipPercent}
              onChange={e => set('ownershipPercent', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Notizen</Label>
            <Input
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="optional"
            />
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
