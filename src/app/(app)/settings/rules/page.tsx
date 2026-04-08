'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RuleFormDialog } from '@/components/settings/RuleFormDialog'
import { toast } from 'sonner'

const FIELD_LABELS: Record<string, string> = {
  DESCRIPTION: 'Beschreibung',
  PAYEE: 'Empfänger',
  AMOUNT: 'Betrag',
}

const OPERATOR_LABELS: Record<string, string> = {
  CONTAINS: 'enthält',
  STARTS_WITH: 'beginnt mit',
  ENDS_WITH: 'endet mit',
  EQUALS: 'ist gleich',
  GREATER_THAN: 'größer als',
  LESS_THAN: 'kleiner als',
  REGEX: 'Regex',
}

export default function RulesPage() {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: rules = [], isLoading, isError } = useQuery({
    queryKey: ['rules'],
    queryFn: () => fetch('/api/rules').then(r => r.json()),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/rules/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] })
      toast.success('Regel gelöscht')
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      fetch(`/api/rules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rules'] }),
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Kategorisierungsregeln</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Regeln werden beim CSV-Import automatisch auf Transaktionen angewendet
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Neue Regel
        </Button>
      </div>

      {isError ? (
        <div className="text-sm text-destructive p-4">Fehler beim Laden der Daten</div>
      ) : isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-muted rounded animate-pulse" />)}
        </div>
      ) : (rules as unknown[]).length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="font-medium">Noch keine Regeln angelegt</p>
          <p className="text-sm mt-1">Regeln ermöglichen automatische Kategorisierung beim Import</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Bedingung</th>
                <th className="text-left p-3 font-medium">Kategorie</th>
                <th className="text-center p-3 font-medium">Priorität</th>
                <th className="text-center p-3 font-medium">Aktiv</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {(rules as Array<{
                id: string
                name: string
                field: string
                operator: string
                value: string
                priority: number
                isActive: boolean
                category?: { color: string; name: string }
              }>).map((rule) => (
                <tr key={rule.id} className={`border-t hover:bg-muted/30 ${!rule.isActive ? 'opacity-50' : ''}`}>
                  <td className="p-3 font-medium">{rule.name}</td>
                  <td className="p-3 text-muted-foreground">
                    <span className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
                      {FIELD_LABELS[rule.field]} {OPERATOR_LABELS[rule.operator]} &quot;{rule.value}&quot;
                    </span>
                  </td>
                  <td className="p-3">
                    {rule.category && (
                      <Badge variant="outline" style={{ borderColor: rule.category.color, color: rule.category.color }}>
                        {rule.category.name}
                      </Badge>
                    )}
                  </td>
                  <td className="p-3 text-center text-muted-foreground">{rule.priority}</td>
                  <td className="p-3 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => toggleMutation.mutate({ id: rule.id, isActive: !rule.isActive })}
                    >
                      {rule.isActive
                        ? <ToggleRight className="h-5 w-5 text-primary" />
                        : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
                    </Button>
                  </td>
                  <td className="p-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        if (confirm('Regel löschen?')) deleteMutation.mutate(rule.id)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RuleFormDialog open={open} onOpenChange={setOpen} />
    </div>
  )
}
