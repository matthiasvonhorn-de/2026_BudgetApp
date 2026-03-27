'use client'

import { useImportStore } from '@/store/useImportStore'
import { ImportStep1Upload } from '@/components/import/ImportStep1Upload'
import { ImportStep2Preview } from '@/components/import/ImportStep2Preview'
import { ImportStep3Categorize } from '@/components/import/ImportStep3Categorize'
import { ImportStep4Summary } from '@/components/import/ImportStep4Summary'
import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const STEPS = [
  { n: 1, label: 'Upload & Profil' },
  { n: 2, label: 'Vorschau' },
  { n: 3, label: 'Kategorisierung' },
  { n: 4, label: 'Abschluss' },
]

export default function ImportPage() {
  const step = useImportStore(s => s.step)

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">CSV-Import</h1>

      {/* Stepper */}
      <div className="flex items-center gap-0 mb-8">
        {STEPS.map((s, i) => (
          <div key={s.n} className="flex items-center">
            <div className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
              step === s.n ? 'bg-primary text-primary-foreground' :
              step > s.n ? 'bg-emerald-100 text-emerald-700' :
              'bg-muted text-muted-foreground'
            )}>
              {step > s.n ? <CheckCircle2 className="h-4 w-4" /> : <span>{s.n}</span>}
              {s.label}
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn('h-px w-8 mx-1', step > s.n ? 'bg-emerald-300' : 'bg-muted-foreground/30')} />
            )}
          </div>
        ))}
      </div>

      {step === 1 && <ImportStep1Upload />}
      {step === 2 && <ImportStep2Preview />}
      {step === 3 && <ImportStep3Categorize />}
      {step === 4 && <ImportStep4Summary />}
    </div>
  )
}
