# Category Rollover Flag — Design Spec

**Date:** 2026-03-29
**Status:** Approved

## Summary

Add a per-category boolean flag `rolloverEnabled` that controls whether the "Übertrag" button transfers both the budgeted value and the remaining available balance to the next month. Applies to EXPENSE and INCOME categories.

## Background

The rollover button (`POST /api/accounts/[id]/budget/[year]/[month]/rollover`) currently always rolls over all EXPENSE categories and never rolls over INCOME categories. There is no per-category control. Users need to selectively disable rollover for categories where carry-forward is not meaningful (e.g. one-time income).

## Data Model

### Schema change

```sql
ALTER TABLE Category ADD COLUMN rolloverEnabled BOOLEAN NOT NULL DEFAULT 1;
```

- All existing categories get `rolloverEnabled = 1` (active) — no data migration needed.
- Add `rolloverEnabled Boolean @default(true)` to the `Category` model in `prisma/schema.prisma`
- Regenerate Prisma client: `npx prisma generate`

## API Changes

### `POST /api/categories`

- Accept optional `rolloverEnabled: boolean` (default: `true`)
- Persist to DB

### `PUT /api/categories/[id]`

- Accept optional `rolloverEnabled: boolean`
- Update in DB

### `POST /api/accounts/[id]/budget/[year]/[month]/rollover`

Current behaviour:
- Loads only `type: 'EXPENSE'` categories
- Always rolls over all of them

New behaviour:
- Loads all categories (EXPENSE **and** INCOME) with `rolloverEnabled: true`
- Rolls over budgeted value and available balance for each matching category
- TRANSFER categories are excluded (they have no budget semantics)

## UI Changes

File: `src/components/accounts/AccountBudgetConfig.tsx`

### `Category` interface

Add field:
```ts
rolloverEnabled: boolean
```

### `NewCategoryForm`

- Add checkbox "Übertrag aktivieren" (default: checked)
- Positioned below the type dropdown
- Value sent in POST body as `rolloverEnabled`

### `EditCategoryForm`

- Add checkbox "Übertrag aktivieren"
- Initialised from `category.rolloverEnabled`
- Value sent in PUT body as `rolloverEnabled`

### `SortableCategoryRow` (display only)

No visual indicator needed — the checkbox is only shown in the edit form.

## Behaviour Details

- When `rolloverEnabled = false`: the category is completely skipped by the rollover button. No `budgeted` and no `rolledOver` is written to the next month's `BudgetEntry`.
- When `rolloverEnabled = true`: existing rollover logic applies unchanged (`rolledOver = available`, `budgeted` copied).
- The rollover button processes all accounts' categories that have `rolloverEnabled = true`, regardless of whether they are EXPENSE or INCOME type.

## Out of Scope

- Automatic rollover (without clicking the button) — not part of this spec
- Per-month override of the flag — not needed
- Visual indicator in the budget table row — not requested
