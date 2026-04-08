export interface SubAccountGroup {
  id: string
  name: string
  subAccount: { name: string }
}

export interface Category {
  id: string
  name: string
  color: string
  type: string
  sortOrder: number
  isActive: boolean
  rolloverEnabled: boolean
  subAccountGroupId?: string | null
  subAccountLinkType?: string | null
  subAccountGroup?: SubAccountGroup | null
}

export interface Group {
  id: string
  name: string
  sortOrder: number
  categories: Category[]
}

export interface CategoryData {
  id: string
  name: string
  color: string
  type: string
  budgeted: number
  rolledOver: number
  activity: number
  available: number
  subAccountGroupId: string | null
  subAccountLinkType: string
}

export interface GroupData {
  id: string
  name: string
  categories: CategoryData[]
}

export interface AccountBudgetData {
  account: { id: string; name: string; color: string }
  year: number
  month: number
  openingBalance: number
  openingBalancePlan: number
  subAccountsBalance: number
  groups: GroupData[]
  summary: {
    totalBudgeted: number
    totalActivity: number
    closingBalancePlan: number
    closingBalanceActual: number
  }
}

export interface BookDialogState {
  open: boolean
  cat?: CategoryData
}
