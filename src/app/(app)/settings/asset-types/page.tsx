'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2, Pencil, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { AssetTypeDialog } from '@/components/settings/AssetTypeDialog'
import { ASSET_TYPE_ICONS } from '@/components/assets/icon-map'
import type { AssetType } from '@/types/api'

export default function AssetTypesSettingsPage() {
  const qc = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editType, setEditType] = useState<AssetType | null>(null)

  const openCreate = () => { setEditType(null); setDialogOpen(true) }
  const openEdit = (t: AssetType) => { setEditType(t); setDialogOpen(true) }
  const closeDialog = () => { setDialogOpen(false); setEditType(null) }

  const { data: types = [], isLoading } = useQuery<AssetType[]>({
    queryKey: ['asset-types'],
    queryFn: () => fetch('/api/asset-types').then(r => r.json()),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/asset-types/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Fehler beim Löschen' }))
        throw new Error(body.error ?? 'Fehler beim Löschen')
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asset-types'] })
      toast.success('Typ gelöscht')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/settings">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zurück
          </Button>
        </Link>
        <h1 className="text-2xl font-bold flex-1">Sachwert-Typen</h1>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Neuer Typ
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Laden...</p>
      ) : types.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-muted-foreground">
          <p>Noch keine Sachwert-Typen angelegt.</p>
          <Button className="mt-4" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Ersten Typ anlegen
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-3 font-medium">Typ</th>
                <th className="text-right p-3 font-medium">Sachwerte</th>
                <th className="p-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {types.map((type) => {
                const Icon = ASSET_TYPE_ICONS[type.icon] ?? ASSET_TYPE_ICONS.Package
                return (
                  <tr key={type.id} className="border-t hover:bg-muted/30">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="flex items-center justify-center h-7 w-7 rounded-md flex-shrink-0"
                          style={{ backgroundColor: type.color + '20', color: type.color }}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="font-medium">{type.name}</span>
                      </div>
                    </td>
                    <td className="p-3 text-right text-muted-foreground">
                      {type._count?.assets ?? 0}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1 justify-end">
                        <Button
                          variant="ghost" size="sm" className="h-7 w-7 p-0"
                          onClick={() => openEdit(type)}
                          title="Bearbeiten"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm(`"${type.name}" löschen?`)) {
                              deleteMutation.mutate(type.id)
                            }
                          }}
                          title="Löschen"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <AssetTypeDialog
        key={`${dialogOpen ? 'open' : 'closed'}-${editType?.id ?? 'new'}`}
        open={dialogOpen}
        onOpenChange={closeDialog}
        editType={editType}
      />
    </div>
  )
}
