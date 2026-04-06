'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, ReferenceLine,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AppSelect } from '@/components/ui/app-select'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import { useSettingsStore } from '@/store/useSettingsStore'
import type { Account, AccountBalanceMonth, MonthlySummary, GroupSpending, GroupSpendingData, BudgetData, BudgetGroup } from '@/types/api'

const BUDGET_ACCOUNT_TYPES = ['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'CASH']

const MONTHS_DE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

function MonthYearSelector({
  year, month, onChange,
}: { year: number; month: number; onChange: (year: number, month: number) => void }) {
  const now = new Date()
  const years = [now.getFullYear() - 1, now.getFullYear()]

  return (
    <div className="flex gap-2">
      <Select value={String(month)} onValueChange={(v: string | null) => v && onChange(year, parseInt(v))}>
        <SelectTrigger className="w-32">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          {MONTHS_DE.map((m, i) => (
            <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={String(year)} onValueChange={(v: string | null) => v && onChange(parseInt(v), month)}>
        <SelectTrigger className="w-24">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          {years.map(y => (
            <SelectItem key={y} value={String(y)}>{y}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltipBar({ active, payload, label }: any) {
  const fmt = useFormatCurrency()
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border rounded-lg p-3 shadow-md text-sm">
      <p className="font-medium mb-1">{label}</p>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltipPie({ active, payload }: any) {
  const fmt = useFormatCurrency()
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border rounded-lg p-3 shadow-md text-sm">
      <p className="font-medium">{payload[0].name}</p>
      <p>{fmt(payload[0].value)}</p>
    </div>
  )
}

function BalanceAreaChart({
  data, dataKey, stroke, height = 280, id,
}: { data: Array<Record<string, unknown>>; dataKey: string; stroke: string; height?: number; id: string }) {
  const fmt = useFormatCurrency()
  const fmtCompact = (v: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(v)

  const values = data.map(d => d[dataKey] as number)
  const max = Math.max(...values, 0)
  const min = Math.min(...values, 0)
  const range = max - min
  const offset = range > 0 ? max / range : 0.5

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <defs>
          <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset={0} stopColor="#10b981" stopOpacity={0.15} />
            <stop offset={offset} stopColor="#10b981" stopOpacity={0.05} />
            <stop offset={offset} stopColor="#ef4444" stopOpacity={0.05} />
            <stop offset={1} stopColor="#ef4444" stopOpacity={0.15} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11 }} />
        <Tooltip content={<CustomTooltipBar />} />
        <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
        <Area type="monotone" dataKey={dataKey} stroke={stroke} strokeWidth={2} fill={`url(#grad-${id})`} dot={{ r: 3 }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export default function ReportsPage() {
  const fmt = useFormatCurrency()
  const { locale, currency } = useSettingsStore()
  const fmtCompact = (v: number) => new Intl.NumberFormat(locale, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(v)
  const now = new Date()
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => fetch('/api/accounts').then(r => r.json()),
  })
  const budgetAccounts = accounts.filter(a => a.isActive && BUDGET_ACCOUNT_TYPES.includes(a.type))

  useEffect(() => {
    if (!selectedAccountId && budgetAccounts.length > 0) {
      setSelectedAccountId(budgetAccounts[0].id)
    }
  }, [budgetAccounts, selectedAccountId])

  const { data: monthlySummary = [] } = useQuery<MonthlySummary[]>({
    queryKey: ['reports-monthly-summary'],
    queryFn: () => fetch('/api/reports/monthly-summary?months=12').then(r => r.json()),
  })

  const { data: groupSpendingData } = useQuery<GroupSpendingData>({
    queryKey: ['reports-group-spending', selectedYear, selectedMonth, selectedAccountId],
    queryFn: () => fetch(`/api/reports/category-spending?year=${selectedYear}&month=${selectedMonth}&accountId=${selectedAccountId}`).then(r => r.json()),
    enabled: !!selectedAccountId,
  })
  const groupExpenses = groupSpendingData?.expenses ?? []
  const groupIncome = groupSpendingData?.income ?? []

  const { data: budgetData } = useQuery<BudgetData>({
    queryKey: ['budget', selectedYear, selectedMonth],
    queryFn: () => fetch(`/api/budget/${selectedYear}/${selectedMonth}`).then(r => r.json()),
  })

  const { data: accountBalance = [] } = useQuery<AccountBalanceMonth[]>({
    queryKey: ['reports-account-balance', selectedAccountId],
    queryFn: () => fetch(`/api/reports/account-balance?accountId=${selectedAccountId}&months=12`).then(r => r.json()),
    enabled: !!selectedAccountId,
  })

  const balanceChartData = accountBalance.map((d) => ({
    name: `${MONTHS_DE[d.month - 1]} ${d.year !== now.getFullYear() ? d.year : ''}`.trim(),
    Gesamt: d.totalBalance,
    Hauptkonto: d.mainBalance,
    Unterkonten: d.subBalance,
  }))

  // Unique sub-account groups with time series data
  const groupIds = accountBalance.length > 0
    ? [...new Map(accountBalance[0].groups.map(g => [g.groupId, g])).values()]
    : []
  const groupCharts = groupIds.map(g => ({
    groupId: g.groupId,
    title: `${g.subAccountName} — ${g.groupName}`,
    data: accountBalance.map(m => ({
      name: `${MONTHS_DE[m.month - 1]} ${m.year !== now.getFullYear() ? m.year : ''}`.trim(),
      Saldo: m.groups.find(gg => gg.groupId === g.groupId)?.balance ?? 0,
    })),
  }))

  const chartData = monthlySummary.map((d: MonthlySummary) => ({
    name: `${MONTHS_DE[d.month - 1]} ${d.year !== now.getFullYear() ? d.year : ''}`.trim(),
    Einnahmen: d.income,
    Ausgaben: d.expenses,
    Ersparnis: Math.max(0, d.income - d.expenses),
  }))

  // Budget vs. Ist data — filter by selected account, negate for expenses
  const accountGroups = budgetData?.groups?.filter((g: BudgetGroup) => g.accountId === selectedAccountId) ?? []

  const budgetVsActualExpense = accountGroups.flatMap((g: BudgetGroup) =>
    g.categories
      .filter((c) => c.type === 'EXPENSE' && (c.budgeted !== 0 || c.activity !== 0))
      .map((c) => ({
        name: c.name,
        Budget: -c.budgeted,
        Vormonat: c.rolledOver,
        Ist: -c.activity,
      }))
  )

  const budgetVsActualIncome = accountGroups.flatMap((g: BudgetGroup) =>
    g.categories
      .filter((c) => c.type === 'INCOME' && (c.budgeted !== 0 || c.activity !== 0))
      .map((c) => ({
        name: c.name,
        Budget: c.budgeted,
        Vormonat: c.rolledOver,
        Ist: c.activity,
      }))
  )

  const totalIncome = monthlySummary.reduce((s: number, d: MonthlySummary) => s + d.income, 0) / (monthlySummary.length || 1)
  const totalExpenses = monthlySummary.reduce((s: number, d: MonthlySummary) => s + d.expenses, 0) / (monthlySummary.length || 1)

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Berichte</h1>

      <Tabs defaultValue="gesamtübersicht">
        <TabsList className="mb-6">
          <TabsTrigger value="gesamtübersicht">Gesamtübersicht</TabsTrigger>
          <TabsTrigger value="monat">Monatsübersicht</TabsTrigger>
          <TabsTrigger value="kategorien">Gruppenanalyse</TabsTrigger>
          <TabsTrigger value="budget">Budget vs. Ist</TabsTrigger>
        </TabsList>

        {/* Tab 2: Monatsübersicht — Saldenbericht pro Konto */}
        <TabsContent value="monat" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Monatsübersicht</h2>
            <AppSelect
              value={selectedAccountId ?? ''}
              onValueChange={setSelectedAccountId}
              options={budgetAccounts.map(a => ({ value: a.id, label: a.name }))}
              placeholder="Konto"
              className="w-48"
            />
          </div>

          {balanceChartData.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Keine Daten für dieses Konto
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Gesamtsaldo im Verlauf</CardTitle>
                </CardHeader>
                <CardContent>
                  <BalanceAreaChart data={balanceChartData} dataKey="Gesamt" stroke="#6366f1" id="gesamt" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Saldo Hauptkonto im Verlauf</CardTitle>
                </CardHeader>
                <CardContent>
                  <BalanceAreaChart data={balanceChartData} dataKey="Hauptkonto" stroke="#10b981" id="hauptkonto" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Saldo Unterkonten im Verlauf</CardTitle>
                </CardHeader>
                <CardContent>
                  <BalanceAreaChart data={balanceChartData} dataKey="Unterkonten" stroke="#f59e0b" id="unterkonten" />
                </CardContent>
              </Card>

              {groupCharts.map((gc) => (
                <Card key={gc.groupId}>
                  <CardHeader>
                    <CardTitle className="text-base">{gc.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <BalanceAreaChart data={gc.data} dataKey="Saldo" stroke="#6366f1" height={200} id={`grp-${gc.groupId}`} />
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </TabsContent>

        {/* Tab 1: Gesamtübersicht */}
        <TabsContent value="gesamtübersicht" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Ø Einnahmen</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-emerald-600">{fmt(totalIncome)}</p>
                <p className="text-xs text-muted-foreground">pro Monat (letztes Jahr)</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Ø Ausgaben</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-destructive">{fmt(totalExpenses)}</p>
                <p className="text-xs text-muted-foreground">pro Monat (letztes Jahr)</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Ø Ersparnis</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${totalIncome - totalExpenses >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                  {fmt(Math.max(0, totalIncome - totalExpenses))}
                </p>
                <p className="text-xs text-muted-foreground">pro Monat (letztes Jahr)</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Einnahmen vs. Ausgaben (letzte 12 Monate)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" className="text-xs" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={fmtCompact} className="text-xs" tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltipBar />} />
                  <Legend />
                  <Bar dataKey="Einnahmen" fill="#10b981" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Ausgaben" fill="#ef4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Monatliche Ersparnis</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltipBar />} />
                  <Line type="monotone" dataKey="Ersparnis" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Gruppenanalyse */}
        <TabsContent value="kategorien" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Gruppenanalyse</h2>
            <div className="flex gap-2 items-center">
              <AppSelect
                value={selectedAccountId ?? ''}
                onValueChange={setSelectedAccountId}
                options={budgetAccounts.map(a => ({ value: a.id, label: a.name }))}
                placeholder="Konto"
                className="w-48"
              />
              <MonthYearSelector
                year={selectedYear}
                month={selectedMonth}
                onChange={(y, m) => { setSelectedYear(y); setSelectedMonth(m) }}
              />
            </div>
          </div>

          {groupExpenses.length === 0 && groupIncome.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Keine Daten für diesen Monat
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Einnahmen */}
              {groupIncome.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Einnahmen — Verteilung</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie
                            data={groupIncome}
                            dataKey="amount"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={100}
                            innerRadius={50}
                            paddingAngle={2}
                          >
                            {groupIncome.map((entry: GroupSpending) => (
                              <Cell key={entry.groupId} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomTooltipPie />} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Einnahmen — Übersicht</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {groupIncome.map((group: GroupSpending) => {
                        const total = groupIncome.reduce((s: number, g: GroupSpending) => s + g.amount, 0)
                        const pct = total > 0 ? (group.amount / total) * 100 : 0
                        return (
                          <div key={group.groupId}>
                            <div className="flex items-center justify-between text-sm mb-1">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: group.color }} />
                                <span>{group.name}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-muted-foreground text-xs">{pct.toFixed(0)}%</span>
                                <span className="font-medium">{fmt(group.amount)}</span>
                              </div>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: group.color }} />
                            </div>
                          </div>
                        )
                      })}
                      <div className="border-t pt-2 flex justify-between text-sm font-semibold">
                        <span>Gesamt</span>
                        <span>{fmt(groupIncome.reduce((s: number, g: GroupSpending) => s + g.amount, 0))}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Ausgaben */}
              {groupExpenses.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Ausgaben — Verteilung</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie
                            data={groupExpenses}
                            dataKey="amount"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={100}
                            innerRadius={50}
                            paddingAngle={2}
                          >
                            {groupExpenses.map((entry: GroupSpending) => (
                              <Cell key={entry.groupId} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomTooltipPie />} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Ausgaben — Übersicht</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {groupExpenses.map((group: GroupSpending) => {
                        const total = groupExpenses.reduce((s: number, g: GroupSpending) => s + g.amount, 0)
                        const pct = total > 0 ? (group.amount / total) * 100 : 0
                        return (
                          <div key={group.groupId}>
                            <div className="flex items-center justify-between text-sm mb-1">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: group.color }} />
                                <span>{group.name}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-muted-foreground text-xs">{pct.toFixed(0)}%</span>
                                <span className="font-medium">{fmt(group.amount)}</span>
                              </div>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: group.color }} />
                            </div>
                          </div>
                        )
                      })}
                      <div className="border-t pt-2 flex justify-between text-sm font-semibold">
                        <span>Gesamt</span>
                        <span>{fmt(groupExpenses.reduce((s: number, g: GroupSpending) => s + g.amount, 0))}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* Tab 3: Budget vs. Ist */}
        <TabsContent value="budget" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Budget vs. Ist</h2>
            <div className="flex gap-2 items-center">
              <AppSelect
                value={selectedAccountId ?? ''}
                onValueChange={setSelectedAccountId}
                options={budgetAccounts.map(a => ({ value: a.id, label: a.name }))}
                placeholder="Konto"
                className="w-48"
              />
              <MonthYearSelector
                year={selectedYear}
                month={selectedMonth}
                onChange={(y, m) => { setSelectedYear(y); setSelectedMonth(m) }}
              />
            </div>
          </div>

          {budgetVsActualExpense.length === 0 && budgetVsActualIncome.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Keine Budgetdaten für diesen Monat
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Ausgaben */}
              {budgetVsActualExpense.length > 0 && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Ausgaben</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={Math.max(280, budgetVsActualExpense.length * 40)}>
                        <BarChart data={budgetVsActualExpense} layout="vertical" margin={{ top: 5, right: 10, left: 80, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={76} />
                          <Tooltip content={<CustomTooltipBar />} />
                          <Legend />
                          <Bar dataKey="Budget" stackId="budget" fill="#6366f1" />
                          <Bar dataKey="Vormonat" stackId="budget" fill="#a5b4fc" radius={[0, 3, 3, 0]} />
                          <Bar dataKey="Ist" fill="#f59e0b" radius={[0, 3, 3, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Ausgaben — Tabelle</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="text-left py-2">Kategorie</th>
                            <th className="text-right py-2">Budget</th>
                            <th className="text-right py-2">Vormonat</th>
                            <th className="text-right py-2">Ist</th>
                            <th className="text-right py-2">Differenz</th>
                          </tr>
                        </thead>
                        <tbody>
                          {budgetVsActualExpense.map((row: { name: string; Budget: number; Vormonat: number; Ist: number }) => {
                            const diff = row.Budget + row.Vormonat - row.Ist
                            return (
                              <tr key={row.name} className="border-b">
                                <td className="py-2">{row.name}</td>
                                <td className="text-right py-2">{fmt(row.Budget)}</td>
                                <td className="text-right py-2">{row.Vormonat !== 0 ? fmt(row.Vormonat) : '—'}</td>
                                <td className="text-right py-2">{fmt(row.Ist)}</td>
                                <td className={`text-right py-2 font-medium ${diff >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                                  {diff >= 0 ? '+' : ''}{fmt(diff)}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                </>
              )}

              {/* Einnahmen */}
              {budgetVsActualIncome.length > 0 && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Einnahmen</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={Math.max(200, budgetVsActualIncome.length * 40)}>
                        <BarChart data={budgetVsActualIncome} layout="vertical" margin={{ top: 5, right: 10, left: 80, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={76} />
                          <Tooltip content={<CustomTooltipBar />} />
                          <Legend />
                          <Bar dataKey="Budget" stackId="budget" fill="#6366f1" />
                          <Bar dataKey="Vormonat" stackId="budget" fill="#a5b4fc" radius={[0, 3, 3, 0]} />
                          <Bar dataKey="Ist" fill="#10b981" radius={[0, 3, 3, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Einnahmen — Tabelle</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="text-left py-2">Kategorie</th>
                            <th className="text-right py-2">Budget</th>
                            <th className="text-right py-2">Vormonat</th>
                            <th className="text-right py-2">Ist</th>
                            <th className="text-right py-2">Differenz</th>
                          </tr>
                        </thead>
                        <tbody>
                          {budgetVsActualIncome.map((row: { name: string; Budget: number; Vormonat: number; Ist: number }) => {
                            const diff = row.Ist - row.Budget - row.Vormonat
                            return (
                              <tr key={row.name} className="border-b">
                                <td className="py-2">{row.name}</td>
                                <td className="text-right py-2">{fmt(row.Budget)}</td>
                                <td className="text-right py-2">{row.Vormonat !== 0 ? fmt(row.Vormonat) : '—'}</td>
                                <td className="text-right py-2">{fmt(row.Ist)}</td>
                                <td className={`text-right py-2 font-medium ${diff >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                                  {diff >= 0 ? '+' : ''}{fmt(diff)}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                </>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
