'use client'

import { Fragment, type RefObject } from 'react'
import { ArrowRightToLine } from 'lucide-react'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import type { GroupData, CategoryData } from './types'
import { amountColor } from './utils'

export function BudgetTableBody({
  groups,
  dateStr,
  openingPlan,
  opening,
  budgetMonth,
  budgetYear,
  editingCell,
  editValue,
  inputRef,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onEditValueChange,
  onOpenActivity,
  onOpenBookDialog,
  onOpenConfig,
}: {
  groups: GroupData[]
  dateStr: string
  openingPlan: number
  opening: number
  budgetMonth: number
  budgetYear: number
  editingCell: string | null
  editValue: string
  inputRef: RefObject<HTMLInputElement | null>
  onStartEdit: (categoryId: string, current: number) => void
  onCommitEdit: (categoryId: string) => void
  onCancelEdit: () => void
  onEditValueChange: (value: string) => void
  onOpenActivity: (cat: CategoryData) => void
  onOpenBookDialog: (cat: CategoryData) => void
  onOpenConfig: () => void
}) {
  const fmt = useFormatCurrency()

  return (
    <tbody>
      {/* Saldoübertrag aus Vormonat */}
      <tr className="bg-slate-100 dark:bg-slate-800/50 font-semibold">
        <td className="px-3 py-1.5 border border-border text-xs text-muted-foreground">
          {`01.${String(budgetMonth).padStart(2, '0')}.${budgetYear}`}
        </td>
        <td className="px-3 py-1.5 border border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Saldoübertrag aus Vormonat
        </td>
        <td className={`px-3 py-1.5 border border-border text-right tabular-nums ${amountColor(openingPlan)}`}>
          {fmt(openingPlan)}
        </td>
        <td className={`px-3 py-1.5 border border-border text-right tabular-nums ${amountColor(opening)}`}>
          {fmt(opening)}
        </td>
        <td className={`px-3 py-1.5 border border-border text-right tabular-nums ${amountColor(opening - openingPlan)}`}>
          {fmt(opening - openingPlan)}
        </td>
        <td className="px-3 py-1.5 border border-border" />
      </tr>

      {/* Kategoriegruppen */}
      {groups.length === 0 ? (
        <tr>
          <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground text-sm">
            Keine Kategoriegruppen konfiguriert.{' '}
            <button
              onClick={onOpenConfig}
              className="text-primary hover:underline"
            >
              Gruppen zuweisen
            </button>
          </td>
        </tr>
      ) : (
        groups.map(group => {
          const groupBudgeted = group.categories.reduce((s, c) => s + c.budgeted, 0)
          const groupActivity = group.categories.reduce((s, c) => s + c.activity, 0)
          const groupAvailable = group.categories.reduce((s, c) => s + c.available, 0)

          return (
            <Fragment key={group.id}>
              {/* Gruppenzeile */}
              <tr className="bg-muted/30 border-t border-border">
                <td className="px-3 py-1.5 border border-border text-xs text-muted-foreground">{dateStr}</td>
                <td className="px-3 py-1.5 border border-border font-bold">{group.name}</td>
                <td className="px-3 py-1.5 border border-border text-right font-bold tabular-nums">
                  {groupBudgeted !== 0
                    ? <span className={amountColor(groupBudgeted)}>{fmt(groupBudgeted)}</span>
                    : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-1.5 border border-border text-right font-bold tabular-nums">
                  {groupActivity !== 0
                    ? <span className={amountColor(groupActivity)}>{fmt(groupActivity)}</span>
                    : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-1.5 border border-border text-right font-bold tabular-nums">
                  {groupAvailable !== 0
                    ? <span className={amountColor(groupAvailable)}>{fmt(groupAvailable)}</span>
                    : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-2 py-1.5 border border-border" />
              </tr>

              {/* Kategoriezeilen */}
              {group.categories.map(cat => (
                <tr key={cat.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-3 py-1.5 border border-border text-xs text-muted-foreground">{dateStr}</td>
                  <td className="px-3 py-1.5 border border-border">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                      <span>{cat.name}</span>
                      {cat.rolledOver !== 0 && (
                        <span className={`text-xs ${cat.rolledOver > 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                          ({fmt(cat.rolledOver)})
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Betr. geplant -- klickbar */}
                  <td className="px-3 py-1.5 border border-border text-right tabular-nums">
                    {editingCell === cat.id ? (
                      <input
                        ref={inputRef}
                        type="number"
                        step="0.01"
                        value={editValue}
                        onChange={e => onEditValueChange(e.target.value)}
                        onBlur={() => onCommitEdit(cat.id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') onCommitEdit(cat.id)
                          if (e.key === 'Escape') onCancelEdit()
                        }}
                        className="w-28 text-right border rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                      />
                    ) : (
                      <button
                        onClick={() => onStartEdit(cat.id, cat.budgeted)}
                        className="w-full text-right hover:bg-primary/10 rounded px-1 transition-colors"
                        title="Klicken zum Bearbeiten"
                      >
                        {cat.budgeted !== 0
                          ? <span className={amountColor(cat.budgeted)}>{fmt(cat.budgeted)}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </button>
                    )}
                  </td>

                  {/* Betrag (Ist) -- Doppelklick oeffnet Transaktionsdetails */}
                  <td
                    className={`px-3 py-1.5 border border-border text-right tabular-nums ${cat.activity !== 0 ? 'cursor-pointer select-none' : ''}`}
                    onDoubleClick={() => cat.activity !== 0 && onOpenActivity(cat)}
                    title={cat.activity !== 0 ? 'Doppelklick für Transaktionsdetails' : undefined}
                  >
                    {cat.activity !== 0
                      ? <span className={amountColor(cat.activity)}>{fmt(cat.activity)}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>

                  {/* Soll-Ist */}
                  <td className="px-3 py-1.5 border border-border text-right tabular-nums">
                    {cat.available !== 0
                      ? <span className={amountColor(cat.available)}>{fmt(cat.available)}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>

                  {/* Buchen-Button */}
                  <td className="px-1.5 py-1 border border-border text-center">
                    {cat.budgeted !== 0 && (
                      <button
                        onClick={() => onOpenBookDialog(cat)}
                        title="Planwert als Transaktion buchen"
                        className="text-muted-foreground hover:text-primary transition-colors p-0.5 rounded hover:bg-primary/10"
                      >
                        <ArrowRightToLine className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </Fragment>
          )
        })
      )}
    </tbody>
  )
}
