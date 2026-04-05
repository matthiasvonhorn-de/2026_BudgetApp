# Duale Betragsfelder auf Transaction

## Ziel

Die Transaction-Tabelle bekommt getrennte Felder fuer Hauptkonto- und Unterkonto-Perspektive. Damit lassen sich alle Salden direkt aus Transaktionen berechnen — ohne Vorzeichen-Invertierung und ohne Doppelzaehlung.

## Schema-Aenderung

### Entfernte Felder
- `amount` (Float) — ersetzt durch mainAmount/subAmount
- `type` (String) — ersetzt durch mainType/subType

### Neue Felder
- `mainAmount` (Float, nullable) — Betrag aus Hauptkonto-Perspektive
- `mainType` (String, default 'INCOME') — INCOME oder EXPENSE. Default INCOME gilt auch wenn mainAmount = 0 oder null.
- `subAmount` (Float, nullable) — Betrag aus Unterkonto-Perspektive
- `subType` (String, nullable) — INCOME oder EXPENSE. Null wenn kein Unterkonto beteiligt.

### Drei Szenarien

| Szenario | mainAmount | mainType | subAmount | subType | Beispiel |
|----------|-----------|----------|-----------|---------|----------|
| Nur Hauptkonto | -500,00 | EXPENSE | null | null | Miete-Zahlung |
| Nur Hauptkonto (Einnahme) | +7.699,27 | INCOME | null | null | Gehalt |
| Hauptkonto + Unterkonto | -125,00 | EXPENSE | +125,00 | INCOME | Kleidung-Allokation via TX-Dialog |
| Nur Unterkonto (Entry) | null | INCOME | +125,00 | INCOME | Entry ueber Sub-Account-UI |
| Anfangssaldo Unterkonto | null | INCOME | +376,09 | INCOME | Positiver Startwert Gruppe |
| Anfangssaldo Unterkonto (Defizit) | null | INCOME | -146,12 | EXPENSE | Negativer Startwert Gruppe |
| Anfangssaldo Hauptkonto | 0,00 | INCOME | null | null | Konto-Eroeffnung |

### Regel fuer mainType
- mainAmount > 0 → INCOME
- mainAmount < 0 → EXPENSE
- mainAmount = 0 oder null → INCOME (kein leeres Feld)

### Regel fuer subType
- Kein Unterkonto beteiligt → null
- subAmount > 0 → INCOME
- subAmount < 0 → EXPENSE
- subAmount = 0 → INCOME

## Berechnungen

Alle Salden werden direkt aus den Transaction-Feldern berechnet:

- **Saldo Hauptkonto** = `SUM(mainAmount)`
- **Saldo Unterkonten** = `SUM(subAmount)`
- **Gesamtsaldo** = `SUM(mainAmount) + SUM(subAmount)` = `Account.currentBalance`
- **Account.currentBalance** = `SUM(mainAmount) + SUM(subAmount)` ueber alle TX des Kontos

### Budget-Ansicht

Die Budget-Tabelle zeigt Kategorie-Aktivitaet getrennt:
- `mainAmount` fliesst in die Kategorie-Aktivitaet der Budget-Tabelle
- `subAmount` fliesst NICHT in die Budget-Tabelle, sondern wird auf dem Tab "Unterkonten" in der entsprechenden Gruppe angezeigt
- `closingActual` = `SUM(alle mainAmount) + SUM(alle subAmount)` bis Monatsende
- Gesamtsaldo = closingActual (keine Addition von subAccountsBalance noetig, da subAmount bereits enthalten)

### Saldo Unterkonten in der Budget-Ansicht

`subAccountsBalance` wird NICHT mehr separat aus Entries berechnet, sondern: `SUM(subAmount)` ueber alle TX des Kontos bis zum jeweiligen Monat. Die SubAccount/SubAccountGroup `initialBalance`-Felder werden auf 0 gesetzt, da Anfangssalden als Transactions abgebildet sind.

## Bearbeitung und Kaskade

### Transaktion mit beiden Seiten (mainAmount + subAmount)
- Bearbeitung von mainAmount → subAmount wird proportional angepasst (Betrag synchron)
- Bearbeitung ueber den TX-Dialog: beide Seiten werden aktualisiert

### Transaktion nur Unterkonto (mainAmount = null)
- Bearbeitung aendert nur subAmount
- mainAmount bleibt null — es gibt nichts zum Synchronisieren

### Bidirektionale Kaskade
- Entry loeschen → verknuepfte Transaction wird mitgeloescht
- Transaction loeschen → verknuepfter Entry wird mitgeloescht
- Entry bearbeiten → subAmount der verknuepften Transaction wird synchronisiert
- Transaction bearbeiten → Entry.amount wird synchronisiert (= subAmount)

## Service Layer Anpassungen

### createLinkedEntry()
- Erstellt Transaction mit: mainAmount=null, mainType='INCOME', subAmount=entry.amount, subType nach Vorzeichen

### createEntryFromTransaction()
- Erstellt Transaction mit: mainAmount=user.amount, mainType nach Vorzeichen, subAmount=-mainAmount, subType nach Vorzeichen
- Entry.amount = subAmount

### updateLinkedEntry()
- Aktualisiert subAmount auf der verknuepften Transaction
- mainAmount bleibt unveraendert (nur bei sub-only TX ist mainAmount null)
- Bei TX mit beiden Seiten: mainAmount wird proportional angepasst

### deleteLinkedEntry()
- Balance-Korrektur: `increment: -(mainAmount + subAmount)` (Gesamt-Effekt rueckgaengig machen)
- Oder getrennt: `increment: -mainAmount` fuer Hauptkonto-Anteil, subAmount wird ueber Entry-Loeschung abgedeckt

### Balance-Updates
- Bei Create: `currentBalance += (mainAmount ?? 0) + (subAmount ?? 0)`
- Bei Delete: `currentBalance -= (mainAmount ?? 0) + (subAmount ?? 0)`
- Bei Update: Differenz berechnen und anwenden

## Migration

### Vorbereitung
1. `dev.db` loeschen
2. `prod.db` nach `dev.db` kopieren

### SQL-Migration (`prisma/migrations/20260405_dual_amount_fields.sql`)

**Schritt 1: Neue Spalten hinzufuegen**
```sql
ALTER TABLE Transaction ADD COLUMN mainAmount REAL;
ALTER TABLE Transaction ADD COLUMN mainType TEXT NOT NULL DEFAULT 'INCOME';
ALTER TABLE Transaction ADD COLUMN subAmount REAL;
ALTER TABLE Transaction ADD COLUMN subType TEXT;
```

**Schritt 2: Bestehende Daten migrieren**

Regulaere Transaktionen (ohne subAccountEntryId):
```sql
UPDATE Transaction SET mainAmount = amount, mainType = type
WHERE subAccountEntryId IS NULL;
```

Transaktionen mit Entry-Verknuepfung (erstellt via TX-Dialog, haben sowohl Hauptkonto- als auch Unterkonto-Effekt):
```sql
UPDATE Transaction SET
  mainAmount = amount,
  mainType = type,
  subAmount = (SELECT -amount FROM Transaction t2 WHERE t2.id = Transaction.id),
  -- subAmount = -mainAmount (Allokation: Hauptkonto gibt ab, Unterkonto nimmt auf)
  subType = CASE WHEN -amount > 0 THEN 'INCOME' ELSE 'EXPENSE' END
WHERE subAccountEntryId IS NOT NULL;
```

Hinweis: `subAmount = -mainAmount` da bei einer Allokation der Hauptkonto-Abfluss dem Unterkonto-Zufluss entspricht.

**Schritt 3: Entries ohne Transaction — neue Transactions erstellen**

Fuer SubAccountEntries die keine verknuepfte Transaction haben:
```sql
INSERT INTO Transaction (id, date, mainAmount, mainType, subAmount, subType, description, accountId, categoryId, status, subAccountEntryId, createdAt, updatedAt)
SELECT
  [uuid],
  e.date,
  NULL,
  'INCOME',
  e.amount,
  CASE WHEN e.amount > 0 THEN 'INCOME' ELSE 'EXPENSE' END,
  e.description,
  sa.accountId,
  (SELECT MIN(c.id) FROM Category c WHERE c.subAccountGroupId = g.id),
  'CLEARED',
  e.id,
  datetime('now'),
  datetime('now')
FROM SubAccountEntry e
JOIN SubAccountGroup g ON e.groupId = g.id
JOIN SubAccount sa ON g.subAccountId = sa.id
WHERE NOT EXISTS (SELECT 1 FROM Transaction t WHERE t.subAccountEntryId = e.id);
```

**Schritt 4: Anfangssaldo-Transaktionen fuer SubAccountGroup.initialBalance**

Fuer jede Gruppe mit initialBalance != 0:
```sql
-- Entry erstellen
INSERT INTO SubAccountEntry (id, date, description, amount, fromBudget, groupId, ...)
-- amount = initialBalance

-- Transaction erstellen
INSERT INTO Transaction (mainAmount, mainType, subAmount, subType, subAccountEntryId, ...)
-- mainAmount = NULL, mainType = 'INCOME'
-- subAmount = initialBalance
-- subType = CASE WHEN initialBalance > 0 THEN 'INCOME' ELSE 'EXPENSE' END

-- initialBalance auf 0 setzen
UPDATE SubAccountGroup SET initialBalance = 0 WHERE ...;
```

Datum fuer Anfangssaldo: 2025-12-31 (vor dem ersten Monat).

**Schritt 5: Anfangssaldo Hauptkonto**

Eine Transaction mit mainAmount = 0, mainType = 'INCOME', subAmount = NULL, subType = NULL, description = 'Anfangssaldo Hauptkonto', Datum = 2025-12-31.

**Schritt 6: Alte Spalten entfernen**
```sql
ALTER TABLE Transaction DROP COLUMN amount;
ALTER TABLE Transaction DROP COLUMN type;
```

**Schritt 7: currentBalance neu berechnen**
```sql
UPDATE Account SET currentBalance = (
  SELECT COALESCE(SUM(COALESCE(t.mainAmount, 0) + COALESCE(t.subAmount, 0)), 0)
  FROM Transaction t WHERE t.accountId = Account.id
) WHERE id IN (SELECT DISTINCT sa.accountId FROM SubAccount sa);
```

## Betroffene Dateien

### Schema
- `prisma/schema.prisma` — amount/type entfernen, mainAmount/mainType/subAmount/subType hinzufuegen

### Service Layer
- `src/lib/sub-account-entries/service.ts` — alle Funktionen auf neue Felder umstellen

### API Routes
- `src/app/api/transactions/route.ts` — GET und POST auf neue Felder
- `src/app/api/transactions/[id]/route.ts` — PUT und DELETE auf neue Felder
- `src/app/api/sub-account-groups/[id]/entries/route.ts` — keine Aenderung (ruft Service auf)
- `src/app/api/sub-account-entries/[id]/route.ts` — keine Aenderung (ruft Service auf)
- `src/app/api/sub-accounts/route.ts` — correctedBalance durch SUM(subAmount) ersetzen
- `src/app/api/accounts/[id]/budget/[year]/[month]/route.ts` — Berechnung auf mainAmount + subAmount umstellen

### UI Components
- `src/components/transactions/TransactionFormDialog.tsx` — mainAmount/mainType statt amount/type
- `src/app/(app)/transactions/page.tsx` — Anzeige und Edit auf neue Felder
- `src/components/accounts/AccountBudgetTab.tsx` — Header-Formeln anpassen
- `src/components/accounts/SubAccountsSection.tsx` — keine Aenderung (nutzt Entry.amount)

### Types
- `src/types/api.ts` — Transaction-Interface aktualisieren
- `src/lib/schemas/transactions.ts` — Zod-Schemas aktualisieren

### Migration
- `prisma/migrations/20260405_dual_amount_fields.sql` — Komplettes Migrationsscript
