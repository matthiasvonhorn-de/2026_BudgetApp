# Account Sort Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to manually reorder accounts; the order is persisted in the DB and respected everywhere accounts appear.

**Architecture:** Add `sortOrder` to the `Account` model; update the GET endpoint to sort by it; new PATCH `/api/accounts/reorder` endpoint; shared `useAccountReorder` hook; `SortableAccountCard` wrapper component; both the accounts overview and settings/general pages get a "Reihenfolge bearbeiten" mode powered by `@dnd-kit/sortable`.

**Tech Stack:** Prisma v7 + SQLite (manual SQL migration), Next.js App Router API routes, @dnd-kit/core + @dnd-kit/sortable (already installed), TanStack Query, Zod v4, shadcn/ui Button, lucide-react icons.

---

## File Map

| File | Action |
|------|--------|
| `prisma/schema.prisma` | Add `sortOrder Int @default(0)` to Account model |
| `prisma/dev.db` | Manual SQL migration |
| `src/app/api/accounts/route.ts` | Change `orderBy` from `name asc` to `[sortOrder asc, name asc]` |
| `src/app/api/accounts/reorder/route.ts` | New PATCH endpoint |
| `src/hooks/useAccountReorder.ts` | New shared hook |
| `src/components/accounts/SortableAccountCard.tsx` | New component wrapping AccountCard |
| `src/app/(app)/accounts/page.tsx` | Integrate sort mode (grid) |
| `src/app/(app)/settings/general/page.tsx` | Integrate sort mode (list) |

---

## Task 1: DB Schema + Migration + API Sort Order

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/app/api/accounts/route.ts`

- [ ] **Step 1: Add `sortOrder` to Account model in schema.prisma**

In `prisma/schema.prisma`, add `sortOrder` as the last field before the relations block of the `Account` model:

```prisma
model Account {
  id             String           @id @default(cuid())
  name           String
  iban           String?          @unique
  bank           String?
  type           AccountType      @default(CHECKING)
  color          String           @default("#6366f1")
  icon           String?
  currentBalance Float            @default(0)
  isActive       Boolean          @default(true)
  sortOrder      Int              @default(0)
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt

  transactions    Transaction[]
  reconciliations Reconciliation[]
  subAccounts     SubAccount[]
  categoryGroups  CategoryGroup[]
  loans           Loan[]
}
```

- [ ] **Step 2: Apply SQL migration**

```bash
sqlite3 prisma/dev.db "ALTER TABLE Account ADD COLUMN sortOrder INTEGER NOT NULL DEFAULT 0;"
sqlite3 prisma/dev.db "UPDATE Account SET sortOrder = rowid;"
```

Expected: no output (both commands succeed silently).

- [ ] **Step 3: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected output ends with: `✔ Generated Prisma Client`.

- [ ] **Step 4: Update GET /api/accounts to sort by sortOrder**

In `src/app/api/accounts/route.ts`, change the `orderBy` in `prisma.account.findMany`:

```ts
orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
```

Full updated `findMany` call (lines 17–23):

```ts
const accounts = await prisma.account.findMany({
  where: { isActive: true },
  include: {
    _count: { select: { transactions: true } },
  },
  orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
})
```

- [ ] **Step 5: Verify in browser**

Start the dev server (`npm run dev`) if not running. Open http://localhost:3000/accounts — accounts should still appear (order is unchanged since all `sortOrder` values reflect their DB rowid).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma src/app/api/accounts/route.ts
git commit -m "feat: add sortOrder to Account model and update GET sort order"
```

---

## Task 2: PATCH /api/accounts/reorder Endpoint

**Files:**
- Create: `src/app/api/accounts/reorder/route.ts`

- [ ] **Step 1: Create the reorder endpoint**

Create `src/app/api/accounts/reorder/route.ts` with this content:

```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const schema = z.object({
  ids: z.array(z.string()).min(1),
})

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { ids } = schema.parse(body)

    const count = await prisma.account.count({ where: { id: { in: ids } } })
    if (count !== ids.length) {
      return NextResponse.json({ error: 'Ungültige Konto-IDs' }, { status: 400 })
    }

    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.account.update({ where: { id }, data: { sortOrder: index } })
      )
    )

    return new NextResponse(null, { status: 200 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: 'Fehler beim Speichern der Reihenfolge' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify the endpoint responds correctly**

```bash
curl -s -X PATCH http://localhost:3000/api/accounts/reorder \
  -H "Content-Type: application/json" \
  -d '{"ids":["nonexistent"]}' | cat
```

Expected: `{"error":"Ungültige Konto-IDs"}` (400).

```bash
curl -s -X PATCH http://localhost:3000/api/accounts/reorder \
  -H "Content-Type: application/json" \
  -d '{"ids":[]}' | cat
```

Expected: JSON with Zod validation error (400).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/accounts/reorder/route.ts
git commit -m "feat: add PATCH /api/accounts/reorder endpoint"
```

---

## Task 3: useAccountReorder Hook

**Files:**
- Create: `src/hooks/useAccountReorder.ts`

- [ ] **Step 1: Create the hook**

Create `src/hooks/useAccountReorder.ts`:

```ts
'use client'

import { useState, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { arrayMove } from '@dnd-kit/sortable'
import type { DragEndEvent } from '@dnd-kit/core'
import { toast } from 'sonner'

interface Account {
  id: string
  [key: string]: unknown
}

export function useAccountReorder(accounts: Account[]) {
  const qc = useQueryClient()
  const [isReordering, setIsReordering] = useState(false)
  const [localAccounts, setLocalAccounts] = useState<Account[]>([])

  const startReorder = useCallback(() => {
    setLocalAccounts([...accounts])
    setIsReordering(true)
  }, [accounts])

  const cancelReorder = useCallback(() => {
    setIsReordering(false)
    setLocalAccounts([])
  }, [])

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) =>
      fetch('/api/accounts/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      }).then(r => {
        if (!r.ok) throw new Error('Fehler beim Speichern')
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      setIsReordering(false)
      setLocalAccounts([])
      toast.success('Reihenfolge gespeichert')
    },
    onError: () => {
      setLocalAccounts([...accounts])
      toast.error('Fehler beim Speichern der Reihenfolge')
    },
  })

  const saveReorder = useCallback(() => {
    reorderMutation.mutate(localAccounts.map(a => a.id))
  }, [localAccounts, reorderMutation])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setLocalAccounts(prev => {
      const oldIndex = prev.findIndex(a => a.id === active.id)
      const newIndex = prev.findIndex(a => a.id === over.id)
      return arrayMove(prev, oldIndex, newIndex)
    })
  }, [])

  return {
    isReordering,
    localAccounts: isReordering ? localAccounts : accounts,
    startReorder,
    cancelReorder,
    saveReorder,
    handleDragEnd,
    isSaving: reorderMutation.isPending,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useAccountReorder.ts
git commit -m "feat: add useAccountReorder hook"
```

---

## Task 4: SortableAccountCard Component

**Files:**
- Create: `src/components/accounts/SortableAccountCard.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/accounts/SortableAccountCard.tsx`:

```tsx
'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { AccountCard } from './AccountCard'

interface SortableAccountCardProps {
  account: {
    id: string
    name: string
    bank?: string | null
    type: string
    color: string
    currentBalance: number
    _count?: { transactions: number }
  }
  isReordering: boolean
}

export function SortableAccountCard({ account, isReordering }: SortableAccountCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: account.id,
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="relative"
    >
      {isReordering && (
        <>
          {/* Full-card drag overlay — blocks link navigation while reordering */}
          <div
            className="absolute inset-0 z-10 rounded-xl cursor-grab active:cursor-grabbing"
            {...attributes}
            {...listeners}
          />
          {/* Visual hint icon */}
          <div className="absolute top-2 right-2 z-20 pointer-events-none">
            <GripVertical className="h-4 w-4 text-muted-foreground/60" />
          </div>
        </>
      )}
      <AccountCard account={account} />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/accounts/SortableAccountCard.tsx
git commit -m "feat: add SortableAccountCard component"
```

---

## Task 5: Accounts Overview Page — Sort Mode

**Files:**
- Modify: `src/app/(app)/accounts/page.tsx`

- [ ] **Step 1: Replace accounts/page.tsx with sort-mode version**

Replace the entire content of `src/app/(app)/accounts/page.tsx`:

```tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { SortableAccountCard } from '@/components/accounts/SortableAccountCard'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import { useAccountReorder } from '@/hooks/useAccountReorder'
import { Button } from '@/components/ui/button'

export default function AccountsPage() {
  const fmt = useFormatCurrency()
  const sensors = useSensors(useSensor(PointerSensor))

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => fetch('/api/accounts').then(r => r.json()),
  })

  const { isReordering, localAccounts, startReorder, cancelReorder, saveReorder, handleDragEnd, isSaving } =
    useAccountReorder(accounts)

  const totalBalance = localAccounts.reduce((sum: number, a: any) => sum + a.currentBalance, 0)

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Konten</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gesamtvermögen: <span className="font-semibold text-foreground">{fmt(totalBalance)}</span>
          </p>
        </div>
        {!isLoading && accounts.length > 1 && (
          isReordering ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={cancelReorder} disabled={isSaving}>
                Abbrechen
              </Button>
              <Button size="sm" onClick={saveReorder} disabled={isSaving}>
                {isSaving ? 'Speichern...' : 'Speichern'}
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={startReorder}>
              Reihenfolge bearbeiten
            </Button>
          )
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <p className="text-lg font-medium">Noch keine Konten angelegt</p>
          <p className="text-sm mt-1">Konten können unter Einstellungen → Allgemein hinzugefügt werden.</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={localAccounts.map((a: any) => a.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {localAccounts.map((account: any) => (
                <SortableAccountCard key={account.id} account={account} isReordering={isReordering} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Open http://localhost:3000/accounts.
- With 1 account: no "Reihenfolge bearbeiten" button appears.
- With 2+ accounts: button appears top-right. Click it → cards show grip icon, "Speichern"/"Abbrechen" appear. Drag a card to a new position → order updates. Click "Speichern" → toast "Reihenfolge gespeichert", mode exits. Reload page → new order persists.

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/accounts/page.tsx
git commit -m "feat: add sort mode to accounts overview page"
```

---

## Task 6: Settings/General Page — Sort Mode

**Files:**
- Modify: `src/app/(app)/settings/general/page.tsx`

- [ ] **Step 1: Replace settings/general/page.tsx with sort-mode version**

Replace the entire content of `src/app/(app)/settings/general/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useSettingsStore, CURRENCY_PRESETS } from '@/store/useSettingsStore'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import { useAccountReorder } from '@/hooks/useAccountReorder'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, Plus, Pencil, Trash2, GripVertical } from 'lucide-react'
import { AccountFormDialog } from '@/components/accounts/AccountFormDialog'
import { ACCOUNT_TYPE_LABELS } from '@/lib/utils'

interface AccountRowProps {
  account: any
  isReordering: boolean
  fmt: (n: number) => string
  onEdit: () => void
  onDelete: () => void
}

function SortableAccountRow({ account, isReordering, fmt, onEdit, onDelete }: AccountRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: account.id,
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="flex items-center justify-between py-2 px-3 rounded-lg border bg-background"
    >
      <div className="flex items-center gap-3">
        {isReordering && (
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 -ml-1">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: account.color }} />
        <div>
          <p className="text-sm font-medium">{account.name}</p>
          <p className="text-xs text-muted-foreground">
            {ACCOUNT_TYPE_LABELS[account.type] ?? account.type}{account.bank ? ` · ${account.bank}` : ''}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className={`text-sm font-semibold tabular-nums ${account.currentBalance < 0 ? 'text-destructive' : ''}`}>
          {fmt(account.currentBalance)}
        </span>
        {!isReordering && (
          <>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

export default function GeneralSettingsPage() {
  const { currency, locale, setCurrencyPreset } = useSettingsStore()
  const fmt = useFormatCurrency()
  const qc = useQueryClient()
  const sensors = useSensors(useSensor(PointerSensor))
  const [accountDialog, setAccountDialog] = useState<{ open: boolean; account?: any }>({ open: false })

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => fetch('/api/accounts').then(r => r.json()),
  })

  const deleteAccount = useMutation({
    mutationFn: (id: string) => fetch(`/api/accounts/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts'] }); toast.success('Konto gelöscht') },
    onError: () => toast.error('Fehler beim Löschen'),
  })

  const { isReordering, localAccounts, startReorder, cancelReorder, saveReorder, handleDragEnd, isSaving } =
    useAccountReorder(accounts)

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Allgemein</h1>

      {/* Konten */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Konten</CardTitle>
            <div className="flex items-center gap-2">
              {accounts.length > 1 && (
                isReordering ? (
                  <>
                    <Button variant="outline" size="sm" onClick={cancelReorder} disabled={isSaving}>
                      Abbrechen
                    </Button>
                    <Button size="sm" onClick={saveReorder} disabled={isSaving}>
                      {isSaving ? 'Speichern...' : 'Speichern'}
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" onClick={startReorder}>
                    Reihenfolge bearbeiten
                  </Button>
                )
              )}
              {!isReordering && (
                <Button size="sm" onClick={() => setAccountDialog({ open: true })}>
                  <Plus className="h-4 w-4 mr-1" /> Konto hinzufügen
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Laden...</p>
          ) : accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Konten angelegt.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={localAccounts.map((a: any) => a.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {localAccounts.map((a: any) => (
                    <SortableAccountRow
                      key={a.id}
                      account={a}
                      isReordering={isReordering}
                      fmt={fmt}
                      onEdit={() => setAccountDialog({ open: true, account: a })}
                      onDelete={() => { if (confirm(`Konto "${a.name}" löschen?`)) deleteAccount.mutate(a.id) }}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      {/* Währung */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Währung & Zahlenformat</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {CURRENCY_PRESETS.map(preset => {
            const isActive = preset.currency === currency && preset.locale === locale
            return (
              <button
                key={`${preset.currency}-${preset.locale}`}
                onClick={() => setCurrencyPreset(preset.currency, preset.locale)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border text-sm transition-colors ${
                  isActive ? 'border-primary bg-primary/5 font-medium' : 'border-border hover:bg-muted'
                }`}
              >
                <span>{preset.label}</span>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground tabular-nums">
                    {new Intl.NumberFormat(preset.locale, { style: 'currency', currency: preset.currency }).format(1234.56)}
                  </span>
                  {isActive && <Check className="h-4 w-4 text-primary" />}
                </div>
              </button>
            )
          })}
          <p className="text-xs text-muted-foreground pt-2">
            Vorschau aktuell: <span className="font-semibold">{fmt(1234.56)}</span>
          </p>
        </CardContent>
      </Card>

      <AccountFormDialog
        open={accountDialog.open}
        onOpenChange={(open) => setAccountDialog({ open })}
        account={accountDialog.account}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Open http://localhost:3000/settings/general.
- With 2+ accounts: "Reihenfolge bearbeiten" button appears next to "Konto hinzufügen". Click it → "Konto hinzufügen" hides, edit/delete buttons hide, grip handles appear left of each row, "Speichern"/"Abbrechen" appear. Drag a row → order updates. Click "Speichern" → toast, mode exits. Reload → new order persists.

- [ ] **Step 3: Verify order is consistent across the app**

After reordering, open:
- http://localhost:3000/accounts — same order as saved
- http://localhost:3000/dashboard — same order
- Open a transaction form → account dropdown shows same order

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/settings/general/page.tsx
git commit -m "feat: add sort mode to settings/general accounts list"
```
