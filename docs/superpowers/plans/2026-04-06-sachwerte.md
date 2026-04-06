# Sachwerte (Tangible Assets) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable tangible asset types and a full CRUD asset tracking system with value time-series, ownership percentages, and dashboard integration.

**Architecture:** Follows the existing Portfolio pattern — standalone Prisma models (`AssetType`, `Asset`, `AssetValue`) with no connection to Account/Transaction systems. API routes use `withHandler` + Zod validation. UI uses TanStack Query for data fetching, react-hook-form for dialogs, Recharts for charts.

**Tech Stack:** Next.js App Router, Prisma v7 + SQLite, Zod v4, TanStack Query, shadcn/ui, Recharts, Lucide icons

**Spec:** `docs/superpowers/specs/2026-04-06-sachwerte-design.md`

---

## File Structure

### New files to create:
| File | Responsibility |
|------|---------------|
| `prisma/migrations/20260406_assets.sql` | SQL migration for AssetType, Asset, AssetValue tables |
| `src/app/api/asset-types/route.ts` | GET all types, POST new type |
| `src/app/api/asset-types/[id]/route.ts` | PUT update type, DELETE type |
| `src/app/api/assets/route.ts` | GET all assets (with sparkline), POST new asset |
| `src/app/api/assets/[id]/route.ts` | GET detail, PUT update, DELETE asset |
| `src/app/api/assets/[id]/values/route.ts` | POST new value entry |
| `src/app/api/assets/[id]/values/[valueId]/route.ts` | PUT update value, DELETE value |
| `src/components/settings/AssetTypeDialog.tsx` | Dialog for creating/editing asset types with icon picker |
| `src/components/assets/AssetDialog.tsx` | Dialog for creating/editing assets |
| `src/app/(app)/settings/asset-types/page.tsx` | Settings page for managing asset types |
| `src/app/(app)/assets/page.tsx` | Assets overview page |
| `src/app/(app)/assets/[id]/page.tsx` | Asset detail page |

### Existing files to modify:
| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add AssetType, Asset, AssetValue models |
| `src/types/api.ts` | Add AssetType, Asset, AssetValue TypeScript interfaces |
| `src/components/layout/Sidebar.tsx` | Add "Sachwerte" nav item with Landmark icon |
| `src/app/(app)/settings/page.tsx` | Add "Sachwert-Typen" settings card |
| `src/app/api/reports/net-worth/route.ts` | Add `totalRealAssets` to net worth calculation |
| `src/app/(app)/dashboard/page.tsx` | Show "Sachwerte" in net worth breakdown |

---

## Task 1: Database Schema & Migration

**Files:**
- Modify: `prisma/schema.prisma` (append after PortfolioValue model, ~line 373)
- Create: `prisma/migrations/20260406_assets.sql`

- [ ] **Step 1: Add Prisma models to schema**

Add at the end of `prisma/schema.prisma` (after the PortfolioValue model):

```prisma
model AssetType {
  id        String   @id @default(cuid())
  name      String
  icon      String   @default("Package")
  color     String   @default("#6366f1")
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  assets Asset[]
}

model Asset {
  id               String   @id @default(cuid())
  name             String
  assetTypeId      String
  color            String   @default("#6366f1")
  ownershipPercent Float    @default(100)
  purchaseDate     DateTime
  purchasePrice    Float
  notes            String?
  isActive         Boolean  @default(true)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  assetType AssetType    @relation(fields: [assetTypeId], references: [id])
  values    AssetValue[]

  @@index([assetTypeId])
}

model AssetValue {
  id        String   @id @default(cuid())
  assetId   String
  date      DateTime
  value     Float
  notes     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  asset Asset @relation(fields: [assetId], references: [id], onDelete: Cascade)

  @@unique([assetId, date])
  @@index([assetId])
}
```

- [ ] **Step 2: Create SQL migration file**

Create `prisma/migrations/20260406_assets.sql`:

```sql
CREATE TABLE "AssetType" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "icon" TEXT NOT NULL DEFAULT 'Package',
  "color" TEXT NOT NULL DEFAULT '#6366f1',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Asset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "assetTypeId" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#6366f1',
  "ownershipPercent" REAL NOT NULL DEFAULT 100,
  "purchaseDate" DATETIME NOT NULL,
  "purchasePrice" REAL NOT NULL,
  "notes" TEXT,
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Asset_assetTypeId_fkey" FOREIGN KEY ("assetTypeId") REFERENCES "AssetType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Asset_assetTypeId_idx" ON "Asset" ("assetTypeId");

CREATE TABLE "AssetValue" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "assetId" TEXT NOT NULL,
  "date" DATETIME NOT NULL,
  "value" REAL NOT NULL,
  "notes" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "AssetValue_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AssetValue_assetId_date_key" ON "AssetValue" ("assetId", "date");
CREATE INDEX "AssetValue_assetId_idx" ON "AssetValue" ("assetId");
```

- [ ] **Step 3: Apply migration to dev.db**

```bash
sqlite3 prisma/dev.db < prisma/migrations/20260406_assets.sql
```

- [ ] **Step 4: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected: No errors. New types `AssetType`, `Asset`, `AssetValue` available on prisma client.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260406_assets.sql
git commit -m "feat: add AssetType, Asset, AssetValue schema and migration"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `src/types/api.ts` (append after Portfolio interfaces, ~line 304)

- [ ] **Step 1: Add type interfaces**

Add at the end of `src/types/api.ts`:

```typescript
// ── Asset (Sachwerte) ──────────────────────────────────────────────

export interface AssetType {
  id: string
  name: string
  icon: string
  color: string
  sortOrder: number
  createdAt: string
  updatedAt: string
  _count?: { assets: number }
}

export interface Asset {
  id: string
  name: string
  assetTypeId: string
  color: string
  ownershipPercent: number
  purchaseDate: string
  purchasePrice: number
  notes: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  assetType: { id: string; name: string; icon: string; color: string }
}

export interface AssetListItem extends Asset {
  currentValue: number | null
  sparklineData: { date: string; value: number }[]
}

export interface AssetDetail extends Asset {
  values: AssetValueEntry[]
}

export interface AssetValueEntry {
  id: string
  date: string
  value: number
  notes: string | null
}
```

Also update the `NetWorth` interface (existing in the same file):

```typescript
export interface NetWorth {
  totalAssets: number
  totalDebts: number
  netWorth: number
  totalPortfolios: number
  totalRealAssets: number  // NEW
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/api.ts
git commit -m "feat: add AssetType/Asset/AssetValue TypeScript interfaces"
```

---

## Task 3: AssetType API Routes

**Files:**
- Create: `src/app/api/asset-types/route.ts`
- Create: `src/app/api/asset-types/[id]/route.ts`

- [ ] **Step 1: Create asset-types collection route**

Create `src/app/api/asset-types/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'

const CreateAssetTypeSchema = z.object({
  name: z.string().min(1),
  icon: z.string().optional(),
  color: z.string().optional(),
})

export const GET = withHandler(async () => {
  const types = await prisma.assetType.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { assets: true } } },
  })

  return NextResponse.json(
    types.map(t => ({
      id: t.id,
      name: t.name,
      icon: t.icon,
      color: t.color,
      sortOrder: t.sortOrder,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      _count: t._count,
    })),
  )
})

export const POST = withHandler(async (request: Request) => {
  const body = await request.json()
  const data = CreateAssetTypeSchema.parse(body)

  // Auto-increment sortOrder
  const maxOrder = await prisma.assetType.aggregate({ _max: { sortOrder: true } })
  const nextOrder = (maxOrder._max.sortOrder ?? -1) + 1

  const assetType = await prisma.assetType.create({
    data: {
      name: data.name,
      icon: data.icon ?? 'Package',
      color: data.color ?? '#6366f1',
      sortOrder: nextOrder,
    },
  })

  return NextResponse.json(
    {
      ...assetType,
      createdAt: assetType.createdAt.toISOString(),
      updatedAt: assetType.updatedAt.toISOString(),
    },
    { status: 201 },
  )
})
```

- [ ] **Step 2: Create asset-types detail route**

Create `src/app/api/asset-types/[id]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'
import { DomainError } from '@/lib/api/errors'

const UpdateAssetTypeSchema = z.object({
  name: z.string().min(1).optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  sortOrder: z.number().int().optional(),
})

export const PUT = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const body = await request.json()
  const data = UpdateAssetTypeSchema.parse(body)

  const existing = await prisma.assetType.findUnique({ where: { id } })
  if (!existing) throw new DomainError('Not found', 404)

  const updated = await prisma.assetType.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.icon !== undefined && { icon: data.icon }),
      ...(data.color !== undefined && { color: data.color }),
      ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
    },
  })

  return NextResponse.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  })
})

export const DELETE = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params

  const existing = await prisma.assetType.findUnique({
    where: { id },
    include: { _count: { select: { assets: true } } },
  })
  if (!existing) throw new DomainError('Not found', 404)

  if (existing._count.assets > 0) {
    throw new DomainError(
      `Typ "${existing.name}" wird von ${existing._count.assets} Sachwert(en) verwendet und kann nicht gelöscht werden.`,
      409,
    )
  }

  await prisma.assetType.delete({ where: { id } })

  return NextResponse.json({ success: true })
})
```

- [ ] **Step 3: Verify routes compile**

```bash
npm run build 2>&1 | head -30
```

Expected: No type errors related to asset-types routes.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/asset-types/
git commit -m "feat: add AssetType API routes (CRUD)"
```

---

## Task 4: Asset API Routes

**Files:**
- Create: `src/app/api/assets/route.ts`
- Create: `src/app/api/assets/[id]/route.ts`
- Create: `src/app/api/assets/[id]/values/route.ts`
- Create: `src/app/api/assets/[id]/values/[valueId]/route.ts`

- [ ] **Step 1: Create assets collection route**

Create `src/app/api/assets/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'
import { roundCents } from '@/lib/money'

const CreateAssetSchema = z.object({
  name: z.string().min(1),
  assetTypeId: z.string().min(1),
  color: z.string().optional(),
  ownershipPercent: z.number().min(1).max(100).optional(),
  purchaseDate: z.string(),
  purchasePrice: z.number().positive(),
  notes: z.string().nullable().optional(),
})

export const GET = withHandler(async () => {
  const assets = await prisma.asset.findMany({
    where: { isActive: true },
    include: {
      assetType: { select: { id: true, name: true, icon: true, color: true } },
      values: {
        orderBy: { date: 'desc' },
        take: 30,
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  const result = assets.map(a => {
    const sortedValues = [...a.values].sort(
      (x, y) => new Date(x.date).getTime() - new Date(y.date).getTime(),
    )
    const newest = a.values[0] // already ordered desc
    return {
      id: a.id,
      name: a.name,
      assetTypeId: a.assetTypeId,
      color: a.color,
      ownershipPercent: a.ownershipPercent,
      purchaseDate: a.purchaseDate.toISOString().slice(0, 10),
      purchasePrice: a.purchasePrice,
      notes: a.notes,
      isActive: a.isActive,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
      assetType: a.assetType,
      currentValue: newest ? newest.value : null,
      sparklineData: sortedValues.map(v => ({
        date: v.date.toISOString().slice(0, 10),
        value: v.value,
      })),
    }
  })

  return NextResponse.json(result)
})

export const POST = withHandler(async (request: Request) => {
  const body = await request.json()
  const data = CreateAssetSchema.parse(body)

  const asset = await prisma.asset.create({
    data: {
      name: data.name,
      assetTypeId: data.assetTypeId,
      color: data.color ?? '#6366f1',
      ownershipPercent: data.ownershipPercent ?? 100,
      purchaseDate: new Date(data.purchaseDate),
      purchasePrice: roundCents(data.purchasePrice),
      notes: data.notes ?? null,
    },
    include: {
      assetType: { select: { id: true, name: true, icon: true, color: true } },
    },
  })

  return NextResponse.json(
    {
      ...asset,
      purchaseDate: asset.purchaseDate.toISOString().slice(0, 10),
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt.toISOString(),
    },
    { status: 201 },
  )
})
```

- [ ] **Step 2: Create assets detail route**

Create `src/app/api/assets/[id]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'
import { DomainError } from '@/lib/api/errors'
import { roundCents } from '@/lib/money'

const UpdateAssetSchema = z.object({
  name: z.string().min(1).optional(),
  assetTypeId: z.string().min(1).optional(),
  color: z.string().optional(),
  ownershipPercent: z.number().min(1).max(100).optional(),
  purchaseDate: z.string().optional(),
  purchasePrice: z.number().positive().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

export const GET = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params

  const asset = await prisma.asset.findUnique({
    where: { id },
    include: {
      assetType: { select: { id: true, name: true, icon: true, color: true } },
      values: {
        orderBy: { date: 'desc' },
      },
    },
  })

  if (!asset) throw new DomainError('Not found', 404)

  return NextResponse.json({
    id: asset.id,
    name: asset.name,
    assetTypeId: asset.assetTypeId,
    color: asset.color,
    ownershipPercent: asset.ownershipPercent,
    purchaseDate: asset.purchaseDate.toISOString().slice(0, 10),
    purchasePrice: asset.purchasePrice,
    notes: asset.notes,
    isActive: asset.isActive,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
    assetType: asset.assetType,
    values: asset.values.map(v => ({
      id: v.id,
      date: v.date.toISOString().slice(0, 10),
      value: v.value,
      notes: v.notes,
    })),
  })
})

export const PUT = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const body = await request.json()
  const data = UpdateAssetSchema.parse(body)

  const existing = await prisma.asset.findUnique({ where: { id } })
  if (!existing) throw new DomainError('Not found', 404)

  const asset = await prisma.asset.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.assetTypeId !== undefined && { assetTypeId: data.assetTypeId }),
      ...(data.color !== undefined && { color: data.color }),
      ...(data.ownershipPercent !== undefined && { ownershipPercent: data.ownershipPercent }),
      ...(data.purchaseDate !== undefined && { purchaseDate: new Date(data.purchaseDate) }),
      ...(data.purchasePrice !== undefined && { purchasePrice: roundCents(data.purchasePrice) }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
    include: {
      assetType: { select: { id: true, name: true, icon: true, color: true } },
    },
  })

  return NextResponse.json({
    ...asset,
    purchaseDate: asset.purchaseDate.toISOString().slice(0, 10),
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  })
})

export const DELETE = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params

  const existing = await prisma.asset.findUnique({ where: { id } })
  if (!existing) throw new DomainError('Not found', 404)

  await prisma.asset.delete({ where: { id } })

  return NextResponse.json({ success: true })
})
```

- [ ] **Step 3: Create asset values route**

Create `src/app/api/assets/[id]/values/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'
import { DomainError } from '@/lib/api/errors'
import { roundCents } from '@/lib/money'

const CreateValueSchema = z.object({
  date: z.string(),
  value: z.number(),
  notes: z.string().nullable().optional(),
})

export const POST = withHandler(async (request: Request, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const body = await request.json()
  const data = CreateValueSchema.parse(body)

  const asset = await prisma.asset.findUnique({ where: { id } })
  if (!asset) throw new DomainError('Not found', 404)

  // Validate date <= today
  const inputDate = new Date(data.date)
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  if (inputDate > today) {
    throw new DomainError('Date cannot be in the future', 400)
  }

  // Normalize to start of day for uniqueness check
  const dateOnly = new Date(data.date)
  dateOnly.setHours(0, 0, 0, 0)

  // Check unique constraint (assetId, date)
  const existing = await prisma.assetValue.findUnique({
    where: {
      assetId_date: {
        assetId: id,
        date: dateOnly,
      },
    },
  })
  if (existing) {
    throw new DomainError('A value for this date already exists', 409)
  }

  const entry = await prisma.assetValue.create({
    data: {
      assetId: id,
      date: dateOnly,
      value: roundCents(data.value),
      notes: data.notes ?? null,
    },
  })

  return NextResponse.json(
    {
      id: entry.id,
      date: entry.date.toISOString().slice(0, 10),
      value: entry.value,
      notes: entry.notes,
    },
    { status: 201 },
  )
})
```

- [ ] **Step 4: Create asset values detail route**

Create `src/app/api/assets/[id]/values/[valueId]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'
import { DomainError } from '@/lib/api/errors'
import { roundCents } from '@/lib/money'

const UpdateValueSchema = z.object({
  date: z.string().optional(),
  value: z.number().optional(),
  notes: z.string().nullable().optional(),
})

export const PUT = withHandler(async (request: Request, ctx) => {
  const { id, valueId } = await (ctx as { params: Promise<{ id: string; valueId: string }> }).params
  const body = await request.json()
  const data = UpdateValueSchema.parse(body)

  const existing = await prisma.assetValue.findUnique({ where: { id: valueId } })
  if (!existing || existing.assetId !== id) throw new DomainError('Not found', 404)

  let dateOnly: Date | undefined
  if (data.date !== undefined) {
    // Validate date <= today
    const inputDate = new Date(data.date)
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    if (inputDate > today) {
      throw new DomainError('Date cannot be in the future', 400)
    }

    dateOnly = new Date(data.date)
    dateOnly.setHours(0, 0, 0, 0)

    // Check unique constraint if date is changing
    const existingAtDate = await prisma.assetValue.findUnique({
      where: {
        assetId_date: {
          assetId: id,
          date: dateOnly,
        },
      },
    })
    if (existingAtDate && existingAtDate.id !== valueId) {
      throw new DomainError('A value for this date already exists', 409)
    }
  }

  const updated = await prisma.assetValue.update({
    where: { id: valueId },
    data: {
      ...(dateOnly !== undefined && { date: dateOnly }),
      ...(data.value !== undefined && { value: roundCents(data.value) }),
      ...(data.notes !== undefined && { notes: data.notes }),
    },
  })

  return NextResponse.json({
    id: updated.id,
    date: updated.date.toISOString().slice(0, 10),
    value: updated.value,
    notes: updated.notes,
  })
})

export const DELETE = withHandler(async (_, ctx) => {
  const { id, valueId } = await (ctx as { params: Promise<{ id: string; valueId: string }> }).params

  const existing = await prisma.assetValue.findUnique({ where: { id: valueId } })
  if (!existing || existing.assetId !== id) throw new DomainError('Not found', 404)

  await prisma.assetValue.delete({ where: { id: valueId } })

  return NextResponse.json({ success: true })
})
```

- [ ] **Step 5: Verify routes compile**

```bash
npm run build 2>&1 | head -30
```

Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/assets/
git commit -m "feat: add Asset and AssetValue API routes (CRUD)"
```

---

## Task 5: AssetType Settings UI

**Files:**
- Create: `src/components/settings/AssetTypeDialog.tsx`
- Create: `src/app/(app)/settings/asset-types/page.tsx`
- Modify: `src/app/(app)/settings/page.tsx` (add settings card)

- [ ] **Step 1: Create AssetTypeDialog component**

Create `src/components/settings/AssetTypeDialog.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Home, Car, Palette, FileText, Gem, Watch,
  Landmark, Sailboat, TreePine, Building2, Coins, Package,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AssetType } from '@/types/api'

const ICON_OPTIONS = [
  { name: 'Home', icon: Home },
  { name: 'Car', icon: Car },
  { name: 'Palette', icon: Palette },
  { name: 'FileText', icon: FileText },
  { name: 'Gem', icon: Gem },
  { name: 'Watch', icon: Watch },
  { name: 'Landmark', icon: Landmark },
  { name: 'Sailboat', icon: Sailboat },
  { name: 'TreePine', icon: TreePine },
  { name: 'Building2', icon: Building2 },
  { name: 'Coins', icon: Coins },
  { name: 'Package', icon: Package },
] as const

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  editType?: AssetType | null
}

interface FormState {
  name: string
  icon: string
  color: string
}

const EMPTY: FormState = {
  name: '',
  icon: 'Package',
  color: '#6366f1',
}

export function AssetTypeDialog({ open, onOpenChange, editType }: Props) {
  const qc = useQueryClient()
  const isEdit = !!editType
  const [form, setForm] = useState<FormState>(EMPTY)
  const set = (k: keyof FormState, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    if (!open) return
    if (editType) {
      setForm({ name: editType.name, icon: editType.icon, color: editType.color })
    } else {
      setForm(EMPTY)
    }
  }, [open, editType])

  const mutation = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name.trim(),
        icon: form.icon,
        color: form.color,
      }
      const url = isEdit ? `/api/asset-types/${editType!.id}` : '/api/asset-types'
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asset-types'] })
      toast.success(isEdit ? 'Typ aktualisiert' : 'Typ erstellt')
      onOpenChange(false)
    },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  const isValid = form.name.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Typ bearbeiten' : 'Neuer Sachwert-Typ'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="z.B. Immobilie"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Farbe</Label>
              <input
                type="color"
                value={form.color}
                onChange={e => set('color', e.target.value)}
                className="h-8 w-12 cursor-pointer rounded border"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Icon</Label>
            <div className="grid grid-cols-6 gap-2">
              {ICON_OPTIONS.map(opt => {
                const Icon = opt.icon
                const selected = form.icon === opt.name
                return (
                  <button
                    key={opt.name}
                    type="button"
                    onClick={() => set('icon', opt.name)}
                    className={cn(
                      'flex items-center justify-center h-10 w-10 rounded-lg border transition-colors',
                      selected
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-muted hover:border-foreground/30',
                    )}
                    title={opt.name}
                  >
                    <Icon className="h-5 w-5" />
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!isValid || mutation.isPending}
          >
            {mutation.isPending ? '...' : isEdit ? 'Speichern' : 'Anlegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Create asset-types settings page**

Create `src/app/(app)/settings/asset-types/page.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2, Pencil, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { AssetTypeDialog } from '@/components/settings/AssetTypeDialog'
import { ASSET_TYPE_ICONS } from '@/components/assets/icon-map'
import type { AssetType } from '@/types/api'

export default function AssetTypesSettingsPage() {
  const qc = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editType, setEditType] = useState<AssetType | null>(null)

  const openCreate = () => { setEditType(null); setDialogOpen(true) }
  const openEdit = (t: AssetType) => { setEditType(t); setDialogOpen(true) }
  const closeDialog = () => { setDialogOpen(false); setEditType(null) }

  const { data: types = [], isLoading } = useQuery<AssetType[]>({
    queryKey: ['asset-types'],
    queryFn: () => fetch('/api/asset-types').then(r => r.json()),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/asset-types/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Fehler beim Löschen' }))
        throw new Error(body.message ?? 'Fehler beim Löschen')
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asset-types'] })
      toast.success('Typ gelöscht')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/settings">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zurück
          </Button>
        </Link>
        <h1 className="text-2xl font-bold flex-1">Sachwert-Typen</h1>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Neuer Typ
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Laden...</p>
      ) : types.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-muted-foreground">
          <p>Noch keine Sachwert-Typen angelegt.</p>
          <Button className="mt-4" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Ersten Typ anlegen
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-3 font-medium">Typ</th>
                <th className="text-right p-3 font-medium">Sachwerte</th>
                <th className="p-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {types.map((type) => {
                const Icon = ASSET_TYPE_ICONS[type.icon] ?? ASSET_TYPE_ICONS.Package
                return (
                  <tr key={type.id} className="border-t hover:bg-muted/30">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="flex items-center justify-center h-7 w-7 rounded-md flex-shrink-0"
                          style={{ backgroundColor: type.color + '20', color: type.color }}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="font-medium">{type.name}</span>
                      </div>
                    </td>
                    <td className="p-3 text-right text-muted-foreground">
                      {type._count?.assets ?? 0}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1 justify-end">
                        <Button
                          variant="ghost" size="sm" className="h-7 w-7 p-0"
                          onClick={() => openEdit(type)}
                          title="Bearbeiten"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm(`"${type.name}" löschen?`)) {
                              deleteMutation.mutate(type.id)
                            }
                          }}
                          title="Löschen"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <AssetTypeDialog
        open={dialogOpen}
        onOpenChange={closeDialog}
        editType={editType}
      />
    </div>
  )
}
```

- [ ] **Step 3: Create shared icon-map helper**

The settings page and other components need to resolve icon names to Lucide components. Create `src/components/assets/icon-map.ts`:

```typescript
import {
  Home, Car, Palette, FileText, Gem, Watch,
  Landmark, Sailboat, TreePine, Building2, Coins, Package,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export const ASSET_TYPE_ICONS: Record<string, LucideIcon> = {
  Home,
  Car,
  Palette,
  FileText,
  Gem,
  Watch,
  Landmark,
  Sailboat,
  TreePine,
  Building2,
  Coins,
  Package,
}
```

- [ ] **Step 4: Add settings card to settings hub**

In `src/app/(app)/settings/page.tsx`, add the `Landmark` import and a new entry to the `settingsItems` array — after the Aktiendepots entry:

Add to imports:
```typescript
import { BookOpen, Landmark, SlidersHorizontal, Tag, TrendingDown, TrendingUp } from 'lucide-react'
```

Add to `settingsItems` array after the Aktiendepots object:
```typescript
  {
    href: '/settings/asset-types',
    icon: Landmark,
    title: 'Sachwert-Typen',
    description: 'Typen für Sachwerte verwalten (Immobilien, Fahrzeuge, etc.)',
  },
```

- [ ] **Step 5: Verify build**

```bash
npm run build 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/AssetTypeDialog.tsx src/components/assets/icon-map.ts src/app/\(app\)/settings/asset-types/ src/app/\(app\)/settings/page.tsx
git commit -m "feat: add AssetType settings UI with icon picker"
```

---

## Task 6: Asset Dialog Component

**Files:**
- Create: `src/components/assets/AssetDialog.tsx`

- [ ] **Step 1: Create AssetDialog**

Create `src/components/assets/AssetDialog.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AppSelect } from '@/components/ui/app-select'
import { ASSET_TYPE_ICONS } from '@/components/assets/icon-map'
import type { Asset, AssetType } from '@/types/api'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  editAsset?: Asset | null
}

interface FormState {
  name: string
  assetTypeId: string
  color: string
  ownershipPercent: string
  purchaseDate: string
  purchasePrice: string
  notes: string
}

const EMPTY: FormState = {
  name: '',
  assetTypeId: '',
  color: '#6366f1',
  ownershipPercent: '100',
  purchaseDate: new Date().toISOString().slice(0, 10),
  purchasePrice: '',
  notes: '',
}

export function AssetDialog({ open, onOpenChange, editAsset }: Props) {
  const qc = useQueryClient()
  const isEdit = !!editAsset
  const [form, setForm] = useState<FormState>(EMPTY)
  const set = (k: keyof FormState, v: string) => setForm(f => ({ ...f, [k]: v }))

  const { data: assetTypes = [] } = useQuery<AssetType[]>({
    queryKey: ['asset-types'],
    queryFn: () => fetch('/api/asset-types').then(r => r.json()),
  })

  useEffect(() => {
    if (!open) return
    if (editAsset) {
      setForm({
        name: editAsset.name,
        assetTypeId: editAsset.assetTypeId,
        color: editAsset.color,
        ownershipPercent: editAsset.ownershipPercent.toString(),
        purchaseDate: editAsset.purchaseDate.slice(0, 10),
        purchasePrice: editAsset.purchasePrice.toString(),
        notes: editAsset.notes ?? '',
      })
    } else {
      setForm(EMPTY)
    }
  }, [open, editAsset])

  const mutation = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name.trim(),
        assetTypeId: form.assetTypeId,
        color: form.color,
        ownershipPercent: parseFloat(form.ownershipPercent),
        purchaseDate: form.purchaseDate,
        purchasePrice: parseFloat(form.purchasePrice.replace(',', '.')),
        notes: form.notes.trim() || null,
      }
      const url = isEdit ? `/api/assets/${editAsset!.id}` : '/api/assets'
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] })
      toast.success(isEdit ? 'Sachwert aktualisiert' : 'Sachwert erstellt')
      onOpenChange(false)
    },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  const typeOptions = assetTypes.map(t => ({ value: t.id, label: t.name }))
  const price = parseFloat(form.purchasePrice.replace(',', '.'))
  const percent = parseFloat(form.ownershipPercent)
  const isValid =
    form.name.trim().length > 0 &&
    form.assetTypeId.length > 0 &&
    form.purchaseDate.length > 0 &&
    !isNaN(price) && price > 0 &&
    !isNaN(percent) && percent >= 1 && percent <= 100

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Sachwert bearbeiten' : 'Neuer Sachwert'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="z.B. Wohnung Schillerstr."
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Farbe</Label>
              <input
                type="color"
                value={form.color}
                onChange={e => set('color', e.target.value)}
                className="h-8 w-12 cursor-pointer rounded border"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Typ *</Label>
            <AppSelect
              value={form.assetTypeId}
              onValueChange={v => set('assetTypeId', v)}
              options={typeOptions}
              placeholder="Typ wählen..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Kaufdatum *</Label>
              <Input
                type="date"
                value={form.purchaseDate}
                onChange={e => set('purchaseDate', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Kaufpreis (Gesamt) *</Label>
              <Input
                type="number"
                step="0.01"
                value={form.purchasePrice}
                onChange={e => set('purchasePrice', e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Eigentumsanteil (%)</Label>
            <Input
              type="number"
              min="1"
              max="100"
              value={form.ownershipPercent}
              onChange={e => set('ownershipPercent', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Notizen</Label>
            <Input
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="optional"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!isValid || mutation.isPending}
          >
            {mutation.isPending ? '...' : isEdit ? 'Speichern' : 'Anlegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/assets/AssetDialog.tsx
git commit -m "feat: add AssetDialog component for creating/editing assets"
```

---

## Task 7: Assets Overview Page

**Files:**
- Create: `src/app/(app)/assets/page.tsx`
- Modify: `src/components/layout/Sidebar.tsx` (add nav item)

- [ ] **Step 1: Create assets overview page**

Create `src/app/(app)/assets/page.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Landmark, Plus } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AssetDialog } from '@/components/assets/AssetDialog'
import { ASSET_TYPE_ICONS } from '@/components/assets/icon-map'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import type { AssetListItem } from '@/types/api'

type TimeFilter = '3M' | '6M' | '1J' | 'Gesamt'

const TIME_FILTERS: { label: TimeFilter; months: number }[] = [
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '1J', months: 12 },
  { label: 'Gesamt', months: 0 },
]

function buildAggregateChart(assets: AssetListItem[], months: number) {
  // Collect all dates across all assets, compute per-date sum of proportional values
  const dateMap = new Map<string, number>()
  for (const asset of assets) {
    const factor = asset.ownershipPercent / 100
    for (const pt of asset.sparklineData) {
      dateMap.set(pt.date, (dateMap.get(pt.date) ?? 0) + pt.value * factor)
    }
  }
  let entries = [...dateMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }))

  if (months > 0) {
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - months)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    entries = entries.filter(e => e.date >= cutoffStr)
  }

  return entries
}

export default function AssetsPage() {
  const fmt = useFormatCurrency()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('Gesamt')

  const { data: assets = [], isLoading } = useQuery<AssetListItem[]>({
    queryKey: ['assets'],
    queryFn: () => fetch('/api/assets').then(r => r.json()),
  })

  const totalValue = assets.reduce(
    (sum, a) => sum + (a.currentValue ?? 0) * (a.ownershipPercent / 100),
    0,
  )

  const totalPurchase = assets.reduce(
    (sum, a) => sum + a.purchasePrice * (a.ownershipPercent / 100),
    0,
  )

  const totalGain = totalValue - totalPurchase
  const totalGainPct = totalPurchase > 0 ? (totalGain / totalPurchase) * 100 : 0

  const activeMonths = TIME_FILTERS.find(f => f.label === timeFilter)?.months ?? 0
  const chartData = buildAggregateChart(assets, activeMonths)

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">Sachwerte</h1>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Neuer Sachwert
        </Button>
      </div>

      {assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-64 text-center">
          <Landmark className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">Keine Sachwerte vorhanden</h2>
          <p className="text-muted-foreground text-sm mb-4">
            Lege deinen ersten Sachwert an, um Werte zu verfolgen.
          </p>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Neuer Sachwert
          </Button>
        </div>
      ) : (
        <>
          {/* Summary card */}
          <div className="rounded-xl border bg-card p-5 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Gesamtwert (anteilig)</p>
                <p className="text-3xl font-bold">{fmt(totalValue)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground mb-1">Gewinn / Verlust</p>
                <p className={`text-lg font-semibold ${totalGain >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                  {totalGain >= 0 ? '+' : ''}{fmt(totalGain)} ({totalGainPct >= 0 ? '+' : ''}{totalGainPct.toFixed(1)}%)
                </p>
              </div>
            </div>
          </div>

          {/* Aggregate chart */}
          {chartData.length > 1 && (
            <div className="rounded-xl border bg-card p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-sm">Gesamtverlauf</h2>
                <div className="flex gap-1">
                  {TIME_FILTERS.map(f => (
                    <Button
                      key={f.label}
                      variant={timeFilter === f.label ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setTimeFilter(f.label)}
                    >
                      {f.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={v => fmt(v)} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={90} />
                    <Tooltip formatter={(v) => typeof v === 'number' ? fmt(v) : v} />
                    <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={chartData.length <= 30} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Asset cards grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {assets.map((asset) => {
              const Icon = ASSET_TYPE_ICONS[asset.assetType.icon] ?? ASSET_TYPE_ICONS.Package
              const ownValue = (asset.currentValue ?? 0) * (asset.ownershipPercent / 100)
              const ownPurchase = asset.purchasePrice * (asset.ownershipPercent / 100)
              const gain = ownValue - ownPurchase
              const gainPct = ownPurchase > 0 ? (gain / ownPurchase) * 100 : 0
              const sparkline = asset.sparklineData.map(d => ({
                ...d,
                value: d.value * (asset.ownershipPercent / 100),
              }))

              return (
                <Link key={asset.id} href={`/assets/${asset.id}`}>
                  <div className="rounded-xl border bg-card p-5 hover:shadow-md transition-shadow cursor-pointer">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="flex items-center justify-center h-8 w-8 rounded-lg flex-shrink-0"
                          style={{ backgroundColor: asset.color + '20', color: asset.color }}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-base truncate">{asset.name}</h3>
                          <p className="text-xs text-muted-foreground">{asset.assetType.name}</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <p className="text-lg font-bold">
                          {asset.currentValue != null ? fmt(ownValue) : '—'}
                        </p>
                        {asset.ownershipPercent < 100 && (
                          <p className="text-xs text-muted-foreground">{asset.ownershipPercent}% Anteil</p>
                        )}
                      </div>
                    </div>

                    {asset.currentValue != null && (
                      <p className={`text-xs font-medium mb-2 ${gain >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                        {gain >= 0 ? '+' : ''}{fmt(gain)} ({gainPct >= 0 ? '+' : ''}{gainPct.toFixed(1)}%)
                      </p>
                    )}

                    {sparkline.length > 1 ? (
                      <div className="h-12">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={sparkline}>
                            <Line
                              type="monotone"
                              dataKey="value"
                              stroke={asset.color}
                              strokeWidth={1.5}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="h-12 flex items-center">
                        <p className="text-xs text-muted-foreground">Noch keine Verlaufsdaten</p>
                      </div>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        </>
      )}

      <AssetDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}
```

- [ ] **Step 2: Add Sidebar nav item**

In `src/components/layout/Sidebar.tsx`:

Add `Landmark` to the Lucide import:
```typescript
import {
  LayoutDashboard,
  CreditCard,
  TrendingDown,
  TrendingUp,
  Landmark,
  ArrowLeftRight,
  BarChart3,
  Upload,
  Settings,
  Wallet,
  Moon,
  Sun,
} from 'lucide-react'
```

Add the nav item after the Aktiendepots entry and before Transaktionen in the `navItems` array:
```typescript
  { href: '/assets', label: 'Sachwerte', icon: Landmark },
```

The full array should be:
```typescript
const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/accounts', label: 'Konten', icon: CreditCard },
  { href: '/loans', label: 'Bankkredite', icon: TrendingDown },
  { href: '/portfolios', label: 'Aktiendepots', icon: TrendingUp },
  { href: '/assets', label: 'Sachwerte', icon: Landmark },
  { href: '/transactions', label: 'Transaktionen', icon: ArrowLeftRight },
  { href: '/reports', label: 'Berichte', icon: BarChart3 },
  { href: '/import', label: 'Import', icon: Upload },
  { href: '/settings', label: 'Einstellungen', icon: Settings },
]
```

- [ ] **Step 3: Verify build**

```bash
npm run build 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/assets/page.tsx src/components/layout/Sidebar.tsx
git commit -m "feat: add Sachwerte overview page with aggregate chart and asset cards"
```

---

## Task 8: Asset Detail Page

**Files:**
- Create: `src/app/(app)/assets/[id]/page.tsx`

- [ ] **Step 1: Create asset detail page**

Create `src/app/(app)/assets/[id]/page.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Pencil, Trash2, Plus, Check, X } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import { formatDate } from '@/lib/utils'
import { ASSET_TYPE_ICONS } from '@/components/assets/icon-map'
import { AssetDialog } from '@/components/assets/AssetDialog'
import type { AssetDetail, AssetValueEntry } from '@/types/api'

const TODAY = new Date().toISOString().slice(0, 10)

type TimeFilter = '3M' | '6M' | '1J' | 'Gesamt'

const TIME_FILTERS: { label: TimeFilter; months: number }[] = [
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '1J', months: 12 },
  { label: 'Gesamt', months: 0 },
]

function filterByMonths(entries: AssetValueEntry[], months: number): AssetValueEntry[] {
  if (months === 0) return entries
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  return entries.filter(e => new Date(e.date) >= cutoff)
}

interface AddRowState {
  date: string
  value: string
  notes: string
}

interface EditRowState {
  id: string
  date: string
  value: string
  notes: string
}

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const fmt = useFormatCurrency()

  const [timeFilter, setTimeFilter] = useState<TimeFilter>('Gesamt')
  const [addRow, setAddRow] = useState<AddRowState | null>(null)
  const [editRow, setEditRow] = useState<EditRowState | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)

  const { data: asset, isLoading } = useQuery<AssetDetail>({
    queryKey: ['assets', id],
    queryFn: () => fetch(`/api/assets/${id}`).then(r => r.json()),
  })

  const createMutation = useMutation({
    mutationFn: async (body: { date: string; value: number; notes: string | null }) => {
      const res = await fetch(`/api/assets/${id}/values`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] })
      toast.success('Wertstand hinzugefügt')
      setAddRow(null)
    },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ valueId, body }: { valueId: string; body: { date: string; value: number; notes: string | null } }) => {
      const res = await fetch(`/api/assets/${id}/values/${valueId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] })
      toast.success('Wertstand aktualisiert')
      setEditRow(null)
    },
    onError: () => toast.error('Fehler beim Aktualisieren'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (valueId: string) => {
      const res = await fetch(`/api/assets/${id}/values/${valueId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] })
      toast.success('Wertstand gelöscht')
    },
    onError: () => toast.error('Fehler beim Löschen'),
  })

  if (isLoading || !asset) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  const Icon = ASSET_TYPE_ICONS[asset.assetType.icon] ?? ASSET_TYPE_ICONS.Package
  const factor = asset.ownershipPercent / 100

  // Values sorted newest-first for the table display
  const valuesSorted = [...asset.values].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )

  // Chart data
  const activeMonths = TIME_FILTERS.find(f => f.label === timeFilter)?.months ?? 0
  const filteredValues = filterByMonths(valuesSorted, activeMonths)
  const chartData = [...filteredValues].reverse().map(v => ({
    date: formatDate(v.date),
    value: v.value * factor,
  }))

  const currentValue = valuesSorted[0]?.value ?? null
  const ownValue = currentValue != null ? currentValue * factor : null
  const ownPurchase = asset.purchasePrice * factor
  const gain = ownValue != null ? ownValue - ownPurchase : null
  const gainPct = gain != null && ownPurchase > 0 ? (gain / ownPurchase) * 100 : null

  const handleSaveAdd = () => {
    if (!addRow) return
    const value = parseFloat(addRow.value.replace(',', '.'))
    if (isNaN(value) || !addRow.date) {
      toast.error('Bitte Datum und Wert angeben')
      return
    }
    createMutation.mutate({
      date: addRow.date,
      value,
      notes: addRow.notes.trim() || null,
    })
  }

  const handleSaveEdit = () => {
    if (!editRow) return
    const value = parseFloat(editRow.value.replace(',', '.'))
    if (isNaN(value) || !editRow.date) {
      toast.error('Bitte Datum und Wert angeben')
      return
    }
    updateMutation.mutate({
      valueId: editRow.id,
      body: {
        date: editRow.date,
        value,
        notes: editRow.notes.trim() || null,
      },
    })
  }

  const handleDeleteValue = (entry: AssetValueEntry) => {
    if (confirm(`Wertstand vom ${formatDate(entry.date)} löschen?`)) {
      deleteMutation.mutate(entry.id)
    }
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/assets">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zurück
          </Button>
        </Link>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span
            className="flex items-center justify-center h-8 w-8 rounded-lg flex-shrink-0"
            style={{ backgroundColor: asset.color + '20', color: asset.color }}
          >
            <Icon className="h-4 w-4" />
          </span>
          <h1 className="text-2xl font-bold truncate">{asset.name}</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(true)}>
          <Pencil className="h-4 w-4 mr-1" /> Bearbeiten
        </Button>
      </div>

      {/* Info row */}
      <div className="flex flex-wrap items-center gap-3 mb-4 text-sm text-muted-foreground">
        <span className="bg-muted px-2 py-0.5 rounded text-xs font-medium">{asset.assetType.name}</span>
        <span>Kaufdatum: {formatDate(asset.purchaseDate)}</span>
        {asset.ownershipPercent < 100 && (
          <span>Anteil: {asset.ownershipPercent}%</span>
        )}
      </div>

      {asset.notes && (
        <p className="text-muted-foreground text-sm mb-4">{asset.notes}</p>
      )}

      {/* Value card */}
      <div className="rounded-xl border bg-card p-5 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Aktueller Wert {asset.ownershipPercent < 100 ? '(anteilig)' : ''}</p>
            <p className="text-3xl font-bold">
              {ownValue != null ? fmt(ownValue) : '—'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground mb-1">Kaufpreis {asset.ownershipPercent < 100 ? '(anteilig)' : ''}</p>
            <p className="text-lg font-medium">{fmt(ownPurchase)}</p>
            {gain != null && (
              <p className={`text-sm font-semibold ${gain >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                {gain >= 0 ? '+' : ''}{fmt(gain)} ({gainPct != null ? `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%` : ''})
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 1 && (
        <div className="rounded-xl border bg-card p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm">Wertverlauf</h2>
            <div className="flex gap-1">
              {TIME_FILTERS.map(f => (
                <Button
                  key={f.label}
                  variant={timeFilter === f.label ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setTimeFilter(f.label)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={90} />
                <Tooltip formatter={(v) => typeof v === 'number' ? fmt(v) : v} />
                <Line type="monotone" dataKey="value" stroke={asset.color} strokeWidth={2} dot={chartData.length <= 30} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Value Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold">Wertstände</h2>
          <Button
            size="sm"
            onClick={() => {
              setAddRow({ date: TODAY, value: '', notes: '' })
              setEditRow(null)
            }}
            disabled={!!addRow}
          >
            <Plus className="h-4 w-4 mr-1" /> Neuer Wertstand
          </Button>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left p-3 font-medium">Datum</th>
              <th className="text-right p-3 font-medium">Gesamtwert</th>
              <th className="text-right p-3 font-medium">Anteilig</th>
              <th className="text-left p-3 font-medium">Notiz</th>
              <th className="p-3 w-20" />
            </tr>
          </thead>
          <tbody>
            {/* Add row */}
            {addRow && (
              <tr className="border-t bg-muted/30">
                <td className="p-2">
                  <Input
                    type="date"
                    value={addRow.date}
                    max={TODAY}
                    onChange={e => setAddRow(r => r ? { ...r, date: e.target.value } : r)}
                    className="h-7 text-xs"
                  />
                </td>
                <td className="p-2">
                  <Input
                    type="number"
                    step="0.01"
                    value={addRow.value}
                    onChange={e => setAddRow(r => r ? { ...r, value: e.target.value } : r)}
                    placeholder="0.00"
                    className="h-7 text-xs text-right"
                  />
                </td>
                <td className="p-2 text-right text-xs text-muted-foreground">
                  {addRow.value && !isNaN(parseFloat(addRow.value.replace(',', '.')))
                    ? fmt(parseFloat(addRow.value.replace(',', '.')) * factor)
                    : '—'}
                </td>
                <td className="p-2">
                  <Input
                    value={addRow.notes}
                    onChange={e => setAddRow(r => r ? { ...r, notes: e.target.value } : r)}
                    placeholder="optional"
                    className="h-7 text-xs"
                  />
                </td>
                <td className="p-2">
                  <div className="flex gap-1 justify-end">
                    <Button
                      variant="ghost" size="sm" className="h-7 w-7 p-0 text-emerald-600"
                      onClick={handleSaveAdd}
                      disabled={createMutation.isPending}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="sm" className="h-7 w-7 p-0"
                      onClick={() => setAddRow(null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            )}

            {/* Data rows */}
            {valuesSorted.length === 0 && !addRow && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  Noch keine Wertstände eingetragen.
                </td>
              </tr>
            )}
            {valuesSorted.map((entry) => {
              const isEditing = editRow?.id === entry.id
              return (
                <tr key={entry.id} className="border-t hover:bg-muted/30">
                  {isEditing ? (
                    <>
                      <td className="p-2">
                        <Input
                          type="date"
                          value={editRow.date}
                          max={TODAY}
                          onChange={e => setEditRow(r => r ? { ...r, date: e.target.value } : r)}
                          className="h-7 text-xs"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={editRow.value}
                          onChange={e => setEditRow(r => r ? { ...r, value: e.target.value } : r)}
                          className="h-7 text-xs text-right"
                        />
                      </td>
                      <td className="p-2 text-right text-xs text-muted-foreground">
                        {editRow.value && !isNaN(parseFloat(editRow.value.replace(',', '.')))
                          ? fmt(parseFloat(editRow.value.replace(',', '.')) * factor)
                          : '—'}
                      </td>
                      <td className="p-2">
                        <Input
                          value={editRow.notes}
                          onChange={e => setEditRow(r => r ? { ...r, notes: e.target.value } : r)}
                          placeholder="optional"
                          className="h-7 text-xs"
                        />
                      </td>
                      <td className="p-2">
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost" size="sm" className="h-7 w-7 p-0 text-emerald-600"
                            onClick={handleSaveEdit}
                            disabled={updateMutation.isPending}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="sm" className="h-7 w-7 p-0"
                            onClick={() => setEditRow(null)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-3">{formatDate(entry.date)}</td>
                      <td className="p-3 text-right font-medium">{fmt(entry.value)}</td>
                      <td className="p-3 text-right text-muted-foreground">{fmt(entry.value * factor)}</td>
                      <td className="p-3 text-muted-foreground text-xs">{entry.notes ?? '—'}</td>
                      <td className="p-3">
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost" size="sm" className="h-7 w-7 p-0"
                            onClick={() => {
                              setEditRow({
                                id: entry.id,
                                date: entry.date.slice(0, 10),
                                value: entry.value.toString(),
                                notes: entry.notes ?? '',
                              })
                              setAddRow(null)
                            }}
                            title="Bearbeiten"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteValue(entry)}
                            title="Löschen"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <AssetDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        editAsset={asset}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/assets/\[id\]/page.tsx
git commit -m "feat: add asset detail page with value chart and inline editing"
```

---

## Task 9: Dashboard & Net Worth Integration

**Files:**
- Modify: `src/app/api/reports/net-worth/route.ts` (~line 65-88)
- Modify: `src/app/(app)/dashboard/page.tsx` (~line 123-127)

- [ ] **Step 1: Add totalRealAssets to net-worth API**

In `src/app/api/reports/net-worth/route.ts`, add after the portfolio calculation block (after `const totalPortfolios = ...`, ~line 80) and before the return statement:

```typescript
  // 4. Asset (Sachwerte) values: latest value per active asset × ownership
  const assetValues = await prisma.asset.findMany({
    where: { isActive: true },
    select: {
      ownershipPercent: true,
      values: {
        orderBy: { date: 'desc' },
        take: 1,
        select: { value: true },
      },
    },
  })

  const totalRealAssets = assetValues.reduce(
    (sum, a) => sum + (a.values[0]?.value ?? 0) * (a.ownershipPercent / 100),
    0,
  )
```

Update the return statement to include `totalRealAssets`:

```typescript
  return NextResponse.json({
    totalAssets: roundCents(totalAssets),
    totalPortfolios: roundCents(totalPortfolios),
    totalRealAssets: roundCents(totalRealAssets),
    totalDebts: roundCents(totalDebts),
    netWorth: roundCents(totalAssets + totalPortfolios + totalRealAssets - totalDebts),
  })
```

- [ ] **Step 2: Update dashboard display**

In `src/app/(app)/dashboard/page.tsx`, update the net worth breakdown line (~line 123-127). Find the existing line:

```typescript
              {(netWorth?.totalPortfolios ?? 0) > 0 && <> · Depots {fmt(netWorth?.totalPortfolios ?? 0)}</>}
```

Add after it:
```typescript
              {(netWorth?.totalRealAssets ?? 0) > 0 && <> · Sachwerte {fmt(netWorth?.totalRealAssets ?? 0)}</>}
```

- [ ] **Step 3: Verify build**

```bash
npm run build 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/reports/net-worth/route.ts src/app/\(app\)/dashboard/page.tsx
git commit -m "feat: integrate Sachwerte into net worth and dashboard display"
```

---

## Task 10: Manual Smoke Test

No code changes — verify the feature works end-to-end.

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test AssetType settings**

1. Open http://localhost:3000/settings
2. Verify "Sachwert-Typen" card appears
3. Click → navigate to /settings/asset-types
4. Create a type "Immobilie" with Home icon
5. Create a type "Fahrzeug" with Car icon
6. Edit the Immobilie type, change color
7. Verify both types appear in the list

- [ ] **Step 3: Test Asset creation**

1. Navigate to /assets
2. Verify empty state is shown
3. Click "Neuer Sachwert"
4. Fill in: Name "Wohnung Schillerstr.", Type "Immobilie", Kaufpreis 300000, Kaufdatum, Anteil 50%
5. Verify asset card appears on overview page

- [ ] **Step 4: Test value tracking**

1. Click on the asset card → navigate to detail page
2. Add several value entries at different dates
3. Verify chart updates
4. Verify "Anteilig" column shows 50% values
5. Edit a value, delete a value
6. Verify sparkline appears on overview page

- [ ] **Step 5: Test dashboard integration**

1. Navigate to /dashboard
2. Verify "Sachwerte" appears in the Gesamtvermögen breakdown
3. Verify the net worth total includes the proportional asset value

- [ ] **Step 6: Test sidebar navigation**

1. Verify "Sachwerte" appears in sidebar between "Aktiendepots" and "Transaktionen"
2. Verify active state highlights correctly when on /assets pages

- [ ] **Step 7: Final commit and push**

```bash
git push
```
