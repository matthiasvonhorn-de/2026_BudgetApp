'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Plus, Trash2, Pencil, Check, X, ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import { formatDate } from '@/lib/utils'

interface SubAccountEntry {
  id: string
  date: string
  description: string
  amount: number
  fromBudget: boolean
}

interface SubAccountGroup {
  id: string
  name: string
  initialBalance: number
  entries: SubAccountEntry[]
}

interface SubAccount {
  id: string
  name: string
  color: string
  initialBalance: number
  groups: SubAccountGroup[]
}

function groupBalance(group: SubAccountGroup) {
  return group.initialBalance + group.entries.reduce((sum, e) => sum + e.amount, 0)
}

function subAccountBalance(sub: SubAccount) {
  return sub.initialBalance + sub.groups.reduce((sum, g) => sum + groupBalance(g), 0)
}

// ---- Inline text editor ----
function InlineEdit({
  value,
  onSave,
  onCancel,
}: {
  value: string
  onSave: (v: string) => void
  onCancel: () => void
}) {
  const [val, setVal] = useState(value)
  return (
    <span className="flex items-center gap-1">
      <input
        autoFocus
        className="border rounded px-1 py-0.5 text-sm w-36"
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') onSave(val)
          if (e.key === 'Escape') onCancel()
        }}
      />
      <button onClick={() => onSave(val)} className="text-emerald-600 hover:text-emerald-700"><Check className="h-3.5 w-3.5" /></button>
      <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
    </span>
  )
}

// ---- New entry row ----
function NewEntryRow({ groupId, accountId, onDone }: { groupId: string; accountId: string; onDone: () => void }) {
  const qc = useQueryClient()
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [fromBudget, setFromBudget] = useState(false)

  const mutation = useMutation({
    mutationFn: () =>
      fetch(`/api/sub-account-groups/${groupId}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, description, amount: parseFloat(amount), fromBudget }),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-accounts', accountId] })
      onDone()
    },
  })

  const valid = description.trim() && amount && !isNaN(parseFloat(amount))

  return (
    <tr className="bg-muted/30">
      <td className="px-2 py-1">
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="border rounded px-1 py-0.5 text-xs w-28" />
      </td>
      <td className="px-2 py-1">
        <input placeholder="Beschreibung" value={description} onChange={e => setDescription(e.target.value)}
          className="border rounded px-1 py-0.5 text-xs w-48" />
      </td>
      <td className="px-2 py-1 text-right">
        <input type="number" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)}
          className="border rounded px-1 py-0.5 text-xs w-24 text-right" />
      </td>
      <td className="px-2 py-1 text-center">
        <label className="flex items-center gap-1 justify-center text-xs">
          <input type="checkbox" checked={fromBudget} onChange={e => setFromBudget(e.target.checked)} />
          Budget
        </label>
      </td>
      <td className="px-2 py-1">
        <div className="flex gap-1">
          <Button size="sm" variant="default" disabled={!valid} onClick={() => mutation.mutate()}>
            <Check className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </td>
    </tr>
  )
}

// ---- Group table ----
function GroupSection({
  group,
  accountId,
  subColor,
}: {
  group: SubAccountGroup
  accountId: string
  subColor: string
}) {
  const qc = useQueryClient()
  const fmt = useFormatCurrency()
  const [expanded, setExpanded] = useState(true)
  const [addingEntry, setAddingEntry] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(group.name)
  const [editBalance, setEditBalance] = useState(String(group.initialBalance))

  const updateGroup = useMutation({
    mutationFn: (data: { name: string; initialBalance: number }) =>
      fetch(`/api/sub-account-groups/${group.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sub-accounts', accountId] }),
  })

  function startEdit() {
    setEditName(group.name)
    setEditBalance(String(group.initialBalance))
    setEditing(true)
  }

  function saveEdit() {
    updateGroup.mutate({ name: editName.trim() || group.name, initialBalance: parseFloat(editBalance) || 0 })
    setEditing(false)
  }

  const deleteGroup = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/sub-account-groups/${group.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sub-accounts', accountId] }),
    onError: () => toast.error('Fehler beim Löschen der Gruppe'),
  })

  const deleteEntry = useMutation({
    mutationFn: async (entryId: string) => {
      const res = await fetch(`/api/sub-account-entries/${entryId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sub-accounts', accountId] }),
    onError: () => toast.error('Fehler beim Löschen des Eintrags'),
  })

  const balance = groupBalance(group)

  return (
    <tbody>
      {/* Group header row */}
      <tr className="border-t" style={{ borderColor: subColor + '40' }}>
        {editing ? (
          <td colSpan={6} className="px-2 py-1">
            <div className="flex items-center gap-2 flex-wrap">
              <input
                autoFocus
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false) }}
                className="border rounded px-1 py-0.5 text-sm w-36"
              />
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                Initialwert
                <input
                  type="number"
                  step="0.01"
                  value={editBalance}
                  onChange={e => setEditBalance(e.target.value)}
                  className="border rounded px-1 py-0.5 text-sm w-24 text-right"
                />
              </label>
              <button onClick={saveEdit} className="text-emerald-600 hover:text-emerald-700"><Check className="h-3.5 w-3.5" /></button>
              <button onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
            </div>
          </td>
        ) : (
          <>
            <td colSpan={4} className="px-2 py-1">
              <div className="flex items-center gap-2">
                <button onClick={() => setExpanded(v => !v)} className="text-muted-foreground">
                  {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
                <span className="font-semibold text-sm">{group.name}</span>
                {group.initialBalance !== 0 && (
                  <span className="text-xs text-muted-foreground">(Anfang: {fmt(group.initialBalance)})</span>
                )}
              </div>
            </td>
            <td className="px-2 py-1 text-right font-semibold text-sm">
              <span className={balance < 0 ? 'text-destructive' : 'text-emerald-600'}>{fmt(balance)}</span>
            </td>
            <td className="px-2 py-1">
              <div className="flex gap-1 justify-end">
                <button onClick={startEdit} className="text-muted-foreground hover:text-foreground">
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={() => { if (confirm(`Gruppe "${group.name}" löschen?`)) deleteGroup.mutate() }}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </td>
          </>
        )}
      </tr>

      {/* Entry rows */}
      {expanded && group.entries.map(entry => (
        <tr key={entry.id} className="hover:bg-muted/30">
          <td className="px-2 py-1 text-xs text-muted-foreground pl-8">{formatDate(entry.date)}</td>
          <td className="px-2 py-1 text-xs">
            {entry.description}
            {entry.fromBudget && (
              <span className="ml-1 text-xs px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">Budget</span>
            )}
          </td>
          <td className="px-2 py-1 text-right text-xs font-medium">
            <span className={entry.amount < 0 ? 'text-destructive' : 'text-emerald-600'}>{fmt(entry.amount)}</span>
          </td>
          <td />
          <td className="px-2 py-1">
            <button
              onClick={() => { if (confirm('Eintrag löschen?')) deleteEntry.mutate(entry.id) }}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </td>
        </tr>
      ))}

      {/* Add entry row */}
      {expanded && (
        addingEntry
          ? <NewEntryRow groupId={group.id} accountId={accountId} onDone={() => setAddingEntry(false)} />
          : (
            <tr>
              <td colSpan={5} className="px-2 py-1 pl-8">
                <button
                  onClick={() => setAddingEntry(true)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Eintrag hinzufügen
                </button>
              </td>
            </tr>
          )
      )}
    </tbody>
  )
}

// ---- Sub-account panel ----
function SubAccountPanel({ sub, accountId }: { sub: SubAccount; accountId: string }) {
  const qc = useQueryClient()
  const fmt = useFormatCurrency()
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(sub.name)
  const [editColor, setEditColor] = useState(sub.color)
  const [editBalance, setEditBalance] = useState(String(sub.initialBalance))
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupBalance, setNewGroupBalance] = useState('')

  const balance = subAccountBalance(sub)

  const updateSub = useMutation({
    mutationFn: (data: { name: string; color: string; initialBalance: number }) =>
      fetch(`/api/sub-accounts/${sub.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sub-accounts', accountId] }),
  })

  function startEdit() {
    setEditName(sub.name)
    setEditColor(sub.color)
    setEditBalance(String(sub.initialBalance))
    setEditing(true)
  }

  function saveEdit() {
    const initialBalance = parseFloat(editBalance) || 0
    updateSub.mutate({ name: editName.trim() || sub.name, color: editColor, initialBalance })
    setEditing(false)
  }

  const deleteSub = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/sub-accounts/${sub.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sub-accounts', accountId] }),
    onError: () => toast.error('Fehler beim Löschen des Unterkontos'),
  })

  const addGroup = useMutation({
    mutationFn: () =>
      fetch(`/api/sub-accounts/${sub.id}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newGroupName.trim(), initialBalance: parseFloat(newGroupBalance) || 0 }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-accounts', accountId] })
      setNewGroupName('')
      setNewGroupBalance('')
      setAddingGroup(false)
    },
  })

  return (
    <div className="mb-6 rounded-xl border overflow-hidden">
      {/* Sub-account header */}
      <div style={{ backgroundColor: editing ? editColor + '20' : sub.color + '20', borderBottom: `2px solid ${editing ? editColor : sub.color}` }}>
        {editing ? (
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
            <input
              autoFocus
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false) }}
              className="border rounded px-2 py-1 text-sm w-40"
              placeholder="Name"
            />
            <input type="color" value={editColor} onChange={e => setEditColor(e.target.value)} className="h-8 w-9 rounded border cursor-pointer" />
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              Anfangssaldo
              <input
                type="number"
                step="0.01"
                value={editBalance}
                onChange={e => setEditBalance(e.target.value)}
                className="border rounded px-2 py-1 text-sm w-28 text-right"
              />
            </label>
            <Button size="sm" onClick={saveEdit}><Check className="h-3 w-3" /></Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}><X className="h-3 w-3" /></Button>
          </div>
        ) : (
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: sub.color }} />
              <span className="font-bold text-sm">{sub.name}</span>
              {sub.initialBalance !== 0 && (
                <span className="text-xs text-muted-foreground">(Anfang: {fmt(sub.initialBalance)})</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className={`font-bold text-sm ${balance < 0 ? 'text-destructive' : 'text-emerald-600'}`}>{fmt(balance)}</span>
              <button onClick={startEdit} className="text-muted-foreground hover:text-foreground">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => { if (confirm(`Unterkonto "${sub.name}" löschen?`)) deleteSub.mutate() }}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Groups table */}
      <table className="w-full text-sm border-collapse">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-2 py-1.5 text-xs font-medium w-28">Datum</th>
            <th className="text-left px-2 py-1.5 text-xs font-medium">Beschreibung</th>
            <th className="text-right px-2 py-1.5 text-xs font-medium w-28">Betrag</th>
            <th className="w-20" />
            <th className="w-16" />
          </tr>
        </thead>
        {sub.groups.map(g => (
          <GroupSection key={g.id} group={g} accountId={accountId} subColor={sub.color} />
        ))}
        <tbody>
          <tr>
            <td colSpan={5} className="px-4 py-2">
              {addingGroup ? (
                <span className="flex flex-wrap items-center gap-2">
                  <input
                    autoFocus
                    placeholder="Gruppenname"
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newGroupName.trim()) addGroup.mutate()
                      if (e.key === 'Escape') setAddingGroup(false)
                    }}
                    className="border rounded px-2 py-1 text-sm w-40"
                  />
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    Initialwert
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0,00"
                      value={newGroupBalance}
                      onChange={e => setNewGroupBalance(e.target.value)}
                      className="border rounded px-1 py-0.5 text-sm w-24 text-right"
                    />
                  </label>
                  <Button size="sm" disabled={!newGroupName.trim()} onClick={() => addGroup.mutate()}>
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAddingGroup(false)}>
                    <X className="h-3 w-3" />
                  </Button>
                </span>
              ) : (
                <button
                  onClick={() => setAddingGroup(true)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Gruppe hinzufügen
                </button>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ---- Main exported component ----
export function SubAccountsSection({ accountId }: { accountId: string }) {
  const qc = useQueryClient()
  const fmt = useFormatCurrency()
  const [addingSubAccount, setAddingSubAccount] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#6366f1')
  const [newBalance, setNewBalance] = useState('')

  const { data: subAccounts = [], isLoading } = useQuery<SubAccount[]>({
    queryKey: ['sub-accounts', accountId],
    queryFn: () => fetch(`/api/accounts/${accountId}/sub-accounts`).then(r => r.json()),
  })

  const createSub = useMutation({
    mutationFn: () =>
      fetch(`/api/accounts/${accountId}/sub-accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), color: newColor, initialBalance: parseFloat(newBalance) || 0 }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-accounts', accountId] })
      setNewName('')
      setNewColor('#6366f1')
      setNewBalance('')
      setAddingSubAccount(false)
    },
  })

  const totalBalance = subAccounts.reduce((sum, s) => sum + subAccountBalance(s), 0)

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Laden...</div>

  return (
    <div>
      {/* Summary bar */}
      {subAccounts.length > 0 && (
        <div className="mb-4 p-3 rounded-lg border bg-muted/30 flex flex-wrap gap-4 items-center text-sm">
          {subAccounts.map(s => {
            const bal = subAccountBalance(s)
            return (
              <span key={s.id} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="font-medium">{s.name}</span>
                <span className={bal < 0 ? 'text-destructive' : 'text-emerald-600'}>{fmt(bal)}</span>
              </span>
            )
          })}
          <span className="ml-auto font-bold">
            Gesamt: <span className={totalBalance < 0 ? 'text-destructive' : 'text-emerald-600'}>{fmt(totalBalance)}</span>
          </span>
        </div>
      )}

      {/* Sub-account panels */}
      {subAccounts.map(s => (
        <SubAccountPanel key={s.id} sub={s} accountId={accountId} />
      ))}

      {/* Add sub-account */}
      {addingSubAccount ? (
        <div className="flex flex-wrap items-center gap-2 p-3 border rounded-lg">
          <input
            autoFocus
            placeholder="Name des Unterkontos"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && newName.trim()) createSub.mutate()
              if (e.key === 'Escape') setAddingSubAccount(false)
            }}
            className="border rounded px-2 py-1 text-sm w-48"
          />
          <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} className="h-8 w-10 rounded border cursor-pointer" />
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            Anfangssaldo
            <input
              type="number"
              step="0.01"
              placeholder="0,00"
              value={newBalance}
              onChange={e => setNewBalance(e.target.value)}
              className="border rounded px-2 py-1 text-sm w-28 text-right"
            />
          </label>
          <Button size="sm" disabled={!newName.trim()} onClick={() => createSub.mutate()}>
            <Check className="h-3 w-3 mr-1" /> Erstellen
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAddingSubAccount(false)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setAddingSubAccount(true)}>
          <Plus className="h-4 w-4 mr-2" /> Unterkonto hinzufügen
        </Button>
      )}
    </div>
  )
}
