# Aktiendepots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add stock portfolio tracking with value history, sparkline cards, time-filtered charts, and net-worth integration.

**Architecture:** Standalone `Portfolio` + `PortfolioValue` models (no relation to accounts/transactions). CRUD API routes with Zod validation. Three UI pages (list, detail, settings). Net-worth report includes portfolio values as assets.

**Tech Stack:** Next.js 14 App Router, Prisma v7 + SQLite, TanStack Query, Recharts (LineChart), shadcn/ui, Zod

**Spec:** `docs/superpowers/specs/2026-04-05-aktiendepots-design.md`

**Conventions to follow:**
- Select dropdowns: Use `<AppSelect>` from `@/components/ui/app-select` or raw `<Select>` with `items` prop for label resolution
- Currency: Use `useFormatCurrency()` hook
- Balance updates: Use `roundCents()` from `@/lib/money` for all monetary writes
- API routes: Wrap with `withHandler` from `@/lib/api/handler`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `prisma/schema.prisma` | Modify | Add Portfolio + PortfolioValue models |
| `prisma/migrations/20260405_portfolios.sql` | Create | SQL migration for new tables |
| `src/types/api.ts` | Modify | Add Portfolio interfaces |
| `src/app/api/portfolios/route.ts` | Create | GET list + POST create |
| `src/app/api/portfolios/[id]/route.ts` | Create | GET detail + PUT update + DELETE |
| `src/app/api/portfolios/[id]/values/route.ts` | Create | POST new value |
| `src/app/api/portfolios/[id]/values/[valueId]/route.ts` | Create | PUT update + DELETE value |
| `src/components/portfolios/PortfolioDialog.tsx` | Create | Create/edit dialog |
| `src/app/(app)/portfolios/page.tsx` | Create | List page with sparkline cards |
| `src/app/(app)/portfolios/[id]/page.tsx` | Create | Detail page with chart + value table |
| `src/app/(app)/settings/portfolios/page.tsx` | Create | Settings page for portfolio management |
| `src/components/layout/Sidebar.tsx` | Modify | Add navigation item |
| `src/app/(app)/settings/page.tsx` | Modify | Add settings card |
| `src/app/api/reports/net-worth/route.ts` | Modify | Include portfolio values in totalAssets |

---

## Task 1: Schema + Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260405_portfolios.sql`

- [ ] **Step 1: Add Portfolio and PortfolioValue models to schema**

Add at the end of `prisma/schema.prisma` (before the closing):

```prisma
model Portfolio {
  id        String   @id @default(cuid())
  name      String
  color     String   @default("#6366f1")
  notes     String?
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  values PortfolioValue[]
}

model PortfolioValue {
  id          String   @id @default(cuid())
  portfolioId String
  date        DateTime
  value       Float
  notes       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  portfolio Portfolio @relation(fields: [portfolioId], references: [id], onDelete: Cascade)

  @@unique([portfolioId, date])
  @@index([portfolioId])
}
```

- [ ] **Step 2: Create SQL migration file**

Create `prisma/migrations/20260405_portfolios.sql`:

```sql
CREATE TABLE "Portfolio" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#6366f1',
  "notes" TEXT,
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "PortfolioValue" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "portfolioId" TEXT NOT NULL,
  "date" DATETIME NOT NULL,
  "value" REAL NOT NULL,
  "notes" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PortfolioValue_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PortfolioValue_portfolioId_date_key" ON "PortfolioValue" ("portfolioId", "date");
CREATE INDEX "PortfolioValue_portfolioId_idx" ON "PortfolioValue" ("portfolioId");
```

- [ ] **Step 3: Apply migration and regenerate client**

```bash
sqlite3 prisma/dev.db < prisma/migrations/20260405_portfolios.sql
npx prisma generate
```

- [ ] **Step 4: Verify build**

Run: `node node_modules/typescript/bin/tsc --noEmit 2>&1 | grep -v "03-laufzeit" | head -10`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260405_portfolios.sql
git commit -m "feat: add Portfolio and PortfolioValue schema + migration"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `src/types/api.ts`

- [ ] **Step 1: Add Portfolio interfaces**

Add after the `// ── Reports` section in `src/types/api.ts`:

```typescript
// ── Portfolio ───────────────────────────────────────────────────────

export interface Portfolio {
  id: string
  name: string
  color: string
  notes: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface PortfolioListItem extends Portfolio {
  currentValue: number | null
  sparklineData: { date: string; value: number }[]
}

export interface PortfolioDetail extends Portfolio {
  values: PortfolioValueEntry[]
}

export interface PortfolioValueEntry {
  id: string
  date: string
  value: number
  notes: string | null
}
```

- [ ] **Step 2: Update NetWorth interface**

Find the `NetWorth` interface and add `totalPortfolios`:

```typescript
export interface NetWorth {
  totalAssets: number
  totalDebts: number
  totalPortfolios: number
  netWorth: number
}
```

- [ ] **Step 3: Verify build**

Run: `node node_modules/typescript/bin/tsc --noEmit 2>&1 | grep -v "03-laufzeit" | head -10`

- [ ] **Step 4: Commit**

```bash
git add src/types/api.ts
git commit -m "feat: add Portfolio TypeScript interfaces"
```

---

## Task 3: Portfolio CRUD API

**Files:**
- Create: `src/app/api/portfolios/route.ts`
- Create: `src/app/api/portfolios/[id]/route.ts`

- [ ] **Step 1: Create list + create endpoint**

Create `src/app/api/portfolios/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'

export const GET = withHandler(async () => {
  const portfolios = await prisma.portfolio.findMany({
    where: { isActive: true },
    include: {
      values: {
        orderBy: { date: 'desc' },
        take: 30,
        select: { date: true, value: true },
      },
    },
    orderBy: { name: 'asc' },
  })

  const result = portfolios.map(p => {
    const currentValue = p.values.length > 0 ? p.values[0].value : null
    const sparklineData = [...p.values].reverse().map(v => ({
      date: v.date.toISOString(),
      value: v.value,
    }))
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      notes: p.notes,
      isActive: p.isActive,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      currentValue,
      sparklineData,
    }
  })

  return NextResponse.json(result)
})

const createSchema = z.object({
  name: z.string().min(1),
  color: z.string().default('#6366f1'),
  notes: z.string().optional().nullable(),
})

export const POST = withHandler(async (request: Request) => {
  const body = await request.json()
  const data = createSchema.parse(body)

  const portfolio = await prisma.portfolio.create({ data })
  return NextResponse.json(portfolio, { status: 201 })
})
```

- [ ] **Step 2: Create detail + update + delete endpoint**

Create `src/app/api/portfolios/[id]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'
import { DomainError } from '@/lib/api/errors'

export const GET = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params

  const portfolio = await prisma.portfolio.findUnique({
    where: { id },
    include: {
      values: {
        orderBy: { date: 'desc' },
        select: { id: true, date: true, value: true, notes: true },
      },
    },
  })
  if (!portfolio) throw new DomainError('Depot nicht gefunden', 404)

  return NextResponse.json(portfolio)
})

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
})

export const PUT = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const body = await request.json()
  const data = updateSchema.parse(body)

  const portfolio = await prisma.portfolio.update({ where: { id }, data })
  return NextResponse.json(portfolio)
})

export const DELETE = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  await prisma.portfolio.delete({ where: { id } })
  return NextResponse.json({ success: true })
})
```

- [ ] **Step 3: Verify build**

Run: `node node_modules/typescript/bin/tsc --noEmit 2>&1 | grep -v "03-laufzeit" | head -10`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/portfolios/route.ts src/app/api/portfolios/\[id\]/route.ts
git commit -m "feat: add Portfolio CRUD API endpoints"
```

---

## Task 4: PortfolioValue API

**Files:**
- Create: `src/app/api/portfolios/[id]/values/route.ts`
- Create: `src/app/api/portfolios/[id]/values/[valueId]/route.ts`

- [ ] **Step 1: Create value POST endpoint**

Create `src/app/api/portfolios/[id]/values/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'
import { DomainError } from '@/lib/api/errors'
import { roundCents } from '@/lib/money'

const createValueSchema = z.object({
  date: z.string(),
  value: z.coerce.number(),
  notes: z.string().optional().nullable(),
})

export const POST = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const body = await request.json()
  const data = createValueSchema.parse(body)

  const parsedDate = new Date(data.date)
  if (parsedDate > new Date()) {
    throw new DomainError('Datum darf nicht in der Zukunft liegen', 400)
  }

  const existing = await prisma.portfolioValue.findUnique({
    where: { portfolioId_date: { portfolioId: id, date: parsedDate } },
  })
  if (existing) {
    throw new DomainError('Für dieses Datum existiert bereits ein Wertstand', 409)
  }

  const entry = await prisma.portfolioValue.create({
    data: {
      portfolioId: id,
      date: parsedDate,
      value: roundCents(data.value),
      notes: data.notes ?? null,
    },
  })

  return NextResponse.json(entry, { status: 201 })
})
```

- [ ] **Step 2: Create value PUT + DELETE endpoint**

Create `src/app/api/portfolios/[id]/values/[valueId]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'
import { DomainError } from '@/lib/api/errors'
import { roundCents } from '@/lib/money'

const updateValueSchema = z.object({
  date: z.string().optional(),
  value: z.coerce.number().optional(),
  notes: z.string().optional().nullable(),
})

export const PUT = withHandler(async (request: Request, ctx) => {
  const { valueId } = await (ctx as { params: Promise<{ id: string; valueId: string }> }).params
  const body = await request.json()
  const data = updateValueSchema.parse(body)

  if (data.date) {
    const parsedDate = new Date(data.date)
    if (parsedDate > new Date()) {
      throw new DomainError('Datum darf nicht in der Zukunft liegen', 400)
    }
  }

  const entry = await prisma.portfolioValue.update({
    where: { id: valueId },
    data: {
      ...(data.date && { date: new Date(data.date) }),
      ...(data.value !== undefined && { value: roundCents(data.value) }),
      ...(data.notes !== undefined && { notes: data.notes }),
    },
  })

  return NextResponse.json(entry)
})

export const DELETE = withHandler(async (_, ctx) => {
  const { valueId } = await (ctx as { params: Promise<{ id: string; valueId: string }> }).params
  await prisma.portfolioValue.delete({ where: { id: valueId } })
  return NextResponse.json({ success: true })
})
```

- [ ] **Step 3: Verify build**

Run: `node node_modules/typescript/bin/tsc --noEmit 2>&1 | grep -v "03-laufzeit" | head -10`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/portfolios/\[id\]/values/route.ts src/app/api/portfolios/\[id\]/values/\[valueId\]/route.ts
git commit -m "feat: add PortfolioValue API endpoints (create, update, delete)"
```

---

## Task 5: Portfolio Dialog Component

**Files:**
- Create: `src/components/portfolios/PortfolioDialog.tsx`

- [ ] **Step 1: Create the dialog component**

Create `src/components/portfolios/PortfolioDialog.tsx`:

```typescript
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import type { Portfolio } from '@/types/api'

const schema = z.object({
  name: z.string().min(1, 'Name erforderlich'),
  color: z.string(),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  editPortfolio?: Portfolio | null
}

export function PortfolioDialog({ open, onOpenChange, editPortfolio }: Props) {
  const queryClient = useQueryClient()

  const form = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: { name: '', color: '#6366f1', notes: '' },
  })

  // Prefill when editing
  const { reset } = form
  if (open && editPortfolio && form.getValues('name') !== editPortfolio.name) {
    reset({
      name: editPortfolio.name,
      color: editPortfolio.color,
      notes: editPortfolio.notes ?? '',
    })
  }

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const res = await fetch('/api/portfolios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (!res.ok) throw new Error('Fehler')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] })
      toast.success('Depot erstellt')
      handleClose()
    },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  const updateMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const res = await fetch(`/api/portfolios/${editPortfolio!.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (!res.ok) throw new Error('Fehler')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] })
      toast.success('Depot aktualisiert')
      handleClose()
    },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  const mutation = editPortfolio ? updateMutation : createMutation

  function handleClose() {
    onOpenChange(false)
    form.reset({ name: '', color: '#6366f1', notes: '' })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editPortfolio ? 'Depot bearbeiten' : 'Neues Depot'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(v => mutation.mutate(v))} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Name *</FormLabel>
                <FormControl><Input placeholder="z.B. Trade Republic" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="color" render={({ field }) => (
              <FormItem>
                <FormLabel>Farbe</FormLabel>
                <FormControl>
                  <Input type="color" {...field} className="h-10 w-16 p-1 cursor-pointer" />
                </FormControl>
              </FormItem>
            )} />

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Notizen</FormLabel>
                <FormControl><Input placeholder="optional" {...field} /></FormControl>
              </FormItem>
            )} />

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
```

- [ ] **Step 2: Verify build**

Run: `node node_modules/typescript/bin/tsc --noEmit 2>&1 | grep -v "03-laufzeit" | head -10`

- [ ] **Step 3: Commit**

```bash
git add src/components/portfolios/PortfolioDialog.tsx
git commit -m "feat: add PortfolioDialog component for create/edit"
```

---

## Task 6: Portfolio List Page

**Files:**
- Create: `src/app/(app)/portfolios/page.tsx`

- [ ] **Step 1: Create the list page with sparkline cards**

Create `src/app/(app)/portfolios/page.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import { PortfolioDialog } from '@/components/portfolios/PortfolioDialog'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import type { PortfolioListItem } from '@/types/api'

export default function PortfoliosPage() {
  const fmt = useFormatCurrency()
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: portfolios = [], isLoading } = useQuery<PortfolioListItem[]>({
    queryKey: ['portfolios'],
    queryFn: () => fetch('/api/portfolios').then(r => r.json()),
  })

  const totalValue = portfolios.reduce((sum, p) => sum + (p.currentValue ?? 0), 0)

  if (isLoading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Aktiendepots</h1>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-32 rounded-xl border bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Aktiendepots</h1>
          {portfolios.length > 0 && (
            <p className="text-muted-foreground text-sm mt-1">
              Gesamtwert: <span className="font-semibold text-foreground">{fmt(totalValue)}</span>
            </p>
          )}
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Neues Depot
        </Button>
      </div>

      {portfolios.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Noch keine Depots angelegt.</p>
          <Button variant="link" onClick={() => setDialogOpen(true)} className="mt-2">
            Erstes Depot erstellen
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {portfolios.map(p => (
            <Link key={p.id} href={`/portfolios/${p.id}`}>
              <div className="rounded-xl border bg-card p-4 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="font-semibold">{p.name}</span>
                  </div>
                  <span className="font-bold text-lg">
                    {p.currentValue != null ? fmt(p.currentValue) : '—'}
                  </span>
                </div>
                {p.sparklineData.length > 1 && (
                  <div className="h-12 mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={p.sparklineData}>
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke={p.color}
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      <PortfolioDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `node node_modules/typescript/bin/tsc --noEmit 2>&1 | grep -v "03-laufzeit" | head -10`

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/portfolios/page.tsx
git commit -m "feat: add portfolio list page with sparkline cards"
```

---

## Task 7: Portfolio Detail Page

**Files:**
- Create: `src/app/(app)/portfolios/[id]/page.tsx`

- [ ] **Step 1: Create detail page with chart and value table**

Create `src/app/(app)/portfolios/[id]/page.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import { formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import { roundCents } from '@/lib/money'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { PortfolioDetail, PortfolioValueEntry } from '@/types/api'

const TIME_FILTERS = [
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '1J', months: 12 },
  { label: 'Gesamt', months: 0 },
] as const

export default function PortfolioDetailPage() {
  const { id } = useParams()
  const fmt = useFormatCurrency()
  const queryClient = useQueryClient()
  const [timeFilter, setTimeFilter] = useState(0) // 0 = Gesamt
  const [addingValue, setAddingValue] = useState(false)
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10))
  const [newValue, setNewValue] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editNotes, setEditNotes] = useState('')

  const { data: portfolio, isLoading } = useQuery<PortfolioDetail>({
    queryKey: ['portfolios', id],
    queryFn: () => fetch(`/api/portfolios/${id}`).then(r => r.json()),
  })

  const createValueMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/portfolios/${id}/values`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: newDate, value: parseFloat(newValue), notes: newNotes || null }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Fehler')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] })
      setAddingValue(false)
      setNewValue('')
      setNewNotes('')
      toast.success('Wertstand erfasst')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const updateValueMutation = useMutation({
    mutationFn: async ({ valueId, value, notes }: { valueId: string; value: number; notes: string | null }) => {
      const res = await fetch(`/api/portfolios/${id}/values/${valueId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value, notes }),
      })
      if (!res.ok) throw new Error('Fehler')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] })
      setEditingId(null)
      toast.success('Wertstand aktualisiert')
    },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  const deleteValueMutation = useMutation({
    mutationFn: async (valueId: string) => {
      const res = await fetch(`/api/portfolios/${id}/values/${valueId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Fehler')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] })
      toast.success('Wertstand gelöscht')
    },
  })

  if (isLoading) return <div className="p-6">Laden...</div>
  if (!portfolio) return <div className="p-6">Depot nicht gefunden</div>

  const currentValue = portfolio.values.length > 0 ? portfolio.values[0].value : null

  // Filter values by time range
  const cutoffDate = timeFilter > 0
    ? new Date(new Date().setMonth(new Date().getMonth() - timeFilter))
    : null
  const filteredValues = cutoffDate
    ? portfolio.values.filter(v => new Date(v.date) >= cutoffDate)
    : portfolio.values

  // Chart data (chronological order)
  const chartData = [...filteredValues].reverse().map(v => ({
    date: formatDate(v.date),
    value: v.value,
  }))

  function startEdit(v: PortfolioValueEntry) {
    setEditingId(v.id)
    setEditValue(String(v.value))
    setEditNotes(v.notes ?? '')
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/portfolios">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zurück
          </Button>
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: portfolio.color }} />
            <h1 className="text-2xl font-bold">{portfolio.name}</h1>
          </div>
          {portfolio.notes && <p className="text-muted-foreground text-sm">{portfolio.notes}</p>}
        </div>
      </div>

      {/* Current value */}
      <div className="mb-6 p-4 rounded-xl border bg-card">
        <p className="text-sm text-muted-foreground">Aktueller Wert</p>
        <p className="text-3xl font-bold">
          {currentValue != null ? fmt(currentValue) : '—'}
        </p>
      </div>

      {/* Chart */}
      {chartData.length > 1 && (
        <div className="mb-6 p-4 rounded-xl border bg-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Wertverlauf</h2>
            <div className="flex gap-1">
              {TIME_FILTERS.map(f => (
                <Button
                  key={f.label}
                  variant={timeFilter === f.months ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setTimeFilter(f.months)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={portfolio.color}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Value table */}
      <div className="rounded-xl border overflow-hidden">
        <div className="flex items-center justify-between p-3 bg-muted">
          <h2 className="font-semibold text-sm">Wertstände</h2>
          <Button size="sm" onClick={() => setAddingValue(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Neuer Wertstand
          </Button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium">Datum</th>
              <th className="text-right p-3 font-medium">Wert</th>
              <th className="text-left p-3 font-medium">Notiz</th>
              <th className="p-3 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {addingValue && (
              <tr className="bg-muted/30 border-t">
                <td className="p-2">
                  <Input
                    type="date"
                    value={newDate}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={e => setNewDate(e.target.value)}
                    className="h-8 text-sm w-36"
                  />
                </td>
                <td className="p-2">
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={newValue}
                    onChange={e => setNewValue(e.target.value)}
                    className="h-8 text-sm text-right w-32"
                  />
                </td>
                <td className="p-2">
                  <Input
                    placeholder="optional"
                    value={newNotes}
                    onChange={e => setNewNotes(e.target.value)}
                    className="h-8 text-sm"
                  />
                </td>
                <td className="p-2">
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 px-2"
                      disabled={!newValue || createValueMutation.isPending}
                      onClick={() => createValueMutation.mutate()}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setAddingValue(false)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </td>
              </tr>
            )}
            {portfolio.values.length === 0 && !addingValue ? (
              <tr>
                <td colSpan={4} className="p-6 text-center text-muted-foreground">
                  Noch keine Wertstände erfasst
                </td>
              </tr>
            ) : portfolio.values.map(v => (
              <tr key={v.id} className="border-t hover:bg-muted/50">
                <td className="p-3 text-muted-foreground">{formatDate(v.date)}</td>
                {editingId === v.id ? (
                  <>
                    <td className="p-2">
                      <Input
                        type="number"
                        step="0.01"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        className="h-8 text-sm text-right w-32"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        value={editNotes}
                        onChange={e => setEditNotes(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </td>
                    <td className="p-2">
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 px-2"
                          onClick={() => updateValueMutation.mutate({
                            valueId: v.id,
                            value: roundCents(parseFloat(editValue)),
                            notes: editNotes || null,
                          })}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingId(null)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="p-3 text-right font-semibold">{fmt(v.value)}</td>
                    <td className="p-3 text-muted-foreground text-xs">{v.notes ?? ''}</td>
                    <td className="p-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => startEdit(v)} className="text-muted-foreground hover:text-foreground">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => { if (confirm('Wertstand löschen?')) deleteValueMutation.mutate(v.id) }}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `node node_modules/typescript/bin/tsc --noEmit 2>&1 | grep -v "03-laufzeit" | head -10`

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/portfolios/\[id\]/page.tsx
git commit -m "feat: add portfolio detail page with chart and value table"
```

---

## Task 8: Settings Page + Sidebar

**Files:**
- Create: `src/app/(app)/settings/portfolios/page.tsx`
- Modify: `src/app/(app)/settings/page.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Create settings page**

Create `src/app/(app)/settings/portfolios/page.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PortfolioDialog } from '@/components/portfolios/PortfolioDialog'
import { toast } from 'sonner'
import type { Portfolio } from '@/types/api'

export default function PortfolioSettingsPage() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editPortfolio, setEditPortfolio] = useState<Portfolio | null>(null)

  const { data: portfolios = [], isLoading } = useQuery<Portfolio[]>({
    queryKey: ['portfolios'],
    queryFn: () => fetch('/api/portfolios').then(r => r.json()),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/portfolios/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Fehler')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] })
      toast.success('Depot gelöscht')
    },
    onError: () => toast.error('Fehler beim Löschen'),
  })

  function handleEdit(p: Portfolio) {
    setEditPortfolio(p)
    setDialogOpen(true)
  }

  function handleDialogClose(open: boolean) {
    setDialogOpen(open)
    if (!open) setEditPortfolio(null)
  }

  if (isLoading) return <div className="p-6">Laden...</div>

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Aktiendepots verwalten</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Neues Depot
        </Button>
      </div>

      {portfolios.length === 0 ? (
        <p className="text-muted-foreground">Noch keine Depots angelegt.</p>
      ) : (
        <div className="rounded-lg border">
          {portfolios.map((p, i) => (
            <div key={p.id} className={`flex items-center justify-between p-4 ${i > 0 ? 'border-t' : ''}`}>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="font-medium">{p.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => handleEdit(p)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => { if (confirm(`Depot "${p.name}" löschen?`)) deleteMutation.mutate(p.id) }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <PortfolioDialog open={dialogOpen} onOpenChange={handleDialogClose} editPortfolio={editPortfolio} />
    </div>
  )
}
```

- [ ] **Step 2: Add portfolio settings card to settings page**

In `src/app/(app)/settings/page.tsx`, add to the `settingsItems` array:

```typescript
{ href: '/settings/portfolios', icon: TrendingUp, title: 'Aktiendepots', description: 'Depots anlegen und verwalten' },
```

And add the import:
```typescript
import { TrendingUp } from 'lucide-react'
```

- [ ] **Step 3: Add navigation item to sidebar**

In `src/components/layout/Sidebar.tsx`, add to the `navItems` array after the "Bankkredite" entry (line 23):

```typescript
  { href: '/portfolios', label: 'Aktiendepots', icon: TrendingUp },
```

And add `TrendingUp` to the lucide-react import (line 8, add after `TrendingDown`).

- [ ] **Step 4: Verify build**

Run: `node node_modules/typescript/bin/tsc --noEmit 2>&1 | grep -v "03-laufzeit" | head -10`

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/settings/portfolios/page.tsx src/app/\(app\)/settings/page.tsx src/components/layout/Sidebar.tsx
git commit -m "feat: add portfolio settings page and sidebar navigation"
```

---

## Task 9: Net-Worth Integration

**Files:**
- Modify: `src/app/api/reports/net-worth/route.ts`

- [ ] **Step 1: Add portfolio values to net-worth calculation**

In `src/app/api/reports/net-worth/route.ts`, add after the loans calculation (after line 63):

```typescript
  // 3. Portfolio values: latest value per active portfolio
  const portfolioValues = await prisma.portfolio.findMany({
    where: { isActive: true },
    select: {
      values: {
        orderBy: { date: 'desc' },
        take: 1,
        select: { value: true },
      },
    },
  })

  const totalPortfolios = portfolioValues.reduce(
    (sum, p) => sum + (p.values[0]?.value ?? 0),
    0,
  )
```

Then update the response (replace lines 65-69):

```typescript
  const totalAssetsWithPortfolios = totalAssets + totalPortfolios

  return NextResponse.json({
    totalAssets: roundCents(totalAssetsWithPortfolios),
    totalDebts: roundCents(totalDebts),
    totalPortfolios: roundCents(totalPortfolios),
    netWorth: roundCents(totalAssetsWithPortfolios - totalDebts),
  })
```

- [ ] **Step 2: Verify build**

Run: `node node_modules/typescript/bin/tsc --noEmit 2>&1 | grep -v "03-laufzeit" | head -10`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/reports/net-worth/route.ts
git commit -m "feat: include portfolio values in net-worth calculation"
```

---

## Task 10: Push + Draft PR

- [ ] **Step 1: Push all changes**

```bash
git push -u origin feature/aktiendepots
```

- [ ] **Step 2: Create draft PR**

```bash
gh pr create --draft --title "feat: Aktiendepots (stock portfolio tracking)" --body "$(cat <<'EOF'
## Summary
- New standalone Portfolio + PortfolioValue models
- Portfolio list page with sparkline cards and total value
- Portfolio detail page with LineChart (3M/6M/1J/Gesamt filter) and value table
- Create/edit/delete portfolios via dialog (list page + settings)
- Create/edit/delete portfolio values with date validation (no future dates)
- Net-worth report includes portfolio values as assets
- Sidebar navigation entry "Aktiendepots"

## Spec
docs/superpowers/specs/2026-04-05-aktiendepots-design.md

## Test plan
- [ ] Create portfolio via dialog
- [ ] Add value entries with different dates
- [ ] Verify sparkline appears on list page card
- [ ] Verify LineChart on detail page with time filters
- [ ] Edit/delete value entries
- [ ] Verify future dates are rejected
- [ ] Verify duplicate dates are rejected (409)
- [ ] Verify net-worth includes portfolio values
- [ ] Edit/delete portfolio via settings page
- [ ] Verify total value sums correctly on list page

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
