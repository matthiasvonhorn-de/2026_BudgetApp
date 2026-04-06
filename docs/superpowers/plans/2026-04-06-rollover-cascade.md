# Rollover Cascade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add confirmation dialog and cascade logic when rolling over budget entries to months that already have data.

**Architecture:** GET endpoint checks if next month has entries. POST endpoint accepts `mode` parameter (`create` or `update`). `update` mode only changes `rolledOver` and cascades forward. UI uses native `confirm()` dialog (consistent with existing codebase patterns).

**Tech Stack:** Next.js API routes, Prisma, React (TanStack Query mutations), native confirm()

**Spec:** `docs/superpowers/specs/2026-04-06-rollover-cascade-design.md`

---

### Task 1: Add GET handler to check for existing entries

**Files:**
- Modify: `src/app/api/accounts/[id]/budget/[year]/[month]/rollover/route.ts`

- [ ] **Step 1: Add GET handler**

Add a GET export above the existing POST. It checks if the next month already has BudgetEntries for this account's categories.

```typescript
export const GET = withHandler(async (_, ctx) => {
  const { id, year: yearStr, month: monthStr } = await (ctx as { params: Promise<{ id: string; year: string; month: string }> }).params
  const year = parseInt(yearStr)
  const month = parseInt(monthStr)

  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year

  const groups = await prisma.categoryGroup.findMany({
    where: { accountId: id },
    include: {
      categories: { where: { isActive: true, rolloverEnabled: true }, select: { id: true } },
    },
  })
  const categoryIds = groups.flatMap(g => g.categories.map(c => c.id))

  const existingCount = await prisma.budgetEntry.count({
    where: { year: nextYear, month: nextMonth, categoryId: { in: categoryIds } },
  })

  return NextResponse.json({
    nextMonth,
    nextYear,
    hasExistingEntries: existingCount > 0,
    existingCount,
  })
})
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | grep -E "error|Error|✓" | head -5`
Expected: `✓ Compiled successfully`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/accounts/\[id\]/budget/\[year\]/\[month\]/rollover/route.ts
git commit -m "feat: add GET handler to check for existing rollover entries"
```

---

### Task 2: Refactor POST handler to support mode parameter and cascade

**Files:**
- Modify: `src/app/api/accounts/[id]/budget/[year]/[month]/rollover/route.ts`

- [ ] **Step 1: Add z import and parse mode from body**

Add `import { z } from 'zod'` at the top. Change the POST handler to read `mode` from the request body:

```typescript
export const POST = withHandler(async (request: Request, ctx) => {
  const { id, year: yearStr, month: monthStr } = await (ctx as { params: Promise<{ id: string; year: string; month: string }> }).params
  const year = parseInt(yearStr)
  const month = parseInt(monthStr)

  // Parse mode — default to 'create' for backwards compatibility
  let mode: 'create' | 'update' = 'create'
  try {
    const body = await request.json()
    mode = z.enum(['create', 'update']).parse(body.mode)
  } catch {
    // No body or invalid mode → default 'create'
  }
```

- [ ] **Step 2: Extract helper function for computing rollovers for a single month**

Add this helper function ABOVE the GET/POST exports in the same file:

```typescript
async function computeRollovers(accountId: string, year: number, month: number) {
  const startOfMonth = new Date(year, month - 1, 1)
  const endOfMonth = new Date(year, month, 0, 23, 59, 59)

  const groups = await prisma.categoryGroup.findMany({
    where: { accountId },
    include: {
      categories: { where: { isActive: true, rolloverEnabled: true }, select: { id: true } },
    },
  })
  const categoryIds = groups.flatMap(g => g.categories.map(c => c.id))

  const budgetEntries = await prisma.budgetEntry.findMany({
    where: { year, month, categoryId: { in: categoryIds } },
  })
  const budgetMap = new Map(budgetEntries.map(e => [e.categoryId, e]))

  const activityRows = await prisma.$queryRaw<Array<{ categoryId: string; total: number }>>`
    SELECT categoryId, SUM(COALESCE(mainAmount, 0)) as total
    FROM "Transaction"
    WHERE accountId = ${accountId}
      AND date >= ${startOfMonth}
      AND date <= ${endOfMonth}
      AND categoryId IS NOT NULL
    GROUP BY categoryId
  `
  const activityMap = new Map(activityRows.map(a => [a.categoryId, a.total]))

  return categoryIds.map(catId => {
    const entry = budgetMap.get(catId)
    const budgeted = entry?.budgeted ?? 0
    const rolledOver = entry?.rolledOver ?? 0
    const activity = activityMap.get(catId) ?? 0
    const available = rolledOver + activity - budgeted
    return { categoryId: catId, available, budgeted }
  })
}
```

- [ ] **Step 3: Rewrite POST handler with mode support and cascade**

Replace the rest of the POST handler (after mode parsing) with:

```typescript
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year

  // Compute rollovers for current month
  const rollovers = await computeRollovers(id, year, month)
  const categoryIds = rollovers.map(r => r.categoryId)

  if (mode === 'create') {
    // Original behavior: set both rolledOver and budgeted
    await prisma.$transaction(
      rollovers.map(r =>
        prisma.budgetEntry.upsert({
          where: { categoryId_month_year: { categoryId: r.categoryId, month: nextMonth, year: nextYear } },
          update: { rolledOver: r.available, budgeted: r.budgeted },
          create: { categoryId: r.categoryId, month: nextMonth, year: nextYear, rolledOver: r.available, budgeted: r.budgeted },
        })
      )
    )
    return NextResponse.json({ success: true, nextMonth, nextYear, entries: rollovers.length, cascadedMonths: 0 })
  }

  // mode === 'update': only set rolledOver, then cascade
  let cascadedMonths = 0
  let currentRollovers = rollovers
  let targetMonth = nextMonth
  let targetYear = nextYear

  while (true) {
    // Check if target month has entries
    const existingCount = await prisma.budgetEntry.count({
      where: { year: targetYear, month: targetMonth, categoryId: { in: categoryIds } },
    })

    if (existingCount === 0 && cascadedMonths > 0) break // No more entries to cascade into

    // Update only rolledOver in target month
    await prisma.$transaction(
      currentRollovers.map(r => {
        if (existingCount === 0) {
          // First month without entries: create with budgeted from source
          return prisma.budgetEntry.upsert({
            where: { categoryId_month_year: { categoryId: r.categoryId, month: targetMonth, year: targetYear } },
            update: { rolledOver: r.available },
            create: { categoryId: r.categoryId, month: targetMonth, year: targetYear, rolledOver: r.available, budgeted: r.budgeted },
          })
        }
        return prisma.budgetEntry.updateMany({
          where: { categoryId: r.categoryId, month: targetMonth, year: targetYear },
          data: { rolledOver: r.available },
        })
      })
    )
    cascadedMonths++

    // Prepare next iteration: recompute available for target month with updated rolledOver
    currentRollovers = await computeRollovers(id, targetYear, targetMonth)

    // Advance to next month
    if (targetMonth === 12) {
      targetMonth = 1
      targetYear++
    } else {
      targetMonth++
    }

    // Check if next month has entries to cascade into
    const nextExisting = await prisma.budgetEntry.count({
      where: { year: targetYear, month: targetMonth, categoryId: { in: categoryIds } },
    })
    if (nextExisting === 0) break
  }

  return NextResponse.json({ success: true, nextMonth, nextYear, entries: rollovers.length, cascadedMonths })
})
```

- [ ] **Step 4: Verify build**

Run: `npm run build 2>&1 | grep -E "error|Error|✓" | head -5`
Expected: `✓ Compiled successfully`

- [ ] **Step 5: Commit**

```bash
git add src/app/api/accounts/\[id\]/budget/\[year\]/\[month\]/rollover/route.ts
git commit -m "feat: add mode parameter and cascade logic to rollover POST"
```

---

### Task 3: Update UI with confirmation flow

**Files:**
- Modify: `src/components/accounts/AccountBudgetTab.tsx`

- [ ] **Step 1: Add check query and update rollover mutation**

Replace the existing `rolloverMutation` (lines 357-366) with the check + confirm flow:

```typescript
  const rolloverCheck = useMutation({
    mutationFn: () =>
      fetch(`/api/accounts/${accountId}/budget/${budgetYear}/${budgetMonth}/rollover`).then(r => r.json()),
  })

  const rolloverMutation = useMutation({
    mutationFn: (mode: 'create' | 'update') =>
      fetch(`/api/accounts/${accountId}/budget/${budgetYear}/${budgetMonth}/rollover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      }).then(r => r.json()),
    onSuccess: (d) => {
      const msg = d.cascadedMonths > 0
        ? `Übertrag für ${d.entries} Kategorien aktualisiert (${d.cascadedMonths} Folgemonate)`
        : `Übertrag für ${d.entries} Kategorien in ${d.nextMonth}/${d.nextYear} gespeichert`
      toast.success(msg)
      qc.invalidateQueries({ queryKey: ['account-budget'] })
      qc.invalidateQueries({ queryKey: ['budget'] })
    },
    onError: () => toast.error('Fehler beim Übertrag'),
  })

  const handleRollover = async () => {
    try {
      const check = await rolloverCheck.mutateAsync()
      if (!check.hasExistingEntries) {
        rolloverMutation.mutate('create')
      } else {
        const ok = confirm(
          `Im Folgemonat (${check.nextMonth}/${check.nextYear}) existieren bereits ${check.existingCount} Budgetvorgaben.\n\nSollen die Überträge aktualisiert werden? Die monatlichen Budgets bleiben unverändert.`
        )
        if (ok) rolloverMutation.mutate('update')
      }
    } catch {
      toast.error('Fehler beim Prüfen des Folgemonats')
    }
  }
```

- [ ] **Step 2: Update the button to use handleRollover**

Replace the Übertrag button (lines 431-439) — change `onClick` and `disabled`:

```typescript
          <Button
            variant="outline"
            size="sm"
            onClick={handleRollover}
            disabled={rolloverMutation.isPending || rolloverCheck.isPending}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Übertrag
          </Button>
```

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | grep -E "error|Error|✓" | head -5`
Expected: `✓ Compiled successfully`

- [ ] **Step 4: Commit**

```bash
git add src/components/accounts/AccountBudgetTab.tsx
git commit -m "feat: add rollover confirmation dialog and cascade UI"
```

---

### Task 4: Manual verification

- [ ] **Step 1: Test create mode**

1. Navigate to an account budget tab
2. Go to a month where the next month has NO budget entries
3. Click "Übertrag" → should work immediately (no dialog)
4. Check next month: both `rolledOver` and `budgeted` are set

- [ ] **Step 2: Test update mode**

1. Go back to the same month
2. Click "Übertrag" again → should show confirm dialog
3. Click "Abbrechen" → nothing changes
4. Click "Übertrag" again → click OK
5. Check next month: `rolledOver` updated, `budgeted` unchanged

- [ ] **Step 3: Test cascade**

1. Do "Übertrag" for months M, M+1, M+2 (so M+3 has entries)
2. Go back to month M, modify a budget value
3. Click "Übertrag" → confirm
4. Check M+1, M+2, M+3: all `rolledOver` values recalculated, `budgeted` untouched

- [ ] **Step 4: Final commit and push**

```bash
git push
```
