# Situatives Unterkonto-Override im Buchungsdialog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Im „Planwert als Transaktion buchen"-Dialog können Nutzer situativ den automatischen Unterkonto-Eintrag und/oder die Gegenbuchung überspringen.

**Architecture:** Drei Dateien werden geändert: Budget-API liefert `subAccountGroupId`/`subAccountLinkType` pro Kategorie; `BookTransactionDialog` bekommt zwei bedingte Checkboxen und übergibt die Flags; `POST /api/transactions` wertet sie aus und überspringt die entsprechenden Blöcke.

**Tech Stack:** Next.js App Router, Prisma, Zod, React, TanStack Query, shadcn/ui

---

## Dateiübersicht

| Datei | Änderung |
|---|---|
| `src/app/api/accounts/[id]/budget/[year]/[month]/route.ts` | `subAccountGroupId` + `subAccountLinkType` zum Kategorie-Objekt hinzufügen |
| `src/components/accounts/AccountBudgetTab.tsx` | `CategoryData` interface erweitern, `BookTransactionDialog` um Checkboxen + Reset + API-Flags erweitern |
| `src/app/api/transactions/route.ts` | Zod-Schema + Logik für `skipSubAccountEntry` / `skipPairedTransfer` |

---

## Task 1: Budget-API — subAccountGroupId und subAccountLinkType im Response

**Files:**
- Modify: `src/app/api/accounts/[id]/budget/[year]/[month]/route.ts:66-82`

- [ ] **Schritt 1: Kategorie-Mapping erweitern**

In der `categories: group.categories.map(cat => { ... })` Block (Zeile 66–82) die zwei neuen Felder hinzufügen:

```typescript
return {
  id: cat.id,
  name: cat.name,
  color: cat.color,
  type: cat.type,
  budgeted,
  rolledOver,
  activity,
  available,
  subAccountGroupId: cat.subAccountGroupId,
  subAccountLinkType: cat.subAccountLinkType,
}
```

- [ ] **Schritt 2: Im Browser prüfen**

Dev-Server läuft auf http://localhost:3000. In den Browser-DevTools Network-Tab öffnen, Budget-Tab einer Konto-Seite laden und den Request `GET /api/accounts/.../budget/.../...` prüfen. Im Response-Body bei einer Kategorie mit Unterkonto-Verknüpfung muss `subAccountGroupId` (nicht null) und `subAccountLinkType` ("BOOKING" oder "TRANSFER") erscheinen.

- [ ] **Schritt 3: Commit**

```bash
git add src/app/api/accounts/\[id\]/budget/\[year\]/\[month\]/route.ts
git commit -m "feat: include subAccountGroupId and subAccountLinkType in budget API response"
```

---

## Task 2: CategoryData Interface und BookTransactionDialog erweitern

**Files:**
- Modify: `src/components/accounts/AccountBudgetTab.tsx:22-31` (interface)
- Modify: `src/components/accounts/AccountBudgetTab.tsx:155-257` (dialog)

- [ ] **Schritt 1: `CategoryData` Interface erweitern**

Das Interface `CategoryData` (Zeile 22–31) um zwei Felder ergänzen:

```typescript
interface CategoryData {
  id: string
  name: string
  color: string
  type: string
  budgeted: number
  rolledOver: number
  activity: number
  available: number
  subAccountGroupId: string | null
  subAccountLinkType: string
}
```

- [ ] **Schritt 2: State-Variablen im Dialog hinzufügen**

Im `BookTransactionDialog` nach dem bestehenden `const [amount, ...]` State (Zeile 163) zwei neue State-Variablen hinzufügen:

```typescript
const [skipSubAccountEntry, setSkipSubAccountEntry] = useState(false)
const [skipPairedTransfer, setSkipPairedTransfer] = useState(false)
```

- [ ] **Schritt 3: Reset-Block erweitern**

Den bestehenden Reset-Block (Zeile 166–172) um die zwei neuen States ergänzen:

```typescript
if (state.open && state.cat && state.cat.id !== lastCatId) {
  setLastCatId(state.cat.id)
  setSelAccountId(accountId)
  setDate(defaultDate)
  setDescription(state.cat.name)
  setAmount(Math.abs(state.cat.budgeted).toFixed(2))
  setSkipSubAccountEntry(false)
  setSkipPairedTransfer(false)
}
```

- [ ] **Schritt 4: Flags an API-Call übergeben**

Im `bookMutation.mutationFn` den `body` um die Flags erweitern (Zeile 182–187):

```typescript
body: JSON.stringify({
  date, amount: signedAmount, description,
  accountId: selAccountId,
  categoryId: state.cat.id,
  type: state.cat.type as 'INCOME' | 'EXPENSE' | 'TRANSFER',
  skipSubAccountEntry,
  skipPairedTransfer,
}),
```

- [ ] **Schritt 5: UI-Checkboxen hinzufügen**

Nach dem `<div className="space-y-1.5">` Block für „Betrag" (nach Zeile 243) und vor `</div>` (schließendes der `space-y-4`-Sektion, Zeile 244) einfügen:

```tsx
{state.cat.subAccountGroupId && (
  <div className="space-y-2 pt-2 border-t">
    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
      <input
        type="checkbox"
        checked={skipSubAccountEntry}
        onChange={e => {
          setSkipSubAccountEntry(e.target.checked)
          if (e.target.checked) setSkipPairedTransfer(true)
          else setSkipPairedTransfer(false)
        }}
      />
      <span>Unterkonto-Eintrag überspringen</span>
    </label>
    {state.cat.subAccountLinkType === 'TRANSFER' && (
      <label className={`flex items-center gap-2 text-sm select-none ${skipSubAccountEntry ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
        <input
          type="checkbox"
          checked={skipPairedTransfer}
          disabled={skipSubAccountEntry}
          onChange={e => setSkipPairedTransfer(e.target.checked)}
        />
        <span>Gegenbuchung überspringen</span>
      </label>
    )}
  </div>
)}
```

- [ ] **Schritt 6: Im Browser prüfen**

Budget-Tab öffnen. Bei einer Kategorie **mit** Unterkonto-Verknüpfung: Buchen-Dialog öffnen → Checkboxen erscheinen. Bei einer Kategorie **ohne** Verknüpfung: Dialog öffnen → keine Checkboxen sichtbar.

Bei `linkType = TRANSFER`: beide Checkboxen sichtbar. Erste Checkbox anklicken → zweite wird automatisch aktiv und disabled. Erste deaktivieren → zweite wird wieder freigegeben.

- [ ] **Schritt 7: Commit**

```bash
git add src/components/accounts/AccountBudgetTab.tsx
git commit -m "feat: add skip-sub-account checkboxes to BookTransactionDialog"
```

---

## Task 3: POST /api/transactions — Override-Flags auswerten

**Files:**
- Modify: `src/app/api/transactions/route.ts:5-15` (schema)
- Modify: `src/app/api/transactions/route.ts:120-170` (logic)

- [ ] **Schritt 1: Zod-Schema erweitern**

Das `transactionSchema` (Zeile 5–15) um zwei optionale Felder ergänzen:

```typescript
const transactionSchema = z.object({
  date: z.string(),
  amount: z.number(),
  description: z.string().min(1),
  payee: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  accountId: z.string(),
  categoryId: z.string().optional().nullable(),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).default('EXPENSE'),
  status: z.enum(['PENDING', 'CLEARED', 'RECONCILED']).default('PENDING'),
  skipSubAccountEntry: z.boolean().optional().default(false),
  skipPairedTransfer: z.boolean().optional().default(false),
})
```

- [ ] **Schritt 2: txType-Berechnung anpassen**

Zeile 101: Die `txType`-Berechnung muss `skipSubAccountEntry` berücksichtigen — wenn der Eintrag übersprungen wird, darf der Typ nicht auf TRANSFER umgeschrieben werden:

```typescript
const txType = linkedGroup && linkType === 'TRANSFER' && !data.skipSubAccountEntry ? 'TRANSFER' : data.type
```

- [ ] **Schritt 3: Sub-Account-Logik mit Flags absichern**

Den `if (linkedGroup)` Block (Zeile 120–170) so anpassen, dass beide Flags berücksichtigt werden:

```typescript
if (linkedGroup && !data.skipSubAccountEntry) {
  // Sub-account entry: expense on main account → income in sub-account
  const entryAmount = -data.amount
  const entry = await tx.subAccountEntry.create({
    data: {
      date: new Date(data.date),
      description: data.description,
      amount: entryAmount,
      fromBudget: true,
      groupId: linkedGroup.id,
    },
  })
  await tx.transaction.update({
    where: { id: t.id },
    data: { subAccountEntryId: entry.id },
  })

  if (linkType === 'TRANSFER' && !data.skipPairedTransfer) {
    // Create paired TRANSFER transaction on the target account
    const targetAccountId = linkedGroup.subAccount.accountId
    const pairedAmount = -data.amount  // opposite sign

    const paired = await tx.transaction.create({
      data: {
        date: new Date(data.date),
        amount: pairedAmount,
        description: data.description,
        accountId: targetAccountId,
        categoryId: data.categoryId || null,
        type: 'TRANSFER',
        status: data.status,
      },
    })

    // Update target account balance
    await tx.account.update({
      where: { id: targetAccountId },
      data: { currentBalance: { increment: pairedAmount } },
    })

    // Link both transactions as a transfer pair
    await tx.transaction.update({
      where: { id: t.id },
      data: { transferToId: paired.id },
    })

    return { ...t, transferToId: paired.id, subAccountEntryId: entry.id }
  }

  return { ...t, subAccountEntryId: entry.id }
}

return t
```

- [ ] **Schritt 4: Im Browser testen — Fall 1: Unterkonto-Eintrag überspringen**

Budget-Tab öffnen. Kategorie mit Unterkonto-Verknüpfung wählen → Buchungsdialog öffnen → „Unterkonto-Eintrag überspringen" anklicken → Transaktion buchen.

Erwartetes Ergebnis:
- Transaktion erscheint in der Transaktionsliste
- Im Unterkonten-Tab: **kein** neuer Eintrag in der verknüpften Gruppe

- [ ] **Schritt 5: Im Browser testen — Fall 2: Normalbuchung unverändert**

Ohne Checkbox zu aktivieren buchen. Erwartetes Ergebnis: Transaktion + Unterkonto-Eintrag werden wie bisher erstellt.

- [ ] **Schritt 6: Commit**

```bash
git add src/app/api/transactions/route.ts
git commit -m "feat: skip sub-account entry and/or paired transfer on demand in POST /api/transactions"
```

---

## Task 4: Branch pushen und PR erstellen

- [ ] **Branch pushen und Draft-PR erstellen**

```bash
git push -u origin <branch-name>
gh pr create --draft --title "feat: situational sub-account override in BookTransactionDialog" --body "..."
```
