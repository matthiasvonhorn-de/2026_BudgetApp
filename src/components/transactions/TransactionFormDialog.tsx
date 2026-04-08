'use client'

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import { useSettingsStore } from '@/store/useSettingsStore'
import type { Transaction } from '@/types/api'
import { useTransactionForm } from './useTransactionForm'
import { TransactionMetadataFields } from './TransactionMetadataFields'
import { TransactionTransferSection } from './TransactionTransferSection'
import { TransactionRegularSection } from './TransactionRegularSection'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultAccountId?: string
  hideAccountSelector?: boolean
  editTransaction?: Transaction | null
}

export function TransactionFormDialog({ open, onOpenChange, defaultAccountId, hideAccountSelector, editTransaction }: Props) {
  const { currency } = useSettingsStore()

  const {
    form,
    accounts,
    categoryGroups,
    sourceCategoryGroups,
    targetCategoryGroups,
    groupCategories,
    sourceCatGroupCategories,
    targetCatGroupCategories,
    sourceAccountSubGroups,
    targetAccountSubGroups,
    selectedGroupId,
    transfer,
    isSameAccountTransfer,
    watchedAccountId,
    currentType,
    isSubOnlyTx,
    subGroupInfo,
    mutation,
    handleTypeChange,
    handleGroupChange,
    handleClose,
  } = useTransactionForm({ open, onOpenChange, defaultAccountId, editTransaction })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editTransaction ? 'Transaktion bearbeiten' : 'Neue Transaktion'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">

            <TransactionMetadataFields
              isSubOnlyTx={isSubOnlyTx}
              currentType={currentType}
              currency={currency}
              onTypeChange={handleTypeChange}
            />

            {isSubOnlyTx ? (
              <TransactionRegularSection
                editTransaction={editTransaction}
                accounts={accounts}
                watchedAccountId={watchedAccountId}
                hideAccountSelector={hideAccountSelector}
                categoryGroups={categoryGroups}
                groupCategories={groupCategories}
                selectedGroupId={selectedGroupId}
                onGroupChange={handleGroupChange}
                isSubOnlyTx={isSubOnlyTx}
                subGroupInfo={subGroupInfo}
              />
            ) : currentType === 'TRANSFER' ? (
              <TransactionTransferSection
                editTransaction={editTransaction}
                accounts={accounts}
                watchedAccountId={watchedAccountId}
                transfer={transfer}
                isSameAccountTransfer={isSameAccountTransfer}
                sourceCategoryGroups={sourceCategoryGroups}
                targetCategoryGroups={targetCategoryGroups}
                sourceCatGroupCategories={sourceCatGroupCategories}
                targetCatGroupCategories={targetCatGroupCategories}
                sourceAccountSubGroups={sourceAccountSubGroups}
                targetAccountSubGroups={targetAccountSubGroups}
              />
            ) : (
              <TransactionRegularSection
                editTransaction={editTransaction}
                accounts={accounts}
                watchedAccountId={watchedAccountId}
                hideAccountSelector={hideAccountSelector}
                categoryGroups={categoryGroups}
                groupCategories={groupCategories}
                selectedGroupId={selectedGroupId}
                onGroupChange={handleGroupChange}
                isSubOnlyTx={isSubOnlyTx}
                subGroupInfo={subGroupInfo}
              />
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>Abbrechen</Button>
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
