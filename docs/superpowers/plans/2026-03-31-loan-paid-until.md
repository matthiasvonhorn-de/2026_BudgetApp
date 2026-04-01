# Loan „Bezahlt bis" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional „Bezahlt bis"-date field to the loan create/edit dialog that silently marks historical payments as paid without creating transactions or updating account balances.

**Architecture:** Three-layer change — (1) POST API accepts `paidUntil` and bulk-marks periods after schedule generation, (2) PUT API accepts `paidUntil` and adjusts paid state in both the metadata-only and schedule-rebuild paths, (3) the UI dialog adds the date field and derives the current value from the loan's silently-paid periods returned by the GET list endpoint.

**Tech Stack:** Next.js App Router API routes, Prisma v7 + libSQL, React + TanStack Query, Zod v4

---

## File Map

| File | Change |
|------|--------|
| `src/app/api/loans/route.ts` | Add `paidUntil` to `CreateLoanSchema`; bulk-mark after `createMany`; expose computed `paidUntil` in GET response |
| `src/app/api/loans/[id]/route.ts` | Add `paidUntil` to `UpdateSchema`; apply in metadata-only branch and inside `$transaction` for schedule-rebuild branch |
| `src/app/(app)/settings/loans/page.tsx` | Add `paidUntil` to `LoanForm`, `EMPTY`, `useEffect`, `payload()`; render date field in dialog |

---

## Task 1: Branch

- [ ] **Create feature branch**

```bash
cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp"
git checkout main && git pull && git checkout -b feature/loan-paid-until
```

---

## Task 2: POST API — accept and apply `paidUntil`

**File:** `src/app/api/loans/route.ts`

- [ ] **Add `paidUntil` to `CreateLoanSchema`**

In `CreateLoanSchema`, add after the `notes` field (line 16):

```ts
paidUntil: z.string().optional().nullable(),
```

Full schema becomes:
```ts
const CreateLoanSchema = z.object({
  name: z.string().min(1),
  loanType: z.enum(['ANNUITAETENDARLEHEN', 'RATENKREDIT']),
  principal: z.number().positive(),
  interestRate: z.number().min(0),
  initialRepaymentRate: z.number().min(0).optional(),
  termMonths: z.number().int().positive(),
  startDate: z.string(),
  accountId: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  paidUntil: z.string().optional().nullable(),
})
```

- [ ] **Apply `paidUntil` after schedule creation in POST handler**

After the `await prisma.loanPayment.createMany(...)` block (after line 113), add:

```ts
if (data.paidUntil) {
  await prisma.loanPayment.updateMany({
    where: {
      loanId: loan.id,
      dueDate: { lte: new Date(data.paidUntil) },
    },
    data: { paidAt: new Date() },
  })
}
```

- [ ] **Manual check**

Start dev server (`npm run dev`). Open Settings → Kredite → Neuer Kredit. Fill in any loan with a start date 2 years ago, set „Bezahlt bis" to last month. Submit. Open the loan detail page and confirm that all periods up to last month show as green/bezahlt, with no „gebucht" badge.

---

## Task 3: GET API — expose `paidUntil` in list response

**File:** `src/app/api/loans/route.ts`

The edit dialog reads loan data from the GET `/api/loans` list. We need to expose the current „silently paid until" date so the dialog can pre-fill the field.

- [ ] **Compute and expose `paidUntil` in GET handler**

In the `GET` handler, inside the `.map(loan => {...})` callback, add the `paidUntil` computation alongside the existing stats. Replace the current return object:

```ts
const paidRows = loan.payments.filter(p => p.paidAt !== null)
const totalInterestPaid = paidRows.reduce((s, p) => s + p.scheduledInterest, 0)
const totalPrincipalPaid = paidRows.reduce((s, p) => s + p.scheduledPrincipal, 0)
const extraPaid = paidRows.reduce((s, p) => s + p.extraPayment, 0)
const remainingBalance = loan.payments.at(-1)?.scheduledBalance ?? 0
const nextUnpaid = loan.payments.find(p => p.paidAt === null)

// Compute paidUntil: latest dueDate among silently-paid periods (no booking)
const silentPaid = loan.payments.filter(p => p.paidAt !== null && p.transactionId === null)
const paidUntil = silentPaid.length > 0
  ? silentPaid.reduce(
      (max, p) => new Date(p.dueDate) > new Date(max) ? p.dueDate : max,
      silentPaid[0].dueDate,
    )
  : null

return {
  ...loan,
  payments: undefined,
  paidUntil,
  stats: {
    totalInterestPaid: Math.round(totalInterestPaid * 100) / 100,
    totalPrincipalPaid: Math.round((totalPrincipalPaid + extraPaid) * 100) / 100,
    remainingBalance: Math.round(remainingBalance * 100) / 100,
    periodsPaid: paidRows.length,
    totalPeriods: loan.payments.length,
    nextDueDate: nextUnpaid?.dueDate ?? null,
  },
}
```

- [ ] **Manual check**

In browser DevTools, check `GET /api/loans`. Each loan object should now have a `paidUntil` field (the date string or `null`).

---

## Task 4: PUT API — accept and apply `paidUntil`

**File:** `src/app/api/loans/[id]/route.ts`

- [ ] **Add `paidUntil` to `UpdateSchema`**

In `UpdateSchema`, add after `notes` (line 11):

```ts
paidUntil: z.string().nullable().optional(),
```

Full schema:
```ts
const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  accountId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  paidUntil: z.string().nullable().optional(),
  loanType: z.enum(['ANNUITAETENDARLEHEN', 'RATENKREDIT']).optional(),
  principal: z.number().positive().optional(),
  interestRate: z.number().min(0).optional(),
  initialRepaymentRate: z.number().min(0).optional(),
  termMonths: z.number().int().positive().optional(),
  startDate: z.string().optional(),
})
```

Note: `paidUntil` is intentionally NOT added to `FINANCIAL_KEYS` — it does not trigger schedule recalculation.

- [ ] **Apply `paidUntil` in the metadata-only branch**

After `const loan = await prisma.loan.update({ ... })` (currently followed by `return NextResponse.json(loan)`), insert the paidUntil logic before the return:

```ts
if (!financialChanged) {
  const loan = await prisma.loan.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.accountId !== undefined && { accountId: data.accountId }),
      ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
      ...(data.notes !== undefined && { notes: data.notes }),
    },
  })

  if (data.paidUntil !== undefined) {
    if (data.paidUntil === null) {
      await prisma.loanPayment.updateMany({
        where: { loanId: id, transactionId: null },
        data: { paidAt: null },
      })
    } else {
      const cutoff = new Date(data.paidUntil)
      await prisma.loanPayment.updateMany({
        where: { loanId: id, transactionId: null, dueDate: { lte: cutoff } },
        data: { paidAt: new Date() },
      })
      await prisma.loanPayment.updateMany({
        where: { loanId: id, transactionId: null, dueDate: { gt: cutoff } },
        data: { paidAt: null },
      })
    }
  }

  return NextResponse.json(loan)
}
```

- [ ] **Apply `paidUntil` inside the `$transaction` (financial-changed branch)**

Inside the `prisma.$transaction` callback, after `await tx.loanPayment.createMany(...)` and before `return updated`, add:

```ts
if (data.paidUntil !== undefined) {
  if (data.paidUntil === null) {
    await tx.loanPayment.updateMany({
      where: { loanId: id, transactionId: null },
      data: { paidAt: null },
    })
  } else {
    const cutoff = new Date(data.paidUntil)
    await tx.loanPayment.updateMany({
      where: { loanId: id, transactionId: null, dueDate: { lte: cutoff } },
      data: { paidAt: new Date() },
    })
    await tx.loanPayment.updateMany({
      where: { loanId: id, transactionId: null, dueDate: { gt: cutoff } },
      data: { paidAt: null },
    })
  }
}

return updated
```

- [ ] **Manual check — extend paidUntil**

Edit an existing loan. Move „Bezahlt bis" one month forward. Save. On the loan detail page, the newly included period should appear as bezahlt without „gebucht"-badge.

- [ ] **Manual check — shrink paidUntil**

Edit the same loan. Move „Bezahlt bis" one month back. Save. The period that was just silently marked should now be open again. Periods with a real booking (gebucht) must remain paid and unaffected.

- [ ] **Manual check — clear paidUntil**

Edit the loan and empty the „Bezahlt bis" field (sends `null`). Save. All silently-paid periods should revert to open. Booked periods remain paid.

---

## Task 5: UI — add „Bezahlt bis" field to LoanDialog

**File:** `src/app/(app)/settings/loans/page.tsx`

- [ ] **Add `paidUntil` to `LoanForm` interface and `EMPTY`**

```ts
interface LoanForm {
  name: string
  loanType: 'ANNUITAETENDARLEHEN' | 'RATENKREDIT'
  principal: string
  interestRate: string
  initialRepaymentRate: string
  termMonths: string
  startDate: string
  paidUntil: string        // ← add this
  accountId: string
  categoryId: string
  notes: string
}

const EMPTY: LoanForm = {
  name: '',
  loanType: 'ANNUITAETENDARLEHEN',
  principal: '',
  interestRate: '',
  initialRepaymentRate: '',
  termMonths: '',
  startDate: new Date().toISOString().slice(0, 10),
  paidUntil: '',           // ← add this
  accountId: '',
  categoryId: '',
  notes: '',
}
```

- [ ] **Pre-fill `paidUntil` in edit mode (`useEffect`)**

In the `useEffect` that populates the form when editing, add `paidUntil`:

```ts
setForm({
  name: loan.name,
  loanType: loan.loanType,
  principal: loan.principal.toString(),
  interestRate: (loan.interestRate * 100).toFixed(3),
  initialRepaymentRate: loan.initialRepaymentRate > 0 ? (loan.initialRepaymentRate * 100).toFixed(3) : '',
  termMonths: loan.termMonths.toString(),
  startDate: new Date(loan.startDate).toISOString().slice(0, 10),
  paidUntil: loan.paidUntil                          // ← add this
    ? new Date(loan.paidUntil).toISOString().slice(0, 10)
    : '',
  accountId: loan.accountId ?? '',
  categoryId: loan.categoryId ?? '',
  notes: loan.notes ?? '',
})
```

- [ ] **Include `paidUntil` in `payload()`**

```ts
const payload = () => ({
  name: form.name,
  loanType: form.loanType,
  principal: parseFloat(form.principal.replace(',', '.')),
  interestRate: parseFloat(form.interestRate.replace(',', '.')) / 100,
  initialRepaymentRate: form.initialRepaymentRate
    ? parseFloat(form.initialRepaymentRate.replace(',', '.')) / 100
    : 0,
  termMonths: parseInt(form.termMonths),
  startDate: form.startDate,
  paidUntil: form.paidUntil || null,    // ← add this
  accountId: form.accountId || null,
  categoryId: form.categoryId || null,
  notes: form.notes || null,
})
```

- [ ] **Add the form field after „Erste Rate am" in the JSX**

The current grid has „Laufzeit" and „Erste Rate am" side by side (two `div.space-y-1.5` inside the `grid grid-cols-2`). After the closing `</div>` of the „Erste Rate am" field (around line 226), insert a new `col-span-2` block:

```tsx
<div className="col-span-2 space-y-1.5">
  <Label>Bezahlt bis</Label>
  <Input
    type="date"
    value={form.paidUntil}
    min={form.startDate}
    onChange={e => set('paidUntil', e.target.value)}
  />
  <p className="text-xs text-muted-foreground">
    Alle Raten bis zu diesem Datum werden ohne Buchung als bezahlt markiert.
  </p>
</div>
```

- [ ] **Manual check — create with paidUntil**

Open Settings → Kredite → Neuer Kredit. Fill in a loan starting 2 years ago, enter „Bezahlt bis" = last month. Save. Open loan detail: all periods up to last month are green, no „gebucht" badge. Kontostand of linked account is unchanged.

- [ ] **Manual check — edit pre-fills paidUntil**

Click the pencil icon on a loan that has silently-paid periods. The „Bezahlt bis" field should be pre-filled with the correct date.

- [ ] **Manual check — `min` attribute**

Verify that the browser's date picker does not allow selecting a date before `startDate`.

---

## Task 6: Commit and push

- [ ] **Commit all changes**

```bash
git add src/app/api/loans/route.ts \
        src/app/api/loans/[id]/route.ts \
        src/app/(app)/settings/loans/page.tsx
git commit -m "$(cat <<'EOF'
feat: add 'Bezahlt bis' field to loan dialog for silent historical marking

Loans created or edited with a paidUntil date will have all periods up to
that date marked as paid without creating transactions or updating account
balances. Useful for loans that existed before the app was set up.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Push and create Draft PR**

```bash
git push -u origin feature/loan-paid-until
gh pr create --draft \
  --title "feat: loan 'Bezahlt bis' — silent historical payment marking" \
  --body "Adds an optional date field to the loan create/edit dialog. All periods with dueDate ≤ paidUntil are silently marked as paid (paidAt set, transactionId = null, no account balance change). Useful for loans that predate the app setup."
```
