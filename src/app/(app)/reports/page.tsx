'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import { useSettingsStore } from '@/store/useSettingsStore'

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

function CustomTooltipBar({ active, payload, label }: any) {
  const fmt = useFormatCurrency()
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border rounded-lg p-3 shadow-md text-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  )
}

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

export default function ReportsPage() {
  const fmt = useFormatCurrency()
  const { locale, currency } = useSettingsStore()
  const fmtCompact = (v: number) => new Intl.NumberFormat(locale, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(v)
  const now = new Date()
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)

  const { data: monthlySummary = [] } = useQuery({
    queryKey: ['reports-monthly-summary'],
    queryFn: () => fetch('/api/reports/monthly-summary?months=12').then(r => r.json()),
  })

  const { data: categorySpending = [] } = useQuery({
    queryKey: ['reports-category-spending', selectedYear, selectedMonth],
    queryFn: () => fetch(`/api/reports/category-spending?year=${selectedYear}&month=${selectedMonth}`).then(r => r.json()),
  })

  const { data: budgetData } = useQuery({
    queryKey: ['budget', selectedYear, selectedMonth],
    queryFn: () => fetch(`/api/budget/${selectedYear}/${selectedMonth}`).then(r => r.json()),
  })

  const chartData = monthlySummary.map((d: any) => ({
    name: `${MONTHS_DE[d.month - 1]} ${d.year !== now.getFullYear() ? d.year : ''}`.trim(),
    Einnahmen: d.income,
    Ausgaben: d.expenses,
    Ersparnis: Math.max(0, d.income - d.expenses),
  }))

  // Budget vs. Ist data
  const budgetVsActual = budgetData?.groups?.flatMap((g: any) =>
    g.categories
      .filter((c: any) => c.type === 'EXPENSE' && (c.budgeted > 0 || Math.abs(c.activity) > 0))
      .map((c: any) => ({
        name: c.name,
        Budget: c.budgeted,
        Ist: Math.abs(c.activity),
      }))
  ) ?? []

  const totalIncome = monthlySummary.reduce((s: number, d: any) => s + d.income, 0) / (monthlySummary.length || 1)
  const totalExpenses = monthlySummary.reduce((s: number, d: any) => s + d.expenses, 0) / (monthlySummary.length || 1)

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Berichte</h1>

      <Tabs defaultValue="monatsübersicht">
        <TabsList className="mb-6">
          <TabsTrigger value="monatsübersicht">Monatsübersicht</TabsTrigger>
          <TabsTrigger value="kategorien">Kategorienanalyse</TabsTrigger>
          <TabsTrigger value="budget">Budget vs. Ist</TabsTrigger>
        </TabsList>

        {/* Tab 1: Monatsübersicht */}
        <TabsContent value="monatsübersicht" className="space-y-6">
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

        {/* Tab 2: Kategorienanalyse */}
        <TabsContent value="kategorien" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Ausgaben nach Kategorie</h2>
            <MonthYearSelector
              year={selectedYear}
              month={selectedMonth}
              onChange={(y, m) => { setSelectedYear(y); setSelectedMonth(m) }}
            />
          </div>

          {categorySpending.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Keine Ausgaben in diesem Monat
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Verteilung</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={categorySpending}
                        dataKey="amount"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        innerRadius={50}
                        paddingAngle={2}
                      >
                        {categorySpending.map((entry: any) => (
                          <Cell key={entry.categoryId} fill={entry.color} />
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
                  <CardTitle className="text-base">Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {categorySpending.map((cat: any) => {
                    const total = categorySpending.reduce((s: number, c: any) => s + c.amount, 0)
                    const pct = total > 0 ? (cat.amount / total) * 100 : 0
                    return (
                      <div key={cat.categoryId}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                            <span>{cat.name}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-muted-foreground text-xs">{pct.toFixed(0)}%</span>
                            <span className="font-medium">{fmt(cat.amount)}</span>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: cat.color }} />
                        </div>
                      </div>
                    )
                  })}
                  <div className="border-t pt-2 flex justify-between text-sm font-semibold">
                    <span>Gesamt</span>
                    <span>{fmt(categorySpending.reduce((s: number, c: any) => s + c.amount, 0))}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Tab 3: Budget vs. Ist */}
        <TabsContent value="budget" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Budget vs. tatsächliche Ausgaben</h2>
            <MonthYearSelector
              year={selectedYear}
              month={selectedMonth}
              onChange={(y, m) => { setSelectedYear(y); setSelectedMonth(m) }}
            />
          </div>

          {budgetVsActual.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Keine Budgetdaten für diesen Monat
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Budget vs. Ist</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={Math.max(280, budgetVsActual.length * 40)}>
                    <BarChart data={budgetVsActual} layout="vertical" margin={{ top: 5, right: 10, left: 80, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={76} />
                      <Tooltip content={<CustomTooltipBar />} />
                      <Legend />
                      <Bar dataKey="Budget" fill="#6366f1" radius={[0, 3, 3, 0]} />
                      <Bar dataKey="Ist" fill="#f59e0b" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Tabelle</CardTitle>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2">Kategorie</th>
                        <th className="text-right py-2">Budget</th>
                        <th className="text-right py-2">Ist</th>
                        <th className="text-right py-2">Differenz</th>
                      </tr>
                    </thead>
                    <tbody>
                      {budgetVsActual.map((row: any) => {
                        const diff = row.Budget - row.Ist
                        return (
                          <tr key={row.name} className="border-b">
                            <td className="py-2">{row.name}</td>
                            <td className="text-right py-2">{fmt(row.Budget)}</td>
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
        </TabsContent>
      </Tabs>
    </div>
  )
}
