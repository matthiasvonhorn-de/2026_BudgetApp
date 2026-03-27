'use client'

import { useImportStore } from '@/store/useImportStore'
import { Button } from '@/components/ui/button'
import { CheckCircle2, ArrowRight } from 'lucide-react'
import Link from 'next/link'

export function ImportStep4Summary() {
  const { transactions, reset } = useImportStore()

  const imported = transactions.filter(t => !t.skip).length
  const skipped = transactions.filter(t => t.skip).length
  const categorized = transactions.filter(t => !t.skip && t.categoryId).length
  const uncategorized = imported - categorized

  return (
    <div className="max-w-md">
      <div className="flex items-center gap-3 mb-6">
        <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        <h2 className="text-xl font-semibold">Import abgeschlossen</h2>
      </div>

      <div className="space-y-3 mb-8">
        <div className="flex justify-between py-2 border-b">
          <span className="text-muted-foreground">Importiert</span>
          <span className="font-semibold text-emerald-600">{imported}</span>
        </div>
        <div className="flex justify-between py-2 border-b">
          <span className="text-muted-foreground">Kategorisiert</span>
          <span className="font-semibold">{categorized}</span>
        </div>
        {uncategorized > 0 && (
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">Ohne Kategorie</span>
            <span className="font-semibold text-amber-600">{uncategorized}</span>
          </div>
        )}
        {skipped > 0 && (
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">Übersprungen</span>
            <span className="font-semibold">{skipped}</span>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <Button onClick={reset} variant="outline">
          Neuer Import
        </Button>
        <Link href="/transactions">
          <Button>
            Transaktionen ansehen <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </Link>
      </div>
    </div>
  )
}
