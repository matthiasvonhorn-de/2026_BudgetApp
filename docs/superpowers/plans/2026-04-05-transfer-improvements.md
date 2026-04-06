# Transfer Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the transfer (Umbuchung) dialog to support source/target type selection (Hauptkonto or Unterkonto) with mandatory group/category fields, and restrict editing of transfers to amount-only.

**Architecture:** Overhaul the TRANSFER section in TransactionFormDialog with dual source/target type selection. Extend the POST handler to create properly structured paired transactions for all 4 combinations (HK→HK, HK→UK, UK→HK, UK→UK). Transfer edit limited to amount only. Delete already works (transferToId pairing).

**Tech Stack:** Next.js 14 App Router, Prisma v7 + SQLite, TanStack Query, Zod, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-04-05-transfer-improvements-design.md`

**Conventions:**
- Select dropdowns: Use `<AppSelect>` or raw `<Select>` with `items` prop for label resolution
- Currency: Use `useFormatCurrency()` hook
- Monetary writes: Use `roundCents()` from `@/lib/money`, `balanceIncrement()` for balance updates

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/schemas/transactions.ts` | Modify | Add transfer-specific fields to createTransactionSchema |
| `src/app/api/transactions/route.ts` | Modify | POST handler: create paired transactions for all 4 combinations |
| `src/components/transactions/TransactionFormDialog.tsx` | Modify | TRANSFER section: source/target type selection with conditional fields |

---

## Task 1: Extend Schema

**Files:**
- Modify: `src/lib/schemas/transactions.ts`

- [ ] **Step 1: Add transfer-specific fields to createTransactionSchema**

Add these fields to `createTransactionSchema` (after the existing `skipPairedTransfer` field):

```typescript
  // Transfer-specific fields
  transferTargetAccountId: z.string().optional(),
  transferTargetType: z.enum(['MAIN', 'SUB']).optional(),
  transferTargetCategoryId: z.string().optional().nullable(),
  transferTargetGroupId: z.string().optional(),
  sourceType: z.enum(['MAIN', 'SUB']).optional(),
  sourceGroupId: z.string().optional(),
  sourceCategoryId: z.string().optional().nullable(),
```

- [ ] **Step 2: Verify build**

Run: `node node_modules/typescript/bin/tsc --noEmit 2>&1 | grep -v "03-laufzeit" | head -10`

- [ ] **Step 3: Commit**

```bash
git add src/lib/schemas/transactions.ts
git commit -m "feat: add transfer-specific fields to transaction schema"
```

---

## Task 2: Overhaul POST Handler for Transfers

**Files:**
- Modify: `src/app/api/transactions/route.ts`

This is the core change. The current POST handler delegates transfer logic to `createEntryFromTransaction`. The new logic handles all 4 combinations directly.

- [ ] **Step 1: Read the current POST handler and rewrite the transfer section**

The current transfer logic (lines ~130-158) uses `createEntryFromTransaction` with `linkType === 'TRANSFER'`. Replace it with explicit handling of the 4 combinations.

After the source transaction is created and the source balance updated, add this transfer logic:

```typescript
    // === TRANSFER HANDLING ===
    if (data.transferTargetAccountId && data.sourceType && data.transferTargetType) {
      const sourceIsMain = data.sourceType === 'MAIN'
      const targetIsMain = data.transferTargetType === 'MAIN'
      const amount = Math.abs(data.mainAmount ?? data.subAmount ?? 0)

      // ── Source transaction: already created as `t` above ──
      // Adjust source transaction fields based on sourceType
      const sourceMainAmount = sourceIsMain ? -amount : null
      const sourceMainType = sourceIsMain ? 'EXPENSE' : 'INCOME'
      const sourceSubAmount = sourceIsMain ? null : -amount
      const sourceSubType = sourceIsMain ? null : 'EXPENSE'
      const sourceCategoryId = data.sourceCategoryId || data.categoryId || null

      await tx.transaction.update({
        where: { id: t.id },
        data: {
          mainAmount: sourceMainAmount,
          mainType: sourceMainType,
          subAmount: sourceSubAmount,
          subType: sourceSubType,
          categoryId: sourceCategoryId,
        },
      })

      // If source is sub-account, create entry
      let sourceEntryId: string | null = null
      if (!sourceIsMain && data.sourceGroupId) {
        const sourceEntry = await tx.subAccountEntry.create({
          data: {
            date: new Date(data.date),
            description: data.description,
            amount: sourceSubAmount!,
            fromBudget: false,
            groupId: data.sourceGroupId,
          },
        })
        sourceEntryId = sourceEntry.id
        await tx.transaction.update({
          where: { id: t.id },
          data: { subAccountEntryId: sourceEntryId },
        })
      }

      // Recalculate source balance (the initial balance update used wrong values)
      // Undo the initial update and apply correct one
      const initialBalanceDelta = (data.mainAmount ?? 0) + (data.subAmount ?? 0)
      const correctSourceDelta = (sourceMainAmount ?? 0) + (sourceSubAmount ?? 0)
      if (initialBalanceDelta !== correctSourceDelta) {
        await tx.account.update({
          where: { id: data.accountId },
          data: { currentBalance: balanceIncrement(correctSourceDelta - initialBalanceDelta) },
        })
      }

      // ── Target transaction ──
      const targetMainAmount = targetIsMain ? amount : null
      const targetMainType = targetIsMain ? 'INCOME' : 'INCOME'
      const targetSubAmount = targetIsMain ? null : amount
      const targetSubType = targetIsMain ? null : 'INCOME'
      const targetCategoryId = data.transferTargetCategoryId || null

      const paired = await tx.transaction.create({
        data: {
          date: new Date(data.date),
          mainAmount: targetMainAmount,
          mainType: targetMainType,
          subAmount: targetSubAmount,
          subType: targetSubType,
          description: data.description,
          accountId: data.transferTargetAccountId,
          categoryId: targetCategoryId,
          status: data.status ?? 'PENDING',
        },
      })

      // If target is sub-account, create entry
      if (!targetIsMain && data.transferTargetGroupId) {
        const targetEntry = await tx.subAccountEntry.create({
          data: {
            date: new Date(data.date),
            description: data.description,
            amount: targetSubAmount!,
            fromBudget: false,
            groupId: data.transferTargetGroupId,
          },
        })
        await tx.transaction.update({
          where: { id: paired.id },
          data: { subAccountEntryId: targetEntry.id },
        })
      }

      // Link the pair
      await tx.transaction.update({
        where: { id: t.id },
        data: { transferToId: paired.id },
      })

      // Update target account balance
      const targetDelta = (targetMainAmount ?? 0) + (targetSubAmount ?? 0)
      if (targetDelta !== 0) {
        await tx.account.update({
          where: { id: data.transferTargetAccountId },
          data: { currentBalance: balanceIncrement(targetDelta) },
        })
      }

      return { ...t, mainAmount: sourceMainAmount, mainType: sourceMainType, subAmount: sourceSubAmount, subType: sourceSubType, transferToId: paired.id }
    }
```

This replaces the existing `createEntryFromTransaction` TRANSFER logic. Keep the existing entry logic for non-transfer categories (the `if (linkedGroup && !data.skipSubAccountEntry && data.mainAmount != null)` block).

- [ ] **Step 2: Verify build**

Run: `node node_modules/typescript/bin/tsc --noEmit 2>&1 | grep -v "03-laufzeit" | head -10`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/transactions/route.ts
git commit -m "feat: handle all 4 transfer combinations in POST handler"
```

---

## Task 3: Overhaul Transfer UI in Dialog

**Files:**
- Modify: `src/components/transactions/TransactionFormDialog.tsx`

This is the largest change. The TRANSFER section needs to be completely rewritten.

- [ ] **Step 1: Add new state variables for transfer**

Add after the existing transfer state variables:

```typescript
  const [sourceType, setSourceType] = useState<'MAIN' | 'SUB'>('MAIN')
  const [targetType, setTargetType] = useState<'MAIN' | 'SUB'>('MAIN')
  const [sourceGroupId, setSourceGroupId] = useState('')     // SubAccountGroup for source UK
  const [sourceCatGroupId, setSourceCatGroupId] = useState('') // CategoryGroup for source HK
  const [sourceCategoryId, setSourceCategoryId] = useState('')
  const [targetCatGroupId, setTargetCatGroupId] = useState('')
  const [targetCategoryId, setTargetCategoryId] = useState('')
```

- [ ] **Step 2: Add queries for source account category groups and sub-account groups**

```typescript
  const watchedSourceAccountId = form.watch('accountId')

  // Source account: category groups (for HK selection)
  const { data: sourceCategoryGroups = [] } = useQuery<CategoryGroup[]>({
    queryKey: ['category-groups', watchedSourceAccountId],
    queryFn: () => fetch(`/api/category-groups?accountId=${watchedSourceAccountId}`).then(r => r.json()),
    enabled: !!watchedSourceAccountId && currentType === 'TRANSFER' && sourceType === 'MAIN',
  })

  // Source account: sub-account groups (for UK selection)
  const sourceSubGroups = subAccountGroups.filter(
    g => g.subAccount.account.id === watchedSourceAccountId,
  )

  // Target account: category groups (for HK selection)
  const { data: targetCategoryGroups = [] } = useQuery<CategoryGroup[]>({
    queryKey: ['category-groups', transferTargetId],
    queryFn: () => fetch(`/api/category-groups?accountId=${transferTargetId}`).then(r => r.json()),
    enabled: !!transferTargetId && currentType === 'TRANSFER' && targetType === 'MAIN',
  })

  // Target account: sub-account groups (already exists as targetAccountSubGroups)
```

- [ ] **Step 3: Determine allowed types when same account selected**

```typescript
  const isSameAccount = watchedSourceAccountId && transferTargetId && watchedSourceAccountId === transferTargetId

  // When same account: both must be same type (HK+HK or UK+UK), no HK↔UK
  // Force type sync when same account
  useEffect(() => {
    if (isSameAccount) {
      setTargetType(sourceType)
    }
  }, [isSameAccount, sourceType])
```

- [ ] **Step 4: Replace the TRANSFER form section**

Replace the entire `currentType === 'TRANSFER' ? (...)` block with the new UI:

```
Von Konto [Select]
Buchungsart Quelle: [Hauptkonto | Unterkonto] (Select or Radio)
  If Hauptkonto: Gruppe [Select, required] → Kategorie [Select, required]
  If Unterkonto: Gruppe [Select from SubAccountGroups, required]

Auf Konto [Select]
Buchungsart Ziel: [Hauptkonto | Unterkonto] (Select or Radio)
  If Hauptkonto: Gruppe [Select, required] → Kategorie [Select, required]
  If Unterkonto: Gruppe [Select from SubAccountGroups, required]
```

Use `<Select>` with `items` prop for all dropdowns (label resolution). Mark SubAccountGroup selects and CategoryGroup/Category selects as required (user cannot proceed without selection).

When `isSameAccount` is true and `sourceType === 'MAIN'`, hide the target type selector and auto-set to 'MAIN'. Same for 'SUB'.

- [ ] **Step 5: Update the createMutation to send transfer fields**

In the `createMutation.mutationFn`, when `currentType === 'TRANSFER'`:

```typescript
      if (values.mainType === 'TRANSFER') {
        const amount = Math.abs(values.amount)
        const res = await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: values.date,
            mainAmount: sourceType === 'MAIN' ? -amount : null,
            mainType: sourceType === 'MAIN' ? 'EXPENSE' : 'INCOME',
            subAmount: sourceType === 'SUB' ? -amount : null,
            subType: sourceType === 'SUB' ? 'EXPENSE' : null,
            description: values.description,
            accountId: values.accountId,
            categoryId: sourceType === 'MAIN' ? sourceCategoryId : null,
            sourceType,
            sourceGroupId: sourceType === 'SUB' ? sourceGroupId : undefined,
            sourceCategoryId: sourceType === 'MAIN' ? sourceCategoryId : undefined,
            transferTargetAccountId: transferTargetId,
            transferTargetType: targetType,
            transferTargetCategoryId: targetType === 'MAIN' ? targetCategoryId : undefined,
            transferTargetGroupId: targetType === 'SUB' ? transferGroupId : undefined,
          }),
        })
        if (!res.ok) throw new Error('Fehler')
        return res.json()
      }
```

- [ ] **Step 6: Update edit dialog for transfer transactions**

When editing a transfer transaction (`editTransaction?.transferToId != null`), show:
- All fields read-only (account, categories, groups shown as text)
- Only amount editable
- Update mutation sends only `{ mainAmount }` or `{ subAmount }` depending on which side has a value

- [ ] **Step 7: Reset transfer state in handleTypeChange and handleClose**

In `handleTypeChange`:
```typescript
    setSourceType('MAIN')
    setTargetType('MAIN')
    setSourceGroupId('')
    setSourceCatGroupId('')
    setSourceCategoryId('')
    setTargetCatGroupId('')
    setTargetCategoryId('')
```

Same in `handleClose`.

- [ ] **Step 8: Verify build**

Run: `node node_modules/typescript/bin/tsc --noEmit 2>&1 | grep -v "03-laufzeit" | head -10`

- [ ] **Step 9: Commit**

```bash
git add src/components/transactions/TransactionFormDialog.tsx
git commit -m "feat: overhaul transfer UI with source/target type selection"
```

---

## Task 4: Push + Draft PR

- [ ] **Step 1: Push**

```bash
git push -u origin feature/transfer-improvements
```

- [ ] **Step 2: Create draft PR**

```bash
gh pr create --draft --title "feat: improved transfer with HK/UK source/target selection" --body "$(cat <<'EOF'
## Summary
- Transfer dialog: select Hauptkonto or Unterkonto per side
- Hauptkonto: mandatory group + category selection
- Unterkonto: mandatory SubAccountGroup selection
- 4 combinations across accounts: HK→HK, HK→UK, UK→HK, UK→UK
- Same account: HK→HK and UK→UK allowed, HK↔UK forbidden
- Edit transfers: only amount changeable, all other fields read-only
- Delete transfers: always deletes both paired transactions

## Spec
docs/superpowers/specs/2026-04-05-transfer-improvements-design.md

## Test plan
- [ ] Transfer HK→HK between different accounts
- [ ] Transfer HK→UK between different accounts
- [ ] Transfer UK→HK between different accounts
- [ ] Transfer UK→UK between different accounts
- [ ] Transfer UK→UK within same account
- [ ] Transfer HK→HK within same account
- [ ] Verify HK↔UK within same account is blocked
- [ ] Edit transfer: only amount editable
- [ ] Delete transfer: both transactions removed
- [ ] Verify balances correct after all operations

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
