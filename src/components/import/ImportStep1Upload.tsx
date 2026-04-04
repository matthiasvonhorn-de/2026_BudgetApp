'use client'

import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Upload, FileText } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { parseCsv } from '@/lib/csv/parser'
import { BANK_PROFILES } from '@/lib/csv/profiles'
import { useImportStore } from '@/store/useImportStore'
import { applyRules } from '@/lib/rules/matcher'
import type { CategoryRule } from '@prisma/client'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export function ImportStep1Upload() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [fileName, setFileName] = useState('')

  const { accountId, profile, setAccountId, setProfile, setStep, setTransactions, setRawContent } = useImportStore()

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => fetch('/api/accounts').then(r => r.json()),
  })

  const { data: rules = [] } = useQuery<CategoryRule[]>({
    queryKey: ['rules'],
    queryFn: () => fetch('/api/rules').then(r => r.json()),
  })

  const processFile = async (file: File) => {
    setFileName(file.name)
    const content = await file.text()
    setRawContent(content)

    if (!profile) {
      toast.error('Bitte zuerst ein Bank-Profil wählen')
      return
    }

    setIsProcessing(true)
    try {
      const result = await parseCsv(content, profile)

      if (result.transactions.length === 0) {
        toast.error('Keine Transaktionen gefunden. Prüfe das Bankprofil.')
        setIsProcessing(false)
        return
      }

      // Regeln anwenden
      const withCategories = result.transactions.map(tx => ({
        ...tx,
        categoryId: applyRules(rules, tx) ?? undefined,
      }))

      setTransactions(withCategories)

      if (result.errors.length > 0) {
        toast.warning(`${result.errors.length} Zeilen konnten nicht geparst werden`)
      }

      toast.success(`${result.transactions.length} Transaktionen erkannt`)
      setStep(2)
    } catch (e) {
      toast.error('Fehler beim Parsen der Datei')
      console.error(e)
    }
    setIsProcessing(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="space-y-2">
        <Label>Konto</Label>
        <Select
          value={accountId}
          onValueChange={(v) => setAccountId(v ?? '')}
          items={(accounts as Array<{ id: string; name: string }>).map(a => ({ value: a.id, label: a.name }))}
          itemToStringLabel={(v: string) => (accounts as Array<{ id: string; name: string }>).find(a => a.id === v)?.name ?? v}
        >
          <SelectTrigger><SelectValue placeholder="Konto wählen" /></SelectTrigger>
          <SelectContent>
            {(accounts as Array<{ id: string; name: string }>).map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Bankprofil</Label>
        <Select
          value={profile?.id ?? ''}
          onValueChange={id => { if (id) setProfile(BANK_PROFILES.find(p => p.id === id)!) }}
          items={BANK_PROFILES.map(p => ({ value: p.id, label: p.name }))}
          itemToStringLabel={(v: string) => BANK_PROFILES.find(p => p.id === v)?.name ?? v}
        >
          <SelectTrigger><SelectValue placeholder="Bank wählen" /></SelectTrigger>
          <SelectContent>
            {BANK_PROFILES.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {profile && (
          <p className="text-xs text-muted-foreground">
            Trennzeichen: &quot;{profile.delimiter}&quot; · Datumsformat: {profile.dateFormat} · Überspringe: {profile.skipRows} Zeilen
          </p>
        )}
      </div>

      <div
        className={cn(
          'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors',
          isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50'
        )}
        onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        {fileName ? (
          <div className="flex flex-col items-center gap-2">
            <FileText className="h-10 w-10 text-primary" />
            <p className="font-medium">{fileName}</p>
            <p className="text-sm text-muted-foreground">Klicken um andere Datei zu wählen</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Upload className="h-10 w-10" />
            <p className="font-medium">CSV-Datei hier ablegen</p>
            <p className="text-sm">oder klicken zum Auswählen</p>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) processFile(file)
          }}
        />
      </div>

      {!accountId && <p className="text-sm text-destructive">Bitte Konto auswählen</p>}
      {!profile && <p className="text-sm text-destructive">Bitte Bankprofil auswählen</p>}

      {isProcessing && <p className="text-sm text-muted-foreground animate-pulse">Datei wird verarbeitet...</p>}
    </div>
  )
}
