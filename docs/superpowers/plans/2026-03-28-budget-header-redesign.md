# Budget Header Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den Budget-Tab-Header von einer Veränderungsansicht (Nettoveränderung) auf eine Saldo-Ansicht (Gesamtsaldo, Unterkonten, Hauptkonto) umstrukturieren und den Sub-Accounts-Saldo zeitreise-korrekt berechnen.

**Architecture:** Die API-Route gibt zusätzlich `subAccountsBalance` zurück (SubAccountEntry-Summe bis Monatsende). Die Komponente `AccountBudgetTab.tsx` nutzt diesen Wert für die neuen Summary-Zeilen und strukturiert thead/tfoot um.

**Tech Stack:** Next.js App Router, Prisma v7 + libSQL, TypeScript, TanStack Query, Tailwind CSS

---

## File Map

| Datei | Änderung |
|-------|----------|
| `src/app/api/accounts/[id]/budget/[year]/[month]/route.ts` | Neue Query für `subAccountsBalance` + Feld in Response |
| `src/components/accounts/AccountBudgetTab.tsx` | Interface + thead + tbody-Zeile + tfoot |

---

## Task 1: API — subAccountsBalance hinzufügen

**Files:**
- Modify: `src/app/api/accounts/[id]/budget/[year]/[month]/route.ts`

- [ ] **Schritt 1: Interface in der API-Route erweitern**

Öffne `src/app/api/accounts/[id]/budget/[year]/[month]/route.ts`.

Füge nach der `activities`-Aggregation (ca. Zeile 43–52) folgende Query ein, direkt vor dem `return NextResponse.json(...)`:

```ts
// Sub-Account-Saldo bis Monatsende (Zeit-Reise-korrekt)
const subAccountEntries = await prisma.subAccountEntry.aggregate({
  where: {
    date: { lte: endOfMonth },
    group: {
      subAccount: { accountId: id },
    },
  },
  _sum: { amount: true },
})
const subAccountsBalance = subAccountEntries._sum.amount ?? 0
```

- [ ] **Schritt 2: `subAccountsBalance` zur Response hinzufügen**

Im `return NextResponse.json({...})` am Ende der Route das neue Feld ergänzen:

```ts
return NextResponse.json({
  account,
  year,
  month,
  openingBalance,
  subAccountsBalance,   // ← neu
  groups,
  summary: {
    totalBudgeted,
    totalActivity,
    closingBalancePlan: openingBalance + totalBudgeted,
    closingBalanceActual: openingBalance + totalActivity,
  },
})
```

- [ ] **Schritt 3: API manuell prüfen**

Dev-Server läuft auf http://localhost:3000. Im Browser aufrufen (Account-ID und Monat anpassen):

```
http://localhost:3000/api/accounts/<id>/budget/2025/12
```

Erwartetes Ergebnis: JSON enthält `"subAccountsBalance": <Zahl>`. Wenn keine SubAccountEntries vorhanden sind → `0`.

- [ ] **Schritt 4: Commit**

```bash
git add src/app/api/accounts/[id]/budget/[year]/[month]/route.ts
git commit -m "feat: add subAccountsBalance to budget API (time-travel aware)"
```

---

## Task 2: Frontend — Interface aktualisieren

**Files:**
- Modify: `src/components/accounts/AccountBudgetTab.tsx`

- [ ] **Schritt 1: `AccountBudgetData`-Interface erweitern**

In `AccountBudgetTab.tsx`, das Interface `AccountBudgetData` (ca. Zeile 39–51) um das neue Feld ergänzen:

```ts
interface AccountBudgetData {
  account: { id: string; name: string; color: string }
  year: number
  month: number
  openingBalance: number
  subAccountsBalance: number   // ← neu
  groups: GroupData[]
  summary: {
    totalBudgeted: number
    totalActivity: number
    closingBalancePlan: number
    closingBalanceActual: number
  }
}
```

- [ ] **Schritt 2: `subAccountsBalance` aus den Daten destructuren**

Im Render-Teil der Komponente (ca. Zeile 343–363, direkt nach `if (isLoading) return ...`) das neue Feld hinzufügen:

```ts
const opening = data?.openingBalance ?? 0
const subAccountsBalance = data?.subAccountsBalance ?? 0   // ← neu
const groups = data?.groups ?? []
const summary = data?.summary
const closingPlan = summary?.closingBalancePlan ?? opening
const closingActual = summary?.closingBalanceActual ?? opening
```

- [ ] **Schritt 3: Commit**

```bash
git add src/components/accounts/AccountBudgetTab.tsx
git commit -m "feat: add subAccountsBalance to AccountBudgetData interface"
```

---

## Task 3: Frontend — thead umstrukturieren

**Files:**
- Modify: `src/components/accounts/AccountBudgetTab.tsx`

Dieser Task ersetzt den gesamten `<thead>`-Inhalt (außer der Titelzeile und den Spaltenköpfen).

- [ ] **Schritt 1: Alte Summary-Zeilen entfernen und neue einsetzen**

Den Inhalt des `<thead>` (ca. Zeile 404–533) durch folgende Version ersetzen. Die Titelzeile (Row 1) und die Spaltenköpfe (letzte `<tr>`) bleiben unverändert; alle Zeilen dazwischen werden ersetzt:

```tsx
<thead>
  {/* Titelzeile */}
  <tr className="bg-blue-50 dark:bg-blue-950/30">
    <td colSpan={6} className="px-3 py-1.5 text-center text-sm font-medium text-foreground border border-border">
      Budget · {getMonthName(budgetMonth, budgetYear)}
    </td>
  </tr>

  {/* ── 1. Gesamtsaldo ───────────────────────────────────── */}
  <tr className="bg-blue-100/80 dark:bg-blue-900/30 font-bold">
    <td colSpan={2} className="px-3 py-1 border border-border text-right text-xs font-bold text-foreground">
      Gesamtsaldo
    </td>
    <td className={`px-3 py-1 border border-border text-right tabular-nums ${amountColor(closingPlan)}`}>
      {fmt(closingPlan)}
    </td>
    <td className={`px-3 py-1 border border-border text-right tabular-nums ${amountColor(closingActual)}`}>
      {fmt(closingActual)}
    </td>
    <td className={`px-3 py-1 border border-border text-right tabular-nums ${amountColor(closingActual - closingPlan)}`}>
      {fmt(closingActual - closingPlan)}
    </td>
    <td className="px-3 py-1 border border-border" />
  </tr>

  {/* ── 2. Saldo Unterkonten (nur wenn vorhanden) ─────────── */}
  {subAccounts.length > 0 && (
    <tr className="bg-blue-50/70 dark:bg-blue-950/25">
      <td className="px-3 py-1 border border-border" />
      <td className="px-3 py-1 border border-border text-right text-xs font-semibold text-muted-foreground">
        Saldo Unterkonten
      </td>
      <td className={`px-3 py-1 border border-border text-right tabular-nums font-semibold ${amountColor(subAccountsBalance)}`}>
        {fmt(subAccountsBalance)}
      </td>
      <td className={`px-3 py-1 border border-border text-right tabular-nums font-semibold ${amountColor(subAccountsBalance)}`}>
        {fmt(subAccountsBalance)}
      </td>
      <td className="px-3 py-1 border border-border text-right text-xs text-muted-foreground tabular-nums">
        {fmt(0)}
      </td>
      <td className="px-3 py-1 border border-border" />
    </tr>
  )}

  {/* ── 3. Saldo Hauptkonto ───────────────────────────────── */}
  <tr className="bg-blue-50/70 dark:bg-blue-950/25">
    <td className="px-3 py-1 border border-border" />
    <td className="px-3 py-1 border border-border text-right text-xs font-semibold text-muted-foreground">
      Saldo Hauptkonto
    </td>
    <td className={`px-3 py-1 border border-border text-right tabular-nums font-semibold ${amountColor(closingPlan - subAccountsBalance)}`}>
      {fmt(closingPlan - subAccountsBalance)}
    </td>
    <td className={`px-3 py-1 border border-border text-right tabular-nums font-semibold ${amountColor(closingActual - subAccountsBalance)}`}>
      {fmt(closingActual - subAccountsBalance)}
    </td>
    <td className={`px-3 py-1 border border-border text-right tabular-nums font-semibold ${amountColor((closingActual - subAccountsBalance) - (closingPlan - subAccountsBalance))}`}>
      {fmt((closingActual - subAccountsBalance) - (closingPlan - subAccountsBalance))}
    </td>
    <td className="px-3 py-1 border border-border" />
  </tr>

  {/* ── Spaltenköpfe ──────────────────────────────────────── */}
  <tr className="bg-muted border-t-2 border-border">
    <th className="text-left px-3 py-2 font-semibold border border-border w-28">Datum</th>
    <th className="text-left px-3 py-2 font-semibold border border-border">Beschreibung</th>
    <th className="text-right px-3 py-2 font-semibold border border-border w-36">Betr. geplant</th>
    <th className="text-right px-3 py-2 font-semibold border border-border w-36">Betrag</th>
    <th className="text-right px-3 py-2 font-semibold border border-border w-32">Soll-Ist</th>
    <th className="px-2 py-2 border border-border w-10" />
  </tr>
</thead>
```

Hinweis: `subAccounts` ist weiterhin die gefilterte Liste aus dem `/api/sub-accounts`-Call (wird für die `length`-Prüfung benötigt). Die Variable `subAccountsBalance` kommt jetzt aus dem Budget-API-Response (Task 2).

- [ ] **Schritt 2: Im Browser prüfen**

http://localhost:3000 → Konto öffnen → Budget-Tab.

Erwartetes Ergebnis:
- Oberste Zeile: "Gesamtsaldo" mit Plan/Ist-Werten
- Zweite Zeile (nur wenn Unterkonten vorhanden): "Saldo Unterkonten"
- Dritte Zeile: "Saldo Hauptkonto"
- Keine "Nettoveränderung"-Zeile mehr
- Kein "Anfangskontostand" im Header mehr

- [ ] **Schritt 3: Commit**

```bash
git add src/components/accounts/AccountBudgetTab.tsx
git commit -m "feat: replace budget summary header with Saldo rows"
```

---

## Task 4: Frontend — "Saldoübertrag aus Vormonat" als erste tbody-Zeile

**Files:**
- Modify: `src/components/accounts/AccountBudgetTab.tsx`

- [ ] **Schritt 1: Saldoübertrag-Zeile in tbody einfügen**

Im `<tbody>`, direkt vor dem `{groups.length === 0 ? (` Block (ca. Zeile 536), eine neue Zeile einfügen:

```tsx
<tbody>
  {/* ── Saldoübertrag aus Vormonat ─────────────────────────── */}
  <tr className="bg-slate-100 dark:bg-slate-800/50 font-semibold">
    <td className="px-3 py-1.5 border border-border text-xs text-muted-foreground">
      {`01.${String(budgetMonth).padStart(2, '0')}.${budgetYear}`}
    </td>
    <td className="px-3 py-1.5 border border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
      Saldoübertrag aus Vormonat
    </td>
    <td className={`px-3 py-1.5 border border-border text-right tabular-nums ${amountColor(opening)}`}>
      {fmt(opening)}
    </td>
    <td className={`px-3 py-1.5 border border-border text-right tabular-nums ${amountColor(opening)}`}>
      {fmt(opening)}
    </td>
    <td className="px-3 py-1.5 border border-border text-right tabular-nums text-muted-foreground">
      {fmt(0)}
    </td>
    <td className="px-3 py-1.5 border border-border" />
  </tr>

  {/* ── Kategoriegruppen ──────────────────────────────────── */}
  {groups.length === 0 ? (
    // ... bestehender "Keine Kategoriegruppen"-Block unverändert
```

- [ ] **Schritt 2: `dateStr`-Variable prüfen**

Die Variable `dateStr` (ca. Zeile 348) wird jetzt nur noch in den Gruppen-/Kategorie-Zeilen im tbody verwendet. Sie kann stehen bleiben. In der neuen Saldoübertrag-Zeile wird das Datum inline geschrieben (identischer Wert).

- [ ] **Schritt 3: Im Browser prüfen**

Budget-Tab neu laden. Erwartetes Ergebnis:
- Erste Zeile unterhalb der Spaltenköpfe: "Saldoübertrag aus Vormonat" mit `openingBalance` in Plan- und Ist-Spalte, Soll-Ist = 0,00 €
- Danach folgen wie bisher die Kategoriegruppen

- [ ] **Schritt 4: Commit**

```bash
git add src/components/accounts/AccountBudgetTab.tsx
git commit -m "feat: add Saldoübertrag aus Vormonat as first tbody row"
```

---

## Task 5: Frontend — tfoot: Endkontostand durch Einnahmen/Ausgaben ersetzen

**Files:**
- Modify: `src/components/accounts/AccountBudgetTab.tsx`

- [ ] **Schritt 1: tfoot ersetzen**

Den gesamten `<tfoot>`-Block (ca. Zeile 662–679) durch folgende Version ersetzen:

```tsx
<tfoot>
  {/* ── Einnahmen ────────────────────────────────────────── */}
  <tr className="bg-slate-100 dark:bg-slate-800/50 font-semibold border-t-2 border-border">
    <td colSpan={2} className="px-3 py-1.5 border border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
      Einnahmen
    </td>
    <td className={`px-3 py-1.5 border border-border text-right tabular-nums ${amountColor(incomePlan)}`}>
      {fmt(incomePlan)}
    </td>
    <td className={`px-3 py-1.5 border border-border text-right tabular-nums ${amountColor(incomeActual)}`}>
      {fmt(incomeActual)}
    </td>
    <td className={`px-3 py-1.5 border border-border text-right tabular-nums ${amountColor(incomeActual - incomePlan)}`}>
      {fmt(incomeActual - incomePlan)}
    </td>
    <td className="px-3 py-1.5 border border-border" />
  </tr>
  {/* ── Ausgaben ─────────────────────────────────────────── */}
  <tr className="bg-slate-100 dark:bg-slate-800/50 font-semibold">
    <td colSpan={2} className="px-3 py-1.5 border border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
      Ausgaben
    </td>
    <td className={`px-3 py-1.5 border border-border text-right tabular-nums ${amountColor(expensePlan)}`}>
      {fmt(expensePlan)}
    </td>
    <td className={`px-3 py-1.5 border border-border text-right tabular-nums ${amountColor(expenseActual)}`}>
      {fmt(expenseActual)}
    </td>
    <td className={`px-3 py-1.5 border border-border text-right tabular-nums ${amountColor(expenseActual - expensePlan)}`}>
      {fmt(expenseActual - expensePlan)}
    </td>
    <td className="px-3 py-1.5 border border-border" />
  </tr>
</tfoot>
```

Hinweis: `incomePlan`, `incomeActual`, `expensePlan`, `expenseActual` sind bereits in der Komponente berechnet (ca. Zeile 355–360) — keine neue Berechnung nötig.

- [ ] **Schritt 2: Im Browser prüfen**

Budget-Tab neu laden. Erwartetes Ergebnis:
- Am Ende der Tabelle: "EINNAHMEN" und "AUSGABEN" mit Plan/Ist/Soll-Ist
- Kein "Endkontostand" mehr

- [ ] **Schritt 3: Monatsnavigation testen (Zeit-Reise)**

Im Budget-Tab mehrere Monate vor- und zurücknavigieren:
- Vergangenheit: Gesamtsaldo, Unterkonten-Saldo ändern sich korrekt
- Zukunft: Ist-Werte bleiben gleich / auf 0; Planwerte erscheinen wenn BudgetEntry vorhanden

- [ ] **Schritt 4: Commit**

```bash
git add src/components/accounts/AccountBudgetTab.tsx
git commit -m "feat: replace Endkontostand footer with Einnahmen/Ausgaben summary"
```

---

## Abschluss-Checkliste

- [ ] API gibt `subAccountsBalance` zurück
- [ ] Header zeigt Gesamtsaldo / Saldo Unterkonten (konditional) / Saldo Hauptkonto
- [ ] Erste tbody-Zeile: "Saldoübertrag aus Vormonat"
- [ ] tfoot: Einnahmen + Ausgaben (kein Endkontostand)
- [ ] Monatsnavigation in Vergangenheit + Zukunft funktioniert korrekt
