# Spec: Situatives Unterkonto-Override beim Buchen von Planwerten

**Datum:** 2026-03-30

## Kontext

Beim Klick auf „Planwert als Transaktion buchen" (Budget-Tab) wird eine Transaktion erstellt. Wenn die Kategorie mit einem Unterkonto verknüpft ist, wird automatisch:
- ein `SubAccountEntry` im verknüpften Unterkonto erstellt (`linkType = BOOKING`)
- zusätzlich eine Gegenbuchung auf dem Zielkonto erstellt (`linkType = TRANSFER`)

Ziel: Der Nutzer soll im Buchungsdialog situativ entscheiden können, diese automatischen Verknüpfungen für eine einzelne Buchung zu überspringen.

## Anforderungen

- Im `BookTransactionDialog` erscheint eine neue Sektion, **nur sichtbar wenn die Kategorie eine Unterkonto-Verknüpfung hat** (`subAccountGroupId != null`).
- Checkbox 1: „Unterkonto-Eintrag überspringen" — immer sichtbar wenn Verknüpfung vorhanden.
- Checkbox 2: „Gegenbuchung überspringen" — nur sichtbar wenn `subAccountLinkType === 'TRANSFER'`.
- Beide Checkboxen sind standardmäßig **nicht angehakt** (normales Verhalten bleibt Default).
- Die Checkboxen sind unabhängig voneinander. Es ist möglich, nur die Gegenbuchung zu überspringen aber den Unterkonto-Eintrag zu behalten.
- Wenn „Unterkonto-Eintrag überspringen" aktiv ist, wird auch automatisch „Gegenbuchung überspringen" aktiv und deaktiviert (logisch: kein Eintrag → keine Gegenbuchung möglich).

## Datenfluss

### 1. Budget-API erweitern

`GET /api/accounts/[id]/budget/[year]/[month]`

Kategorie-Objekt im Response um zwei Felder erweitern:
```json
{
  "subAccountGroupId": "string | null",
  "subAccountLinkType": "BOOKING | TRANSFER"
}
```

Diese Werte sind bereits in der DB (Felder `Category.subAccountGroupId`, `Category.subAccountLinkType`), müssen nur in den Response aufgenommen werden.

### 2. `CategoryData` Interface erweitern

In `AccountBudgetTab.tsx`:
```ts
interface CategoryData {
  // bestehende Felder ...
  subAccountGroupId: string | null
  subAccountLinkType: string
}
```

### 3. `BookTransactionDialog` erweitern

Zwei neue State-Variablen:
```ts
const [skipSubAccountEntry, setSkipSubAccountEntry] = useState(false)
const [skipPairedTransfer, setSkipPairedTransfer] = useState(false)
```

Logik: Wenn `skipSubAccountEntry` auf `true` gesetzt wird, wird `skipPairedTransfer` automatisch auch auf `true` gesetzt. Wenn `skipSubAccountEntry` auf `false` gesetzt wird, wird `skipPairedTransfer` zurückgesetzt.

UI: Neue Sektion im Dialog unter den bestehenden Feldern, mit leichter visueller Abgrenzung (z.B. `border-t`):
```
☐ Unterkonto-Eintrag überspringen        (nur wenn subAccountGroupId != null)
☐ Gegenbuchung überspringen              (nur wenn zusätzlich linkType === 'TRANSFER')
```

Beide Flags werden beim Buchen mitgesendet:
```ts
body: JSON.stringify({ ..., skipSubAccountEntry, skipPairedTransfer })
```

### 4. `POST /api/transactions` erweitern

Zod-Schema um optionale Felder erweitern:
```ts
skipSubAccountEntry: z.boolean().optional().default(false),
skipPairedTransfer: z.boolean().optional().default(false),
```

Logik in der Route:
```ts
if (linkedGroup && !skipSubAccountEntry) {
  // SubAccountEntry erstellen (bisheriger Code)

  if (linkType === 'TRANSFER' && !skipPairedTransfer) {
    // Gegenbuchung erstellen (bisheriger Code)
  }
}
```

## Nicht im Scope

- Persistierung der Override-Entscheidung (gilt nur für die einzelne Buchung)
- Anzeige im Transaktions-Log ob ein Override verwendet wurde
- Änderung der dauerhaften Kategorie-Konfiguration
