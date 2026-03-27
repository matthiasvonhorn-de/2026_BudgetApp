import { create } from 'zustand'
import type { ParsedTransaction } from '@/lib/csv/parser'
import type { BankProfile } from '@/lib/csv/profiles'

export interface ImportTransaction extends ParsedTransaction {
  categoryId?: string
  skip?: boolean
}

interface ImportStore {
  step: 1 | 2 | 3 | 4
  accountId: string
  profile: BankProfile | null
  rawContent: string
  transactions: ImportTransaction[]

  setStep: (step: 1 | 2 | 3 | 4) => void
  setAccountId: (id: string) => void
  setProfile: (profile: BankProfile) => void
  setRawContent: (content: string) => void
  setTransactions: (txs: ImportTransaction[]) => void
  updateTransaction: (index: number, updates: Partial<ImportTransaction>) => void
  reset: () => void
}

export const useImportStore = create<ImportStore>((set) => ({
  step: 1,
  accountId: '',
  profile: null,
  rawContent: '',
  transactions: [],

  setStep: (step) => set({ step }),
  setAccountId: (accountId) => set({ accountId }),
  setProfile: (profile) => set({ profile }),
  setRawContent: (rawContent) => set({ rawContent }),
  setTransactions: (transactions) => set({ transactions }),
  updateTransaction: (index, updates) =>
    set(state => ({
      transactions: state.transactions.map((t, i) => i === index ? { ...t, ...updates } : t),
    })),
  reset: () => set({ step: 1, accountId: '', profile: null, rawContent: '', transactions: [] }),
}))
