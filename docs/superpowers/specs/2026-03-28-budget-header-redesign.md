# Budget Header Redesign + Sub-Accounts Zeit-Reise

**Datum:** 2026-03-28
**Feature:** Budget-Tab Header Neustrukturierung

---

## Ziel

Den Summary-Bereich der Budget-Tabelle von einer "Veränderungsansicht" in eine "Saldo-Ansicht" umstrukturieren. Statt Nettoveränderungen sieht der Nutzer sofort die absoluten Kontostände. Einnahmen/Ausgaben wandern als Zusammenfassung an das Tabellenende.

---

## Neue Tabellenstruktur

### thead

| Zeile | Inhalt | Plan-Spalte | Ist-Spalte | Soll-Ist |
|-------|--------|-------------|------------|----------|
| 1 | Titelzeile "Budget · Monat Jahr" | colspan=6 | — | — |
| 2 | **Gesamtsaldo** | `closingBalancePlan` | `closingBalanceActual` | Ist − Plan |
| 3 | **Saldo Unterkonten** *(nur wenn Unterkonten vorhanden)* | historischer Plan-Saldo ¹ | `subAccountsBalance` (bis Monatsende) | Ist − Plan |
| 4 | **Saldo Hauptkonto** | Gesamtsaldo Plan − Unterkonten | Gesamtsaldo Ist − Unterkonten | Ist − Plan |
| 5 | Spaltenköpfe: Datum / Beschreibung / Betr. geplant / Betrag / Soll-Ist | — | — | — |

¹ Unterkonten haben keinen separaten Planwert; Plan = Ist (aktueller historischer Saldo).

### Erste tbody-Zeile (vor Kategoriegruppen)

**Saldoübertrag aus Vormonat** — zeigt `openingBalance` in Plan- und Ist-Spalte (identische Werte, da es ein Fakt ist, kein Plan). Soll-Ist = 0.

### tfoot (ersetzt bisherigen Endkontostand)

| Zeile | Inhalt | Plan-Spalte | Ist-Spalte | Soll-Ist |
|-------|--------|-------------|------------|----------|
| 1 | **Einnahmen** | `incomePlan` | `incomeActual` | Ist − Plan |
| 2 | **Ausgaben** | `expensePlan` | `expenseActual` | Ist − Plan |

---

## Was entfällt

- `Nettoveränderung`-Zeile im Header (redundant, da Einnahmen/Ausgaben unten stehen)
- `Anfangskontostand` als Header-Zeile (wird zur ersten tbody-Zeile "Saldoübertrag aus Vormonat")
- `Endkontostand` im tfoot (ersetzt durch Einnahmen/Ausgaben)

---

## Zeit-Reise: Grundsatz

Die Budget-Ansicht verhält sich wie eine Zeitmaschine: Alle Werte werden so berechnet, **als wäre `endOfMonth` des gewählten Monats das heutige Datum**. Dies gilt für Vergangenheit und Zukunft.

- **Vergangene Monate**: Nur Transaktionen und Einträge mit `date ≤ endOfMonth` werden berücksichtigt.
- **Aktuelle Monate**: Normales Verhalten.
- **Zukünftige Monate**: Ist-Werte ändern sich nicht (keine künftigen Transaktionen vorhanden); Planwerte (BudgetEntry) können aber für Zukunftsmonate angelegt sein und werden angezeigt. `openingBalance` = `currentBalance` (beste Schätzung, da keine künftigen Transaktionen existieren).

### Aktueller Stand (bereits korrekt)

| Wert | Berechnung | Vergangenheit | Zukunft |
|------|-----------|---------------|---------|
| `openingBalance` | `currentBalance − Σ(Transaktionen ≥ Monatsbeginn)` | ✓ | ✓ (= currentBalance) |
| Kategorien-Aktivität (Ist) | Transaktionen gefiltert auf `[startOfMonth, endOfMonth]` | ✓ | ✓ (= 0 für echte Zukunft) |
| Planwerte (BudgetEntry) | gefiltert auf `year/month` | ✓ | ✓ |
| `closingBalancePlan/Actual` | abgeleitet aus openingBalance + Aktivität | ✓ | ✓ |

### Lücke: Sub-Accounts-Saldo

`/api/sub-accounts` summiert alle `SubAccountEntry`-Beträge ohne Datumfilter → zeigt immer den aktuellen Gesamtsaldo, unabhängig vom gewählten Monat.

---

## API-Änderung

### `/api/accounts/[id]/budget/[year]/[month]/route.ts`

Zusätzliche Query am Ende des Handlers:

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

Antwort erweitern um:
```ts
subAccountsBalance,  // historischer Saldo der Unterkonten bis Monatsende
```

### `AccountBudgetTab.tsx`

- `subAccountsBalance` aus dem Budget-API-Response statt aus `/api/sub-accounts` verwenden (für die Saldo-Anzeige in den Summary-Zeilen)
- Der bestehende `/api/sub-accounts`-Call bleibt erhalten (wird für die Einzelauflistung der Unterkonten in den Sub-Rows benötigt)

---

## Komponenten-Änderungen

### `AccountBudgetTab.tsx` — Header-Bereich (thead)

**Entfernen:**
- Nettoveränderung-Zeile
- Anfangskontostand-Zeile (Zeile im thead)
- Unterkonten-Detailzeilen im thead (individuelle Sub-Account-Rows)

**Hinzufügen:**
- Gesamtsaldo-Zeile (Row 2)
- Saldo-Unterkonten-Zeile (Row 3, konditional)
- Saldo-Hauptkonto-Zeile (Row 4)

### `AccountBudgetTab.tsx` — tbody

**Hinzufügen:** Erste Zeile "Saldoübertrag aus Vormonat" mit `openingBalance` in Plan + Ist.

### `AccountBudgetTab.tsx` — tfoot

**Ersetzen:** Endkontostand-Zeile durch zwei Zeilen: Einnahmen + Ausgaben.

---

## Interface-Änderung

`AccountBudgetData` erhält ein neues Feld:
```ts
subAccountsBalance: number
```

---

## Nicht im Scope

- Änderungen an Kategorie-Zeilen oder Gruppen-Zeilen im tbody
- Änderungen an der Spaltenstruktur (Spaltenköpfe bleiben gleich)
- Änderungen an anderen API-Routen außer dem Budget-Endpunkt
- Rollover-Logik
