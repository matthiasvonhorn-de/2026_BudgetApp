'use client'

import { useFormContext } from 'react-hook-form'
import { FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Account, Transaction } from '@/types/api'
import type { FormValues, TransferState, CategoryGroup, SubAccountGroup, Category } from './useTransactionForm'

interface TransactionTransferSectionProps {
  editTransaction?: Transaction | null
  accounts: Account[]
  watchedAccountId: string
  transfer: TransferState
  isSameAccountTransfer: boolean | "" | undefined
  sourceCategoryGroups: CategoryGroup[]
  targetCategoryGroups: CategoryGroup[]
  sourceCatGroupCategories: Category[]
  targetCatGroupCategories: Category[]
  sourceAccountSubGroups: SubAccountGroup[]
  targetAccountSubGroups: SubAccountGroup[]
}

export function TransactionTransferSection({
  editTransaction,
  accounts,
  watchedAccountId,
  transfer,
  isSameAccountTransfer,
  sourceCategoryGroups,
  targetCategoryGroups,
  sourceCatGroupCategories,
  targetCatGroupCategories,
  sourceAccountSubGroups,
  targetAccountSubGroups,
}: TransactionTransferSectionProps) {
  const form = useFormContext<FormValues>()

  // Edit Transfer: read-only summary
  if (editTransaction?.transferToId != null) {
    return (
      <>
        <FormItem>
          <FormLabel>Von Konto</FormLabel>
          <p className="text-sm">{editTransaction.account?.name ?? '—'}</p>
        </FormItem>
        <FormItem>
          <FormLabel>Auf Konto</FormLabel>
          <p className="text-sm text-muted-foreground">
            {/* transferToId exists but we don't have the target account name directly */}
            Umbuchung (nur Betrag bearbeitbar)
          </p>
        </FormItem>
      </>
    )
  }

  // Create Transfer: full form
  return (
    <>
      {/* Von Konto */}
      <FormField control={form.control} name="accountId" render={({ field }) => (
        <FormItem>
          <FormLabel>Von Konto *</FormLabel>
          <Select
            onValueChange={(v) => {
              field.onChange(v)
              transfer.setTransferTargetId('')
              transfer.setTransferGroupId('')
              transfer.setSourceSubGroupId('')
              transfer.setSourceCatGroupId('')
              transfer.setSourceCategoryId('')
              transfer.setTargetCatGroupId('')
              transfer.setTargetCategoryId('')
            }}
            value={field.value}
            items={accounts.map((a: Account) => ({ value: a.id, label: a.name }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Quellkonto wählen" />
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

      {/* Buchungsart Quelle */}
      {watchedAccountId && (
        <FormItem>
          <FormLabel>Buchungsart Quelle *</FormLabel>
          <Select
            onValueChange={(v) => {
              const newVal = v as 'MAIN' | 'SUB'
              transfer.setSourceType(newVal)
              transfer.setSourceSubGroupId('')
              transfer.setSourceCatGroupId('')
              transfer.setSourceCategoryId('')
              // Same-account sync: keep types identical
              if (isSameAccountTransfer) {
                transfer.setTargetType(newVal)
                transfer.setTransferGroupId('')
                transfer.setTargetCatGroupId('')
                transfer.setTargetCategoryId('')
              }
            }}
            value={transfer.sourceType}
            items={[{ value: 'MAIN', label: 'Hauptkonto' }, { value: 'SUB', label: 'Unterkonto' }]}
          >
            <SelectTrigger>
              <SelectValue placeholder="Buchungsart wählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MAIN">Hauptkonto</SelectItem>
              <SelectItem value="SUB">Unterkonto</SelectItem>
            </SelectContent>
          </Select>
        </FormItem>
      )}

      {/* Source: Hauptkonto → Gruppe + Kategorie (nur wenn Gruppen vorhanden) */}
      {watchedAccountId && transfer.sourceType === 'MAIN' && sourceCategoryGroups.length > 0 && (
        <>
          <FormItem>
            <FormLabel>Gruppe (Quelle)</FormLabel>
            <Select
              onValueChange={(v) => {
                if (v !== null) transfer.setSourceCatGroupId(v)
                transfer.setSourceCategoryId('')
              }}
              value={transfer.sourceCatGroupId}
              items={sourceCategoryGroups.map(g => ({ value: g.id, label: g.name }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Gruppe wählen" />
              </SelectTrigger>
              <SelectContent>
                {sourceCategoryGroups.map(g => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormItem>
          {transfer.sourceCatGroupId && sourceCatGroupCategories.length > 0 && (
            <FormItem>
              <FormLabel>Kategorie (Quelle)</FormLabel>
              <Select
                onValueChange={(v) => { if (v !== null) transfer.setSourceCategoryId(v) }}
                value={transfer.sourceCategoryId}
                items={sourceCatGroupCategories.map(c => ({ value: c.id, label: c.name }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kategorie wählen" />
                </SelectTrigger>
                <SelectContent>
                  {sourceCatGroupCategories.map(c => (
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
          )}
        </>
      )}

      {/* Source: Unterkonto → Sub-Account-Gruppe (nur wenn vorhanden) */}
      {watchedAccountId && transfer.sourceType === 'SUB' && sourceAccountSubGroups.length > 0 && (
        <FormItem>
          <FormLabel>Gruppe (Quelle)</FormLabel>
          <Select
            onValueChange={(v) => { if (v !== null) transfer.setSourceSubGroupId(v) }}
            value={transfer.sourceSubGroupId}
            items={sourceAccountSubGroups.map(g => ({ value: g.id, label: g.name }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Unterkonto-Gruppe wählen" />
            </SelectTrigger>
            <SelectContent>
              {sourceAccountSubGroups.map(g => (
                <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormItem>
      )}

      {/* Auf Konto */}
      {watchedAccountId && (
        <FormItem>
          <FormLabel>Auf Konto *</FormLabel>
          <Select
            onValueChange={(v) => {
              if (v !== null) transfer.setTransferTargetId(v)
              transfer.setTransferGroupId('')
              transfer.setTargetCatGroupId('')
              transfer.setTargetCategoryId('')
              // Same-account sync: when switching to same account, sync target type
              if (v === watchedAccountId) {
                transfer.setTargetType(transfer.sourceType)
              }
            }}
            value={transfer.transferTargetId}
            items={accounts.map((a: Account) => ({ value: a.id, label: a.name }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Zielkonto wählen" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a: Account) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormItem>
      )}

      {/* Buchungsart Ziel */}
      {transfer.transferTargetId && (
        <FormItem>
          <FormLabel>Buchungsart Ziel *</FormLabel>
          <Select
            onValueChange={(v) => {
              const newVal = v as 'MAIN' | 'SUB'
              transfer.setTargetType(newVal)
              transfer.setTransferGroupId('')
              transfer.setTargetCatGroupId('')
              transfer.setTargetCategoryId('')
              // Same-account sync: keep types identical
              if (isSameAccountTransfer) {
                transfer.setSourceType(newVal)
                transfer.setSourceSubGroupId('')
                transfer.setSourceCatGroupId('')
                transfer.setSourceCategoryId('')
              }
            }}
            value={isSameAccountTransfer ? transfer.sourceType : transfer.targetType}
            items={[{ value: 'MAIN', label: 'Hauptkonto' }, { value: 'SUB', label: 'Unterkonto' }]}
          >
            <SelectTrigger>
              <SelectValue placeholder="Buchungsart wählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MAIN">Hauptkonto</SelectItem>
              <SelectItem value="SUB">Unterkonto</SelectItem>
            </SelectContent>
          </Select>
        </FormItem>
      )}

      {/* Target: Hauptkonto → Gruppe + Kategorie (nur wenn Gruppen vorhanden) */}
      {transfer.transferTargetId && transfer.targetType === 'MAIN' && targetCategoryGroups.length > 0 && (
        <>
          <FormItem>
            <FormLabel>Gruppe (Ziel)</FormLabel>
            <Select
              onValueChange={(v) => {
                if (v !== null) transfer.setTargetCatGroupId(v)
                transfer.setTargetCategoryId('')
              }}
              value={transfer.targetCatGroupId}
              items={targetCategoryGroups.map(g => ({ value: g.id, label: g.name }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Gruppe wählen" />
              </SelectTrigger>
              <SelectContent>
                {targetCategoryGroups.map(g => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormItem>
          {transfer.targetCatGroupId && targetCatGroupCategories.length > 0 && (
            <FormItem>
              <FormLabel>Kategorie (Ziel)</FormLabel>
              <Select
                onValueChange={(v) => { if (v !== null) transfer.setTargetCategoryId(v) }}
                value={transfer.targetCategoryId}
                items={targetCatGroupCategories.map(c => ({ value: c.id, label: c.name }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kategorie wählen" />
                </SelectTrigger>
                <SelectContent>
                  {targetCatGroupCategories.map(c => (
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
          )}
        </>
      )}

      {/* Target: Unterkonto → Sub-Account-Gruppe (nur wenn vorhanden) */}
      {transfer.transferTargetId && transfer.targetType === 'SUB' && targetAccountSubGroups.length > 0 && (
        <FormItem>
          <FormLabel>Gruppe (Ziel)</FormLabel>
          <Select
            onValueChange={(v) => {
              if (v !== null) transfer.setTransferGroupId(v)
            }}
            value={transfer.transferGroupId}
            items={targetAccountSubGroups.map(g => ({ value: g.id, label: g.name }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Unterkonto-Gruppe wählen" />
            </SelectTrigger>
            <SelectContent>
              {targetAccountSubGroups.map(g => (
                <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormItem>
      )}
    </>
  )
}
