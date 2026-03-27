'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface FormValues {
  name: string
  field: 'DESCRIPTION' | 'PAYEE' | 'AMOUNT'
  operator: 'CONTAINS' | 'STARTS_WITH' | 'ENDS_WITH' | 'EQUALS' | 'GREATER_THAN' | 'LESS_THAN' | 'REGEX'
  value: string
  categoryId: string
  priority: number
}

const schema = z.object({
  name: z.string().min(1, 'Name erforderlich'),
  field: z.enum(['DESCRIPTION', 'PAYEE', 'AMOUNT']),
  operator: z.enum(['CONTAINS', 'STARTS_WITH', 'ENDS_WITH', 'EQUALS', 'GREATER_THAN', 'LESS_THAN', 'REGEX']),
  value: z.string().min(1, 'Wert erforderlich'),
  categoryId: z.string().min(1, 'Kategorie erforderlich'),
  priority: z.coerce.number().default(0),
})

export function RuleFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient()

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => fetch('/api/categories').then(r => r.json()),
  })

  const allCategories: Array<{ id: string; name: string }> = [
    ...(categoriesData?.groups?.flatMap((g: { categories: Array<{ id: string; name: string }> }) => g.categories) ?? []),
    ...(categoriesData?.ungrouped ?? []),
  ]

  const form = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: {
      name: '',
      field: 'DESCRIPTION',
      operator: 'CONTAINS',
      value: '',
      categoryId: '',
      priority: 0,
    },
  })

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (!res.ok) throw new Error('Fehler')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] })
      toast.success('Regel erstellt')
      onOpenChange(false)
      form.reset()
    },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neue Kategorisierungsregel</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(v => mutation.mutate(v))} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Regelname *</FormLabel>
                <FormControl><Input placeholder="z.B. REWE → Lebensmittel" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="field" render={({ field }) => (
                <FormItem>
                  <FormLabel>Feld</FormLabel>
                  <Select
                    onValueChange={(v) => v && field.onChange(v)}
                    value={field.value}
                    itemToStringLabel={(v: string) => ({ DESCRIPTION: 'Beschreibung', PAYEE: 'Empfänger', AMOUNT: 'Betrag' }[v as string] ?? v as string)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Feld" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DESCRIPTION">Beschreibung</SelectItem>
                      <SelectItem value="PAYEE">Empfänger</SelectItem>
                      <SelectItem value="AMOUNT">Betrag</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={form.control} name="operator" render={({ field }) => (
                <FormItem>
                  <FormLabel>Operator</FormLabel>
                  <Select
                    onValueChange={(v) => v && field.onChange(v)}
                    value={field.value}
                    itemToStringLabel={(v: string) => ({ CONTAINS: 'enthält', STARTS_WITH: 'beginnt mit', ENDS_WITH: 'endet mit', EQUALS: 'ist gleich', GREATER_THAN: 'größer als', LESS_THAN: 'kleiner als', REGEX: 'Regex' }[v as string] ?? v as string)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Operator" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CONTAINS">enthält</SelectItem>
                      <SelectItem value="STARTS_WITH">beginnt mit</SelectItem>
                      <SelectItem value="ENDS_WITH">endet mit</SelectItem>
                      <SelectItem value="EQUALS">ist gleich</SelectItem>
                      <SelectItem value="GREATER_THAN">größer als</SelectItem>
                      <SelectItem value="LESS_THAN">kleiner als</SelectItem>
                      <SelectItem value="REGEX">Regex</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="value" render={({ field }) => (
              <FormItem>
                <FormLabel>Suchwert *</FormLabel>
                <FormControl><Input placeholder='z.B. "REWE" oder "netflix"' {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="categoryId" render={({ field }) => (
              <FormItem>
                <FormLabel>Ziel-Kategorie *</FormLabel>
                <Select onValueChange={(v) => v && field.onChange(v)} value={field.value}>
                  <SelectTrigger>
                    <SelectValue placeholder="Kategorie wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {allCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="priority" render={({ field }) => (
              <FormItem>
                <FormLabel>Priorität (höher = wichtiger)</FormLabel>
                <FormControl><Input type="number" {...field} /></FormControl>
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Speichern...' : 'Speichern'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
