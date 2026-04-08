'use client'

import { useQuery } from '@tanstack/react-query'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useUIStore } from '@/store/useUIStore'
import { getMonthName } from '@/lib/budget/calculations'
import { TrendingUp, TrendingDown, Wallet, PiggyBank, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import type { Account, Transaction, BudgetData, MonthlySummary, GroupSpendingData, NetWorth } from '@/types/api'

const MONTHS_DE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  const fmt = useFormatCurrency()
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border rounded-lg p-3 shadow-md text-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p: { dataKey: string; color: string; name: string; value: number }) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PieTooltip({ active, payload }: any) {
  const fmt = useFormatCurrency()
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border rounded-lg p-3 shadow-md text-sm">
      <p className="font-medium">{payload[0].name}</p>
      <p>{fmt(payload[0].value)}</p>
    </div>
  )
}

export default function DashboardPage() {
  const fmt = useFormatCurrency()
  const { locale, currency } = useSettingsStore()
  const fmtCompact = (v: number) => new Intl.NumberFormat(locale, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(v)
  const { budgetYear, budgetMonth, goToPrevMonth, goToNextMonth } = useUIStore()

  const { data: accounts = [], isError: isErrorAccounts } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => fetch('/api/accounts').then(r => r.json()),
  })

  const { data: netWorth, isError: isErrorNetWorth } = useQuery<NetWorth>({
    queryKey: ['net-worth', budgetYear, budgetMonth],
    queryFn: () => fetch(`/api/reports/net-worth?year=${budgetYear}&month=${budgetMonth}`).then(r => r.json()),
  })

  const { data: budgetData, isError: isErrorBudget } = useQuery<BudgetData>({
    queryKey: ['budget', budgetYear, budgetMonth],
    queryFn: () => fetch(`/api/budget/${budgetYear}/${budgetMonth}`).then(r => r.json()),
  })

  const { data: transactions = [], isError: isErrorTransactions } = useQuery<Transaction[]>({
    queryKey: ['transactions-recent'],
    queryFn: () => fetch('/api/transactions?pageSize=5').then(r => r.json().then(r => r.data)),
  })

  const { data: monthlySummary = [], isError: isErrorMonthlySummary } = useQuery<MonthlySummary[]>({
    queryKey: ['reports-monthly-summary-6'],
    queryFn: () => fetch('/api/reports/monthly-summary?months=6').then(r => r.json()),
  })

  const { data: groupSpendingData, isError: isErrorGroupSpending } = useQuery<GroupSpendingData>({
    queryKey: ['reports-group-spending', budgetYear, budgetMonth],
    queryFn: () => fetch(`/api/reports/category-spending?year=${budgetYear}&month=${budgetMonth}`).then(r => r.json()),
  })
  const groupSpending = groupSpendingData?.expenses ?? []

  const summary = budgetData?.summary
  const currentMonth = monthlySummary.find(m => m.year === budgetYear && m.month === budgetMonth)

  const chartData = monthlySummary.map(d => ({
    name: MONTHS_DE[d.month - 1],
    Einnahmen: d.income,
    Ausgaben: d.expenses,
  }))

  const topGroups = groupSpending?.slice(0, 6) ?? []

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <span className="text-muted-foreground">—</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goToPrevMonth} aria-label="Vorheriger Monat">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground w-36 text-center">{getMonthName(budgetMonth, budgetYear)}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goToNextMonth} aria-label="Nächster Monat">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {isErrorNetWorth ? (
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-destructive">Fehler beim Laden des Nettovermögens</div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Wallet className="h-4 w-4" /> Gesamtvermögen
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${(netWorth?.netWorth ?? 0) < 0 ? 'text-destructive' : ''}`}>
                {fmt(netWorth?.netWorth ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Konten {fmt(netWorth?.totalAssets ?? 0)}
                {(netWorth?.totalPortfolios ?? 0) > 0 && <> · Depots {fmt(netWorth?.totalPortfolios ?? 0)}</>}
                {(netWorth?.totalRealAssets ?? 0) > 0 && <> · Sachwerte {fmt(netWorth?.totalRealAssets ?? 0)}</>}
                {(netWorth?.totalDebts ?? 0) > 0 && <> · Schulden −{fmt(netWorth?.totalDebts ?? 0)}</>}
              </p>
            </CardContent>
          </Card>
        )}

        {isErrorBudget ? (
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-destructive">Fehler beim Laden der Budgetdaten</div>
            </CardContent>
          </Card>
        ) : summary && (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-600" /> Einnahmen
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-emerald-600">{fmt(currentMonth?.income ?? 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">Diesen Monat</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-destructive" /> Ausgaben
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-destructive">-{fmt(currentMonth?.expenses ?? 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">Diesen Monat</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <PiggyBank className="h-4 w-4" /> Noch zuzuteilen
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${summary.readyToAssign >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                  {fmt(summary.readyToAssign)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Budget-Zuteilung</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Charts Row */}
      {isErrorMonthlySummary ? (
        <div className="text-sm text-destructive p-4 mb-6">Fehler beim Laden der Monatsübersicht</div>
      ) : chartData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Einnahmen vs. Ausgaben</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="Einnahmen" fill="#10b981" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Ausgaben" fill="#ef4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {isErrorGroupSpending ? (
            <Card>
              <CardContent className="flex items-center justify-center h-[200px]">
                <div className="text-sm text-destructive">Fehler beim Laden der Gruppenausgaben</div>
              </CardContent>
            </Card>
          ) : topGroups.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ausgaben nach Gruppe</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={topGroups}
                      dataKey="amount"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={75}
                      innerRadius={35}
                      paddingAngle={2}
                    >
                      {topGroups.map((entry) => (
                        <Cell key={entry.groupId} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ausgaben nach Kategorie</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-center h-[200px]">
                <p className="text-sm text-muted-foreground">Keine Ausgaben diesen Monat</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Accounts + Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Konten</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isErrorAccounts ? (
              <div className="text-sm text-destructive p-4">Fehler beim Laden der Konten</div>
            ) : accounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Konten angelegt</p>
            ) : accounts.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: a.color }} />
                  <span className="text-sm">{a.name}</span>
                </div>
                <span className={`text-sm font-semibold ${a.currentBalance < 0 ? 'text-destructive' : ''}`}>
                  {fmt(a.currentBalance)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Letzte Transaktionen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isErrorTransactions ? (
              <div className="text-sm text-destructive p-4">Fehler beim Laden der Transaktionen</div>
            ) : transactions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Transaktionen</p>
            ) : transactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-1">
                <div>
                  <p className="text-sm font-medium">{t.description}</p>
                  <p className="text-xs text-muted-foreground">{t.account?.name}</p>
                </div>
                {(() => {
                  const displayAmt = t.mainAmount != null ? t.mainAmount : (t.subAmount ?? 0)
                  return (
                    <span className={`text-sm font-semibold ${displayAmt < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                      {fmt(displayAmt)}
                    </span>
                  )
                })()}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
