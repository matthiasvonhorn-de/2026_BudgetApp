'use client'

import { useImportStore } from '@/store/useImportStore'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatDate } from '@/lib/utils'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import { ArrowLeft, EyeOff } from 'lucide-react'
import { toast } from 'sonner'

export function ImportStep3Categorize() {
  const fmt = useFormatCurrency()
  const { transactions, accountId, setStep, updateTransaction } = useImportStore()
  const queryClient = useQueryClient()

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => fetch('/api/categories').then(r => r.json()),
  })

  const allCategories: Array<{ id: string; name: string }> = [
    ...(categoriesData?.groups?.flatMap((g: { categories: Array<{ id: string; name: string }> }) => g.categories) ?? []),
    ...(categoriesData?.ungrouped ?? []),
  ]

  const active = transactions.filter(t => !t.skip)
  const skipped = transactions.filter(t => t.skip).length

  const importMutation = useMutation({
    mutationFn: async () => {
      const toImport = transactions
        .filter(t => !t.skip)
        .map(t => ({
          date: t.date,
          amount: t.amount,
          description: t.description,
          payee: t.payee,
          categoryId: t.categoryId ?? null,
          hash: t.hash,
        }))

      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, transactions: toImport }),
      })
      if (!res.ok) throw new Error('Fehler')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      setStep(4)
    },
    onError: () => toast.error('Fehler beim Importieren'),
  })

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Zurück
        </Button>
        <div className="text-sm text-muted-foreground">
          {active.length} zu importieren · {skipped} übersprungen
        </div>
        <Button
          className="ml-auto"
          onClick={() => importMutation.mutate()}
          disabled={importMutation.isPending || active.length === 0}
        >
          {importMutation.isPending ? 'Importiere...' : `${active.length} Transaktionen importieren`}
        </Button>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <div className="max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted sticky top-0">
              <tr>
                <th className="p-3 w-8"></th>
                <th className="text-left p-3 font-medium">Datum</th>
                <th className="text-left p-3 font-medium">Beschreibung</th>
                <th className="text-right p-3 font-medium">Betrag</th>
                <th className="text-left p-3 font-medium w-48">Kategorie</th>
                <th className="p-3 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t, i) => (
                <tr key={i} className={`border-t ${t.skip ? 'opacity-40' : 'hover:bg-muted/20'}`}>
                  <td className="p-3 text-center">
                    {t.skip ? <EyeOff className="h-3 w-3 text-muted-foreground mx-auto" /> : null}
                  </td>
                  <td className="p-3 text-muted-foreground whitespace-nowrap">{formatDate(t.date)}</td>
                  <td className="p-3 max-w-[200px]">
                    <p className="truncate text-sm">{t.description}</p>
                    {t.payee && <p className="text-xs text-muted-foreground truncate">{t.payee}</p>}
                  </td>
                  <td className={`p-3 text-right font-semibold whitespace-nowrap ${t.amount < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                    {fmt(t.amount)}
                  </td>
                  <td className="p-3">
                    <Select
                      value={t.categoryId ?? ''}
                      onValueChange={v => updateTransaction(i, { categoryId: v || undefined })}
                      // Base UI onValueChange passes string | null
                      disabled={t.skip}
                      items={allCategories.map(c => ({ value: c.id, label: c.name }))}
                      itemToStringLabel={(v: string) => {
                        if (!v) return 'Keine Kategorie'
                        return allCategories.find(c => c.id === v)?.name ?? v
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Kategorie..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Keine Kategorie</SelectItem>
                        {allCategories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground"
                      onClick={() => updateTransaction(i, { skip: !t.skip })}
                      title={t.skip ? 'Einschliessen' : 'Überspringen'}
                    >
                      {t.skip ? '+' : '×'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
