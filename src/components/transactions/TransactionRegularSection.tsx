'use client'

import { useFormContext } from 'react-hook-form'
import { FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Account, Transaction } from '@/types/api'
import type { FormValues, CategoryGroup, Category } from './useTransactionForm'

interface TransactionRegularSectionProps {
  editTransaction?: Transaction | null
  accounts: Account[]
  watchedAccountId: string
  hideAccountSelector?: boolean
  categoryGroups: CategoryGroup[]
  groupCategories: Category[]
  selectedGroupId: string
  onGroupChange: (groupId: string) => void
  isSubOnlyTx: boolean
  subGroupInfo?: {
    id: string
    name: string
    subAccount: { id: string; name: string }
  }
}

export function TransactionRegularSection({
  editTransaction,
  accounts,
  watchedAccountId,
  hideAccountSelector,
  categoryGroups,
  groupCategories,
  selectedGroupId,
  onGroupChange,
  isSubOnlyTx,
  subGroupInfo,
}: TransactionRegularSectionProps) {
  const form = useFormContext<FormValues>()

  if (isSubOnlyTx) {
    return (
      <>
        {/* Sub-Only-TX: Konto und Unterkonto-Gruppe als Info */}
        <FormItem>
          <FormLabel>Konto</FormLabel>
          <p className="text-sm">{editTransaction?.account?.name ?? '—'}</p>
        </FormItem>
        {subGroupInfo && (
          <>
            <FormItem>
              <FormLabel>Unterkonto</FormLabel>
              <p className="text-sm">{subGroupInfo.subAccount.name}</p>
            </FormItem>
            <FormItem>
              <FormLabel>Gruppe</FormLabel>
              <p className="text-sm">{subGroupInfo.name}</p>
            </FormItem>
          </>
        )}
      </>
    )
  }

  return (
    <>
      {/* Konto (nur wenn nicht vorbelegt) */}
      {!hideAccountSelector && (
        <FormField control={form.control} name="accountId" render={({ field }) => (
          <FormItem>
            <FormLabel>Konto *</FormLabel>
            <Select
              onValueChange={(v) => v && field.onChange(v)}
              value={field.value}
              items={accounts.map((a: Account) => ({ value: a.id, label: a.name }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Konto wählen" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a: Account) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />
      )}

      {/* Gruppe (nur wenn Konto gewählt und Gruppen vorhanden) */}
      {watchedAccountId && categoryGroups.length > 0 && (
        <FormItem>
          <FormLabel>Gruppe</FormLabel>
          <Select
            onValueChange={(v) => onGroupChange(v === '__none__' ? '' : (v ?? ''))}
            value={selectedGroupId || '__none__'}
            items={[{ value: '__none__', label: '— Keine Gruppe —' }, ...categoryGroups.map(g => ({ value: g.id, label: g.name }))]}
          >
            <SelectTrigger>
              <SelectValue placeholder="Gruppe wählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Keine Gruppe —</SelectItem>
              {categoryGroups.map(g => (
                <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormItem>
      )}

      {/* Kategorie (nur wenn Gruppe gewählt) */}
      {selectedGroupId && (
        <FormField control={form.control} name="categoryId" render={({ field }) => (
          <FormItem>
            <FormLabel>Kategorie</FormLabel>
            <Select
              onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}
              value={field.value || '__none__'}
              items={[{ value: '__none__', label: '— Keine Kategorie —' }, ...groupCategories.map(c => ({ value: c.id, label: c.name }))]}
            >
              <SelectTrigger>
                <SelectValue placeholder="Kategorie wählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Keine Kategorie —</SelectItem>
                {groupCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormItem>
        )} />
      )}
    </>
  )
}
