# Monatsübersicht — Saldenbericht pro Konto

## Kontext

Der neue Tab "Monatsübersicht" in Berichte zeigt den Saldenverlauf eines Kontos über 12 Monate. Er wird als zweiter Tab nach "Gesamtübersicht" eingefügt.

## Anforderungen

### Konto-Filter
- AppSelect-Dropdown mit allen aktiven Budget-Konten (CHECKING, SAVINGS, CASH, CREDIT_CARD)
- Default: erstes aktives Konto
- Shared State mit den anderen Tabs (Gruppenanalyse, Budget vs. Ist)

### Charts (in dieser Reihenfolge)

#### 1. Gesamtsaldo im Verlauf
- **Typ**: Linienchart, eine Linie
- **Daten**: `mainBalance + subBalance` = kumulativer Gesamtsaldo am Monatsende
- **Farbe**: Indigo (#6366f1)
- **Zeitraum**: 12 Monate

#### 2. Saldo Hauptkonto im Verlauf
- **Typ**: Linienchart, eine Linie
- **Daten**: `SUM(mainAmount)` kumulativ — nur Hauptkonto-Buchungen
- **Farbe**: Grün (#10b981)
- **Zeitraum**: 12 Monate

#### 3. Saldo Unterkonten im Verlauf
- **Typ**: Linienchart, eine Linie
- **Daten**: `SUM(subAmount)` kumulativ — nur Unterkonto-Buchungen
- **Farbe**: Orange (#f59e0b)
- **Zeitraum**: 12 Monate

#### 4. Gruppensalden der Unterkonten
- **Typ**: Jeweils ein eigener Linienchart pro SubAccountGroup
- **Daten**: `initialBalance + SUM(entries.amount)` kumulativ pro Monat
- **Chart-Titel**: `{subAccountName} — {groupName}`
- **Farbe**: Indigo (#6366f1) für alle Linien
- **Zeitraum**: 12 Monate
- **Nur anzeigen** wenn das Konto Unterkonten hat und Gruppen existieren

### Keine Tabelle
Die bisherige Gruppensalden-Tabelle entfällt. Alle Daten werden als Verlaufs-Charts dargestellt.

## API

### `GET /api/reports/account-balance`

**Parameter:**
- `accountId` (required) — Konto-ID
- `months` (optional, default 12) — Anzahl Monate

**Response:** `AccountBalanceMonth[]`

```typescript
interface AccountBalanceMonth {
  year: number
  month: number
  mainBalance: number    // SUM(mainAmount) kumulativ
  subBalance: number     // SUM(subAmount) kumulativ
  totalBalance: number   // mainBalance + subBalance
  groups: AccountBalanceGroupSnapshot[]
}

interface AccountBalanceGroupSnapshot {
  groupId: string
  groupName: string
  subAccountName: string
  balance: number   // initialBalance + SUM(entries.amount) kumulativ
}
```

**Berechnung (effizient für 12 Monate):**
1. Kumulative Salden VOR dem 12-Monats-Fenster ermitteln
2. Monatliche Deltas innerhalb des Fensters aggregieren
3. Running totals berechnen (keine 12 einzelnen Queries)

## Nicht im Scope
- Monats-/Jahres-Selektor (immer letzte 12 Monate)
- Export
- Vergleich zwischen Konten
