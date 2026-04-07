'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2, Pencil, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PortfolioDialog } from '@/components/portfolios/PortfolioDialog'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import type { PortfolioListItem } from '@/types/api'

export default function PortfoliosSettingsPage() {
  const qc = useQueryClient()
  const fmt = useFormatCurrency()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editPortfolio, setEditPortfolio] = useState<PortfolioListItem | null>(null)

  const openCreate = () => { setEditPortfolio(null); setDialogOpen(true) }
  const openEdit = (p: PortfolioListItem) => { setEditPortfolio(p); setDialogOpen(true) }
  const closeDialog = () => { setDialogOpen(false); setEditPortfolio(null) }

  const { data: portfolios = [], isLoading } = useQuery<PortfolioListItem[]>({
    queryKey: ['portfolios'],
    queryFn: () => fetch('/api/portfolios').then(r => r.json()),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/portfolios/${id}`, { method: 'DELETE' }).then(async r => {
        if (!r.ok) throw new Error(await r.text())
        return r.json()
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolios'] })
      toast.success('Depot gelöscht')
    },
    onError: () => toast.error('Fehler beim Löschen'),
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
        <h1 className="text-2xl font-bold flex-1">Aktiendepots</h1>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Neues Depot
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Laden...</p>
      ) : portfolios.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-muted-foreground">
          <p>Noch keine Depots angelegt.</p>
          <Button className="mt-4" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Erstes Depot anlegen
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-3 font-medium">Depot</th>
                <th className="text-right p-3 font-medium">Aktueller Wert</th>
                <th className="text-left p-3 font-medium">Notizen</th>
                <th className="p-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {portfolios.map((portfolio) => (
                <tr key={portfolio.id} className="border-t hover:bg-muted/30">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: portfolio.color }}
                      />
                      <span className="font-medium">{portfolio.name}</span>
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    {portfolio.currentValue != null ? fmt(portfolio.currentValue) : '—'}
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">
                    {portfolio.notes ?? '—'}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1 justify-end">
                      <Button
                        variant="ghost" size="sm" className="h-7 w-7 p-0"
                        onClick={() => openEdit(portfolio)}
                        title="Bearbeiten"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm(`"${portfolio.name}" löschen?`)) {
                            deleteMutation.mutate(portfolio.id)
                          }
                        }}
                        title="Löschen"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PortfolioDialog
        key={`${dialogOpen ? 'open' : 'closed'}-${editPortfolio?.id ?? 'new'}`}
        open={dialogOpen}
        onOpenChange={closeDialog}
        editPortfolio={editPortfolio}
      />
    </div>
  )
}
