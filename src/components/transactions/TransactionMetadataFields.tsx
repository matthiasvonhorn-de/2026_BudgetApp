'use client'

import { useFormContext } from 'react-hook-form'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { FormValues } from './useTransactionForm'

interface TransactionMetadataFieldsProps {
  isSubOnlyTx: boolean
  currentType: FormValues['mainType']
  currency: string
  onTypeChange: (v: string) => void
}

export function TransactionMetadataFields({
  isSubOnlyTx,
  currentType,
  currency,
  onTypeChange,
}: TransactionMetadataFieldsProps) {
  const form = useFormContext<FormValues>()

  return (
    <>
      {/* Typ — read-only bei Sub-Only-TX */}
      {isSubOnlyTx ? (
        <FormItem>
          <FormLabel>Typ</FormLabel>
          <p className="text-sm text-muted-foreground">Unterkonto-Buchung</p>
        </FormItem>
      ) : (
        <FormField control={form.control} name="mainType" render={({ field }) => (
          <FormItem>
            <FormLabel>Typ</FormLabel>
            <Select
              onValueChange={(v) => v && onTypeChange(v)}
              value={field.value}
              itemToStringLabel={(v: string) => ({ EXPENSE: 'Ausgabe', INCOME: 'Einnahme', TRANSFER: 'Umbuchung' }[v] ?? v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Typ wählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EXPENSE">Ausgabe</SelectItem>
                <SelectItem value="INCOME">Einnahme</SelectItem>
                <SelectItem value="TRANSFER">Umbuchung</SelectItem>
              </SelectContent>
            </Select>
          </FormItem>
        )} />
      )}

      {/* Datum */}
      <FormField control={form.control} name="date" render={({ field }) => (
        <FormItem>
          <FormLabel>Datum *</FormLabel>
          <FormControl><Input type="date" {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />

      {/* Beschreibung */}
      <FormField control={form.control} name="description" render={({ field }) => (
        <FormItem>
          <FormLabel>Beschreibung *</FormLabel>
          <FormControl><Input placeholder="z.B. REWE Einkauf" {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />

      {/* Auftraggeber */}
      {currentType !== 'TRANSFER' && (
        <FormField control={form.control} name="payee" render={({ field }) => (
          <FormItem>
            <FormLabel>Auftraggeber / Empfänger</FormLabel>
            <FormControl><Input placeholder="optional" {...field} /></FormControl>
          </FormItem>
        )} />
      )}

      {/* Betrag */}
      <FormField control={form.control} name="amount" render={({ field }) => (
        <FormItem>
          <FormLabel>Betrag ({currency}) *</FormLabel>
          <FormControl><Input type="number" step="0.01" min="0" {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />
    </>
  )
}
