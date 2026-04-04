# Unified Account Create/Edit Dialog

**Date:** 2026-04-04
**Status:** Draft

## Problem

The app currently has two separate dialogs for creating accounts:

1. **AccountFormDialog** -- creates/edits CHECKING, SAVINGS, CREDIT_CARD, CASH, INVESTMENT
2. **SavingsFormDialog** -- creates SPARPLAN, FESTGELD (no edit support)

Additionally, editing a savings account requires navigating to a full page (`/savings/[id]/edit`). This causes several issues:

- Two "add" buttons on the settings page confuses users
- Clicking "edit" on a SPARPLAN account opens the wrong dialog (AccountFormDialog, which shows wrong fields)
- Editing savings accounts is inconsistent with editing regular accounts (page vs. dialog)

## Goal

Replace both dialogs with a single **UnifiedAccountFormDialog** that handles all 7 account types for both create and edit.

---

## Component Structure

### Single component, conditional sections

The dialog is one component: `src/components/accounts/AccountFormDialog.tsx` (replaces the existing file).

Internally it renders three logical sections based on the selected account type:

```
AccountFormDialog
 +-- [Section 1] Type selector (all 7 types)
 +-- [Section 2] Common fields (name, bank, IBAN, color)
 +-- [Section 3a] Regular fields (currentBalance)        -- when CHECKING|SAVINGS|CREDIT_CARD|CASH|INVESTMENT
 +-- [Section 3b] Savings fields (savings-specific)       -- when SPARPLAN|FESTGELD
      +-- Sparplan-only fields (sparrate, linked account, category, bezahlt bis)
```

No separate sub-components -- the conditional rendering is straightforward with `{isSavings && (...)}` blocks, similar to how SavingsFormDialog already handles SPARPLAN vs FESTGELD.

### State management

Use `useState` (not react-hook-form) for the form state, matching the pattern already used in SavingsFormDialog. This is simpler for a form with many conditional fields and avoids issues with Zod v4 + rhf + dynamic schemas.

```ts
interface UnifiedAccountForm {
  // Common
  type: AccountType
  name: string
  bank: string
  iban: string
  color: string

  // Regular accounts only
  currentBalance: string

  // Savings accounts only
  initialBalance: string
  upfrontFee: string
  interestRate: string
  interestFrequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY'
  startDate: string
  termMonths: string
  notes: string
  initializedUntil: string

  // SPARPLAN only
  contributionAmount: string
  contributionFrequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY'
  linkedAccountId: string
  categoryId: string
}
```

### Props

```ts
interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  account?: Account  // If provided, edit mode
}
```

In edit mode:
- The type selector is **disabled** (greyed out, not changeable)
- For SPARPLAN/FESTGELD accounts, the component fetches SavingsConfig data via `GET /api/savings/{account.id}` to populate the savings-specific fields

---

## Type Selector

All 7 types shown as a `<Select>`:

| Value         | Label        |
|---------------|--------------|
| CHECKING      | Girokonto    |
| SAVINGS       | Sparkonto    |
| CREDIT_CARD   | Kreditkarte  |
| CASH          | Bargeld      |
| INVESTMENT    | Depot        |
| SPARPLAN      | Sparplan     |
| FESTGELD      | Festgeld     |

In edit mode: the select is `disabled` and shows the current type.

---

## Field Visibility by Type

| Field                 | CHECKING/SAVINGS/CREDIT_CARD/CASH/INVESTMENT | SPARPLAN | FESTGELD |
|-----------------------|----------------------------------------------|----------|----------|
| Name                  | yes                                          | yes      | yes      |
| Bank                  | yes                                          | no       | no       |
| IBAN / Kontonummer    | yes                                          | yes      | yes      |
| Farbe                 | yes                                          | yes      | yes      |
| Aktueller Saldo       | yes                                          | no       | no       |
| Startkapital          | no (create only: yes via currentBalance)     | yes      | no       |
| Einlagenbetrag        | no                                           | no       | yes      |
| Abschlussgebühr       | no                                           | yes      | yes      |
| Zinssatz p.a.         | no                                           | yes      | yes      |
| Zinsgutschrift        | no                                           | yes      | yes      |
| Startdatum            | no                                           | yes      | yes      |
| Laufzeit (Monate)     | no                                           | yes      | yes      |
| Sparrate              | no                                           | yes      | no       |
| Einzahlungsfrequenz   | no                                           | yes      | no       |
| Verk. Girokonto       | no                                           | yes      | no       |
| Buchungskategorie     | no                                           | yes (if linked) | no |
| Bezahlt bis           | no                                           | yes      | yes      |
| Notizen               | no                                           | yes      | yes      |

**Edit mode for SPARPLAN/FESTGELD**: Some fields are read-only or hidden because they cannot be changed after creation (they affect the generated schedule):
- **Not editable after creation**: Startkapital/Einlagenbetrag, Sparrate, Sparfrequenz, Startdatum, Laufzeit (these are schedule-defining parameters)
- **Editable after creation**: Name, Farbe, IBAN, Zinssatz, Abschlussgebühr, Verknuepftes Girokonto, Buchungskategorie, Notizen, Bezahlt bis

This matches the existing `updateSavingsSchema` which only allows: name, color, accountNumber, interestRate, upfrontFee, linkedAccountId, categoryId, notes, initializedUntil.

---

## API Calls

### Create

| Type                                        | Endpoint           | Method |
|---------------------------------------------|--------------------|--------|
| CHECKING, SAVINGS, CREDIT_CARD, CASH, INVESTMENT | `POST /api/accounts` | POST   |
| SPARPLAN, FESTGELD                          | `POST /api/savings`  | POST   |

### Edit

| Type                                        | Endpoint                    | Method |
|---------------------------------------------|-----------------------------|--------|
| CHECKING, SAVINGS, CREDIT_CARD, CASH, INVESTMENT | `PUT /api/accounts/{id}` | PUT    |
| SPARPLAN, FESTGELD                          | `PUT /api/savings/{id}`      | PUT    |

### Loading data for edit

- Regular accounts: Data comes from the `account` prop (already has all fields).
- SPARPLAN/FESTGELD: The `account` prop has basic info (name, type, color, etc.), but savings-specific fields (interestRate, contributionAmount, etc.) live in `SavingsConfig`. The dialog fetches this with:

```ts
const { data: savingsConfig } = useQuery({
  queryKey: ['savings', account?.id],
  queryFn: () => fetch(`/api/savings/${account!.id}`).then(r => r.json()),
  enabled: open && isEdit && isSavingsType(account?.type),
})
```

Once `savingsConfig` loads, the form is populated with its fields. A loading state is shown while fetching.

### Mutation payload construction

The `mutationFn` branches based on type:

```ts
const isSavings = ['SPARPLAN', 'FESTGELD'].includes(form.type)

if (isEdit) {
  if (isSavings) {
    // PUT /api/savings/{id} with updateSavingsSchema fields
    await fetch(`/api/savings/${account.id}`, { method: 'PUT', body: ... })
  } else {
    // PUT /api/accounts/{id} with updateAccountSchema fields
    await fetch(`/api/accounts/${account.id}`, { method: 'PUT', body: ... })
  }
} else {
  if (isSavings) {
    // POST /api/savings with createSavingsSchema fields
    await fetch('/api/savings', { method: 'POST', body: ... })
  } else {
    // POST /api/accounts with createAccountSchema fields
    await fetch('/api/accounts', { method: 'POST', body: ... })
  }
}
```

### Query invalidation

After successful mutation:
```ts
queryClient.invalidateQueries({ queryKey: ['accounts'] })
if (isSavings) {
  queryClient.invalidateQueries({ queryKey: ['savings'] })
}
```

---

## What to Keep, Remove, Modify

### Remove

| File | Reason |
|------|--------|
| `src/components/accounts/SavingsFormDialog.tsx` | Replaced by unified dialog |
| `src/app/(app)/savings/[id]/edit/page.tsx` | Edit now happens in the dialog |

### Modify

| File | Change |
|------|--------|
| `src/components/accounts/AccountFormDialog.tsx` | **Complete rewrite** -- becomes the unified dialog with all 7 types, conditional sections, and dual API endpoint handling |
| `src/app/(app)/settings/general/page.tsx` | Remove SavingsFormDialog import, remove `savingsDialog` state, remove second "Sparkonto / Festgeld" button, keep single "Konto hinzufügen" button |
| `src/app/(app)/savings/[id]/page.tsx` | Change "Bearbeiten" link: instead of `href={/savings/${id}/edit}`, open the unified dialog with the account data (need to add dialog state to this page, or change the link to navigate to settings page -- **see below**) |

### Keep (no changes)

| File | Reason |
|------|--------|
| `src/app/api/accounts/route.ts` | API unchanged |
| `src/app/api/accounts/[id]/route.ts` | API unchanged |
| `src/app/api/savings/route.ts` | API unchanged |
| `src/app/api/savings/[id]/route.ts` | API unchanged |
| `src/lib/schemas/accounts.ts` | Schema unchanged |
| `src/lib/schemas/savings.ts` | Schema unchanged |
| `src/lib/savings/service.ts` | Service unchanged |
| `src/types/api.ts` | Types unchanged |

---

## Savings Detail Page Edit Button

The savings detail page (`/savings/[id]/page.tsx`) currently links to `/savings/[id]/edit`. Two options:

**Option A (recommended): Add dialog state to the savings detail page.**
Import `AccountFormDialog`, add `useState` for dialog open/close, pass the account data. The "Bearbeiten" button opens the dialog inline. This is the same pattern as the settings page.

**Option B: Keep the edit page.**
Leave `/savings/[id]/edit/page.tsx` in place but refactor it to also use the unified dialog. This adds no value since the dialog already handles everything.

**Decision: Option A.** Remove the edit page, add the dialog to the savings detail page.

---

## Dialog Layout

```
+------------------------------------------+
|  Konto bearbeiten / Neues Konto          |
+------------------------------------------+
|                                          |
|  Kontotyp:  [Girokonto       v]         |
|                                          |
|  --- Allgemein ---                       |
|  Name *:    [________________]  Farbe [#]|
|  Bank:      [________________]           |
|  IBAN:      [________________]           |
|                                          |
|  --- (Regular types only) ---            |
|  Aktueller Saldo: [________]            |
|                                          |
|  --- (SPARPLAN/FESTGELD only) ---        |
|  Startkapital:        [________]         |
|  Abschlussgebuehr:    [________]         |
|  Zinssatz:  [______] Zinsgutschr: [___v] |
|  Startdatum: [______] Laufzeit: [______] |
|                                          |
|  --- (SPARPLAN only) ---                 |
|  Sparrate:  [______] Frequenz:   [___v]  |
|  Verk. Girokonto:     [___________v]     |
|  Buchungskategorie:   [___________v]     |
|                                          |
|  --- (SPARPLAN/FESTGELD only) ---        |
|  Bezahlt bis: [__________]               |
|  Notizen:     [__________]               |
|                                          |
|                [Abbrechen] [Speichern]   |
+------------------------------------------+
```

The dialog uses `max-w-lg max-h-[90vh] overflow-y-auto` (same as SavingsFormDialog currently).

---

## Implementation Steps

1. **Rewrite `AccountFormDialog.tsx`** with the unified form
   - Type selector with all 7 types
   - Common fields section
   - Conditional regular-only section (currentBalance)
   - Conditional savings section (all savings fields, with SPARPLAN-only subsection)
   - Fetch SavingsConfig in edit mode for savings types
   - Branch mutation to correct API endpoint
   - Edit-mode restrictions (type disabled, creation-only fields hidden)

2. **Update settings page** (`settings/general/page.tsx`)
   - Remove SavingsFormDialog import and state
   - Remove second button
   - Keep single "Konto hinzufuegen" button

3. **Update savings detail page** (`savings/[id]/page.tsx`)
   - Import AccountFormDialog
   - Add dialog state
   - Replace edit link with button that opens dialog
   - Map savings account data to Account type for the dialog prop

4. **Delete removed files**
   - `src/components/accounts/SavingsFormDialog.tsx`
   - `src/app/(app)/savings/[id]/edit/page.tsx`

---

## Date Input Handling

The existing SavingsFormDialog uses callback refs for date inputs (Safari-safe workaround). The unified dialog should use the same pattern for `startDate` and `initializedUntil` date fields. This is an existing workaround in the codebase and should be preserved.

---

## Validation

- **Name** is always required
- **Regular types**: no additional required fields
- **SPARPLAN create**: interestRate and contributionAmount required
- **FESTGELD create**: interestRate required
- **SPARPLAN/FESTGELD edit**: name and interestRate required

The submit button is disabled when validation fails (`!isValid || mutation.isPending`), matching the existing SavingsFormDialog pattern.

---

## Edge Cases

1. **Switching type in create mode**: When the user changes from e.g. CHECKING to SPARPLAN, the form should show/hide the appropriate sections. The common fields (name, color, iban) keep their values. Type-specific fields reset to defaults.

2. **Loading SavingsConfig in edit mode**: While fetching, show a loading state in the savings-specific section. The common fields (from the Account object) can be shown immediately.

3. **Extend section**: The "Zahlungsplan verlaengern" functionality currently lives on the edit page. Since the unified dialog replaces the edit page, the extend section should remain on the **savings detail page** (not in the dialog). It is more of an operational action than an edit action.
