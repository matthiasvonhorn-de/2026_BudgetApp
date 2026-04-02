'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

interface EditForm {
  name: string
  color: string
  accountNumber: string
  interestRate: string
  linkedAccountId: string
  categoryId: string
  notes: string
}

export default function SavingsEditPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const qc = useQueryClient()

  const [form, setForm] = useState<EditForm | null>(null)
  const set = (k: keyof EditForm, v: string) => setForm(f => f ? { ...f, [k]: v } : f)

  const { data, isLoading } = useQuery({
    queryKey: ['savings', id],
    queryFn: () => fetch(`/api/savings/${id}`).then(r => r.json()),
  })

  useEffect(() => {
    if (!data || data.error) return
    setForm({
      name: data.account.name ?? '',
      color: data.account.color ?? '#10b981',
      accountNumber: data.accountNumber ?? '',
      interestRate: (data.interestRate * 100).toFixed(2),
      linkedAccountId: data.linkedAccountId ?? '',
      categoryId: data.categoryId ?? '',
      notes: data.notes ?? '',
    })
  }, [data])

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => fetch('/api/accounts').then(r => r.json()),
    enabled: !!data,
  })

  const giroAccounts = accounts.filter((a: any) =>
    !['SPARPLAN', 'FESTGELD'].includes(a.type) && a.isActive
  )

  const linkedAccountId = form?.linkedAccountId ?? ''

  const { data: categoryGroups = [] } = useQuery<{ id: string; name: string; categories: { id: string; name: string }[] }[]>({
    queryKey: ['account-category-groups', linkedAccountId],
    queryFn: () => fetch(`/api/accounts/${linkedAccountId}/category-groups`).then(r => r.json()),
    enabled: !!linkedAccountId,
  })

  const mutation = useMutation({
    mutationFn: async () => {
      if (!form) return
      const body: Record<string, unknown> = {
        name: form.name,
        color: form.color,
        accountNumber: form.accountNumber || null,
        interestRate: parseFloat(form.interestRate.replace(',', '.')) / 100,
        linkedAccountId: form.linkedAccountId || null,
        categoryId: form.categoryId || null,
        notes: form.notes || null,
      }
      const res = await fetch(`/api/savings/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['savings', id] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Änderungen gespeichert')
      router.push(`/savings/${id}`)
    },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  if (isLoading || !form) return <div className="p-6 text-muted-foreground">Laden…</div>
  if (!data || data.error) return <div className="p-6 text-destructive">Sparkonto nicht gefunden.</div>

  const isSparplan = data.account.type === 'SPARPLAN'
  const originalRate = (data.interestRate * 100).toFixed(2)
  const rateChanged = form.interestRate !== originalRate

  return (
    <div className="p-6 max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/savings/${id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zurück
          </Button>
        </Link>
        <h1 className="text-xl font-bold">{data.account.name} bearbeiten</h1>
      </div>

      <div className="space-y-4">
        {/* Name + Farbe */}
        <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input value={form.name} onChange={e => set('name', e.target.value)} />
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

        {/* IBAN */}
        <div className="space-y-1.5">
          <Label>IBAN / Kontonummer</Label>
          <Input value={form.accountNumber} onChange={e => set('accountNumber', e.target.value)} placeholder="optional" />
        </div>

        {/* Zinssatz */}
        <div className="space-y-1.5">
          <Label>Zinssatz p.a. (%)</Label>
          <Input
            type="number" min="0" step="0.01"
            value={form.interestRate}
            onChange={e => set('interestRate', e.target.value)}
          />
          {rateChanged && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Ändert den Zinssatz — alle noch offenen Zinsgutschriften werden neu berechnet.
            </p>
          )}
        </div>

        {/* Sparplan-spezifisch */}
        {isSparplan && (
          <>
            <div className="space-y-1.5">
              <Label>Verknüpftes Girokonto</Label>
              <Select
                value={form.linkedAccountId}
                onValueChange={(v: string | null) => { set('linkedAccountId', v ?? ''); set('categoryId', '') }}
              >
                <SelectTrigger><SelectValue placeholder="Kein Konto (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Kein Konto</SelectItem>
                  {giroAccounts.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Sparraten werden auf dem Girokonto als Ausgabe gebucht
              </p>
            </div>

            {form.linkedAccountId && (
              <div className="space-y-1.5">
                <Label>Buchungskategorie</Label>
                <Select
                  value={form.categoryId}
                  onValueChange={(v: string | null) => set('categoryId', v ?? '')}
                >
                  <SelectTrigger><SelectValue placeholder="Keine Kategorie (optional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Keine Kategorie</SelectItem>
                    {categoryGroups.map(g => (
                      <div key={g.id}>
                        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">{g.name}</div>
                        {g.categories.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </>
        )}

        {/* Notizen */}
        <div className="space-y-1.5">
          <Label>Notizen</Label>
          <Input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="optional" />
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <Button variant="outline" onClick={() => router.push(`/savings/${id}`)}>Abbrechen</Button>
        <Button
          onClick={() => mutation.mutate()}
          disabled={!form.name.trim() || !form.interestRate || mutation.isPending}
        >
          {mutation.isPending ? '…' : 'Speichern'}
        </Button>
      </div>

      {/* Zahlungsplan verlängern — nur für unbegrenzte Pläne */}
      {data.termMonths === null && <ExtendSection id={id} lastDate={data.stats?.lastScheduledDate ?? null} />}
    </div>
  )
}

function ExtendSection({ id, lastDate }: { id: string; lastDate: string | null }) {
  const qc = useQueryClient()
  const extendMutation = useMutation({
    mutationFn: (months: number) =>
      fetch(`/api/savings/${id}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ months }),
      }).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json() }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['savings', id] })
      toast.success(`${res.added} neue Einträge generiert`)
    },
    onError: () => toast.error('Fehler beim Verlängern'),
  })

  return (
    <div className="mt-8 border-t pt-6">
      <h2 className="text-sm font-semibold mb-1">Zahlungsplan verlängern</h2>
      {lastDate && (
        <p className="text-xs text-muted-foreground mb-3">
          Einträge generiert bis: {new Date(lastDate).toLocaleDateString('de-DE')}
        </p>
      )}
      <div className="flex gap-2">
        {[12, 24, 60].map(m => (
          <Button
            key={m}
            variant="outline"
            size="sm"
            onClick={() => extendMutation.mutate(m)}
            disabled={extendMutation.isPending}
          >
            {extendMutation.isPending ? '…' : `+ ${m} Monate`}
          </Button>
        ))}
      </div>
    </div>
  )
}
