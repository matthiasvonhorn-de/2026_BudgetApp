# Category Rollover Flag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-category `rolloverEnabled` boolean that controls whether the "Übertrag" button carries the budgeted value and available balance into the next month.

**Architecture:** Single boolean column on `Category`; API POST/PUT schemas extended; rollover route filters by the flag instead of by type; UI adds a checkbox in both the create and edit forms.

**Tech Stack:** SQLite (manual migration), Prisma v7 + libSQL, Next.js App Router API routes, React + react-hook-form, Zod v4, shadcn/ui

---

## Files touched

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `rolloverEnabled Boolean @default(true)` to `Category` model |
| `prisma/dev.db` | `ALTER TABLE Category ADD COLUMN rolloverEnabled BOOLEAN NOT NULL DEFAULT 1` |
| `src/app/api/categories/route.ts` | Add `rolloverEnabled` to POST schema |
| `src/app/api/categories/[id]/route.ts` | Add `rolloverEnabled` to PUT schema |
| `src/app/api/accounts/[id]/budget/[year]/[month]/rollover/route.ts` | Filter by `rolloverEnabled: true` instead of `type: 'EXPENSE'` |
| `src/components/accounts/AccountBudgetConfig.tsx` | `Category` interface + checkbox in `NewCategoryForm` + `EditCategoryForm` |

---

## Task 1: DB column + Prisma model

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/dev.db` (via sqlite3)

- [ ] **Step 1: Apply SQL migration**

```bash
sqlite3 prisma/dev.db "ALTER TABLE Category ADD COLUMN rolloverEnabled BOOLEAN NOT NULL DEFAULT 1;"
```

Verify:
```bash
sqlite3 prisma/dev.db "SELECT id, name, rolloverEnabled FROM Category LIMIT 5;"
```
Expected: all rows show `1` in the new column.

- [ ] **Step 2: Update prisma/schema.prisma**

In the `Category` model, add after `isActive Boolean @default(true)`:

```prisma
rolloverEnabled    Boolean       @default(true)
```

- [ ] **Step 3: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected output ends with `✔ Generated Prisma Client`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add rolloverEnabled column to Category"
```

---

## Task 2: API — POST /api/categories

**Files:**
- Modify: `src/app/api/categories/route.ts`

- [ ] **Step 1: Add field to Zod schema**

In `src/app/api/categories/route.ts`, add `rolloverEnabled` to `categorySchema`:

```ts
const categorySchema = z.object({
  name: z.string().min(1),
  color: z.string().default('#6366f1'),
  icon: z.string().optional().nullable(),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).default('EXPENSE'),
  groupId: z.string().optional().nullable(),
  sortOrder: z.number().default(0),
  subAccountGroupId: z.string().optional().nullable(),
  subAccountLinkType: z.enum(['BOOKING', 'TRANSFER']).default('BOOKING'),
  rolloverEnabled: z.boolean().default(true),
})
```

- [ ] **Step 2: Verify manually**

With the dev server running (`npm run dev`), open the browser console and run:

```js
await fetch('/api/categories', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Test Rollover', groupId: null, rolloverEnabled: false }),
}).then(r => r.json())
```

Expected: response contains `"rolloverEnabled": false`.

Cleanup — delete the test category via the UI or:
```js
await fetch('/api/categories/<id>', { method: 'DELETE' })
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/categories/route.ts
git commit -m "feat: accept rolloverEnabled in POST /api/categories"
```

---

## Task 3: API — PUT /api/categories/[id]

**Files:**
- Modify: `src/app/api/categories/[id]/route.ts`

- [ ] **Step 1: Add field to Zod schema**

In `src/app/api/categories/[id]/route.ts`, add `rolloverEnabled` to `categorySchema`:

```ts
const categorySchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).optional(),
  groupId: z.string().nullable().optional(),
  sortOrder: z.number().optional(),
  isActive: z.boolean().optional(),
  subAccountGroupId: z.string().nullable().optional(),
  subAccountLinkType: z.enum(['BOOKING', 'TRANSFER']).optional(),
  rolloverEnabled: z.boolean().optional(),
})
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/api/categories/[id]/route.ts"
git commit -m "feat: accept rolloverEnabled in PUT /api/categories/[id]"
```

---

## Task 4: Rollover route — filter by rolloverEnabled

**Files:**
- Modify: `src/app/api/accounts/[id]/budget/[year]/[month]/rollover/route.ts`

- [ ] **Step 1: Replace type filter with rolloverEnabled filter**

Change the `categoryGroup.findMany` call. Replace:

```ts
categories: { where: { isActive: true, type: 'EXPENSE' } },
```

With:

```ts
categories: { where: { isActive: true, rolloverEnabled: true } },
```

The full updated block:

```ts
const groups = await prisma.categoryGroup.findMany({
  where: { accountId: id },
  include: {
    categories: { where: { isActive: true, rolloverEnabled: true } },
  },
})
```

- [ ] **Step 2: Verify manually**

In the app, go to an account's Budget tab → January 2026 → click "Übertrag".
Expected toast: "Übertrag für X Kategorien in 2/2026 gespeichert."
Navigate to February 2026 — INCOME categories with `rolloverEnabled = true` now show a rollover entry alongside EXPENSE categories.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/accounts/[id]/budget/[year]/[month]/rollover/route.ts"
git commit -m "feat: rollover filters by rolloverEnabled instead of type=EXPENSE"
```

---

## Task 5: UI — checkbox in AccountBudgetConfig

**Files:**
- Modify: `src/components/accounts/AccountBudgetConfig.tsx`

- [ ] **Step 1: Add rolloverEnabled to Category interface**

Find the `Category` interface (around line 34) and add the field:

```ts
interface Category {
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
```

- [ ] **Step 2: Add state + checkbox to NewCategoryForm**

Add `rolloverEnabled` state after the `color` state declaration (around line 115):

```ts
const [rolloverEnabled, setRolloverEnabled] = useState(true)
```

Include it in the POST body inside `createCat` mutation (replace the existing `body`):

```ts
body: JSON.stringify({ name, color, type, groupId, rolloverEnabled }),
```

Add the checkbox to the JSX, after the color picker and before the action buttons:

```tsx
<div className="flex items-center gap-2 pt-1">
  <input
    type="checkbox"
    id="rollover-new"
    checked={rolloverEnabled}
    onChange={e => setRolloverEnabled(e.target.checked)}
    className="rounded"
  />
  <label htmlFor="rollover-new" className="text-xs text-muted-foreground cursor-pointer">
    Übertrag aktivieren
  </label>
</div>
```

- [ ] **Step 3: Add state + checkbox to EditCategoryForm**

Add `rolloverEnabled` state after `subAccountLinkType` state (around line 194):

```ts
const [rolloverEnabled, setRolloverEnabled] = useState(category.rolloverEnabled)
```

Include it in the PUT body inside `updateCat` mutation (replace the existing `body`):

```ts
body: JSON.stringify({
  name, color, type, groupId,
  subAccountGroupId: subAccountGroupId === '__none__' ? null : subAccountGroupId,
  subAccountLinkType,
  rolloverEnabled,
}),
```

Add the checkbox to the JSX, after the color picker and before the action buttons (same position as in NewCategoryForm):

```tsx
<div className="flex items-center gap-2 pt-1">
  <input
    type="checkbox"
    id={`rollover-${category.id}`}
    checked={rolloverEnabled}
    onChange={e => setRolloverEnabled(e.target.checked)}
    className="rounded"
  />
  <label htmlFor={`rollover-${category.id}`} className="text-xs text-muted-foreground cursor-pointer">
    Übertrag aktivieren
  </label>
</div>
```

- [ ] **Step 4: Verify manually**

1. Open an account → Settings icon → Gruppen & Kategorien
2. Click "+" to add a new category → confirm checkbox "Übertrag aktivieren" is visible and checked by default
3. Create the category → open its edit form → confirm checkbox shows checked
4. Uncheck the box → Save → reopen the edit form → confirm it shows unchecked
5. Run the rollover for a month → confirm the category with `rolloverEnabled = false` does NOT appear in the next month

- [ ] **Step 5: Commit**

```bash
git add src/components/accounts/AccountBudgetConfig.tsx
git commit -m "feat: add Übertrag-aktivieren checkbox to category forms"
```

---

## Task 6: PR

- [ ] **Push branch and mark PR ready**

```bash
git push
gh pr view --web
```

Mark draft PR as ready for review via the GitHub UI, or:

```bash
gh pr ready
```
