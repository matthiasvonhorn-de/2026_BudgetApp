import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIStore {
  budgetYear: number
  budgetMonth: number
  setBudgetMonth: (year: number, month: number) => void
  goToPrevMonth: () => void
  goToNextMonth: () => void
}

const now = new Date()

export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => ({
      budgetYear: now.getFullYear(),
      budgetMonth: now.getMonth() + 1,

      setBudgetMonth: (year, month) => set({ budgetYear: year, budgetMonth: month }),

      goToPrevMonth: () => {
        const { budgetYear, budgetMonth } = get()
        if (budgetMonth === 1) set({ budgetYear: budgetYear - 1, budgetMonth: 12 })
        else set({ budgetMonth: budgetMonth - 1 })
      },

      goToNextMonth: () => {
        const { budgetYear, budgetMonth } = get()
        if (budgetMonth === 12) set({ budgetYear: budgetYear + 1, budgetMonth: 1 })
        else set({ budgetMonth: budgetMonth + 1 })
      },
    }),
    { name: 'budget-app-ui' }
  )
)
