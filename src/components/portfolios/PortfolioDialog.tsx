'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Portfolio } from '@/types/api'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  editPortfolio?: Portfolio | null
}

interface FormState {
  name: string
  color: string
  notes: string
}

const EMPTY: FormState = {
  name: '',
  color: '#6366f1',
  notes: '',
}

export function PortfolioDialog({ open, onOpenChange, editPortfolio }: Props) {
  const qc = useQueryClient()
  const isEdit = !!editPortfolio
  const [form, setForm] = useState<FormState>(EMPTY)
  const set = (k: keyof FormState, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    if (!open) return
    if (editPortfolio) {
      setForm({
        name: editPortfolio.name,
        color: editPortfolio.color,
        notes: editPortfolio.notes ?? '',
      })
    } else {
      setForm(EMPTY)
    }
  }, [open, editPortfolio])

  const mutation = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name.trim(),
        color: form.color,
        notes: form.notes.trim() || null,
      }
      const url = isEdit ? `/api/portfolios/${editPortfolio!.id}` : '/api/portfolios'
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolios'] })
      toast.success(isEdit ? 'Depot aktualisiert' : 'Depot erstellt')
      onOpenChange(false)
    },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  const isValid = form.name.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Depot bearbeiten' : 'Neues Depot'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="z.B. ETF-Depot"
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
