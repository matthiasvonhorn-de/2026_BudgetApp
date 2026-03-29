'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'

const schema = z.object({
  name: z.string().min(1, 'Name ist erforderlich'),
  bank: z.string().optional(),
  iban: z.string().optional(),
  type: z.enum(['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'CASH', 'INVESTMENT']),
  currentBalance: z.coerce.number().transform(v => Math.round(v * 100) / 100),
  color: z.string(),
})

type FormValues = {
  name: string
  bank?: string
  iban?: string
  type: 'CHECKING' | 'SAVINGS' | 'CREDIT_CARD' | 'CASH' | 'INVESTMENT'
  currentBalance: number
  color: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  account?: any
}

export function AccountFormDialog({ open, onOpenChange, account }: Props) {
  const queryClient = useQueryClient()
  const isEdit = !!account

  const form = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: {
      name: '',
      bank: '',
      iban: '',
      type: 'CHECKING',
      currentBalance: 0,
      color: '#6366f1',
    },
  })

  useEffect(() => {
    if (open) {
      form.reset(account ? {
        ...account,
        currentBalance: Math.round((account.currentBalance ?? 0) * 100) / 100,
      } : {
        name: '',
        bank: '',
        iban: '',
        type: 'CHECKING',
        currentBalance: 0,
        color: '#6366f1',
      })
    }
  }, [open, account])

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const url = isEdit ? `/api/accounts/${account.id}` : '/api/accounts'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (!res.ok) throw new Error('Fehler beim Speichern')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success(isEdit ? 'Konto aktualisiert' : 'Konto erstellt')
      onOpenChange(false)
      form.reset()
    },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Konto bearbeiten' : 'Neues Konto'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Name *</FormLabel>
                <FormControl><Input placeholder="z.B. Girokonto" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="bank" render={({ field }) => (
              <FormItem>
                <FormLabel>Bank</FormLabel>
                <FormControl><Input placeholder="z.B. Zürcher Kantonalbank" {...field} /></FormControl>
              </FormItem>
            )} />
            <FormField control={form.control} name="iban" render={({ field }) => (
              <FormItem>
                <FormLabel>IBAN</FormLabel>
                <FormControl><Input placeholder="CH56 0483 5012 3456 7800 9" {...field} /></FormControl>
              </FormItem>
            )} />
            <FormField control={form.control} name="type" render={({ field }) => (
              <FormItem>
                <FormLabel>Kontotyp</FormLabel>
                <Select
                  onValueChange={(v) => v && field.onChange(v)}
                  value={field.value}
                  itemToStringLabel={(v: string) => ({ CHECKING: 'Girokonto', SAVINGS: 'Sparkonto', CREDIT_CARD: 'Kreditkarte', CASH: 'Bargeld', INVESTMENT: 'Depot' }[v as string] ?? v as string)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Typ wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CHECKING">Girokonto</SelectItem>
                    <SelectItem value="SAVINGS">Sparkonto</SelectItem>
                    <SelectItem value="CREDIT_CARD">Kreditkarte</SelectItem>
                    <SelectItem value="CASH">Bargeld</SelectItem>
                    <SelectItem value="INVESTMENT">Depot</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )} />
            <FormField control={form.control} name="currentBalance" render={({ field }) => (
              <FormItem>
                <FormLabel>Aktueller Saldo</FormLabel>
                <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="color" render={({ field }) => (
              <FormItem>
                <FormLabel>Farbe</FormLabel>
                <FormControl>
                  <div className="flex items-center gap-2">
                    <input type="color" {...field} className="h-9 w-16 cursor-pointer rounded border" />
                    <span className="text-sm text-muted-foreground">{field.value}</span>
                  </div>
                </FormControl>
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
