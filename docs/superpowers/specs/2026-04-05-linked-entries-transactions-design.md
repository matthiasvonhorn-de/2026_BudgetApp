# Linked Sub-Account Entries & Transactions

## Ziel

Sub-Account-Eintraege und Transaktionen sollen immer als verknuepftes Paar existieren. Jeder Eintrag erzeugt eine Transaktion, jede Transaktion mit Kategorie-Link erzeugt einen Eintrag. Loeschen und Bearbeiten kaskadiert bidirektional. Zusaetzlich wird die Transaktionsuebersicht um Einzel- und Massen-Editing erweitert.

## Drei Aenderungsbereiche

1. **Shared Service Layer** — zentrale Geschaeftslogik fuer Entry+Transaction-Paare
2. **Bidirektionale Verknuepfung** — Entry-Erstellung erzeugt Transaktion, Transaktion-Erstellung erzeugt Entry
3. **Transaction Editing UI** — Einzel-Edit (Dialog) und Massen-Edit (Inline) in der Transaktionsuebersicht

---

## 1. Shared Service Layer

### Neue Datei: `src/lib/sub-account-entries/service.ts`

Kernfunktionen, die Entry + Transaktion immer gemeinsam verwalten. Alle Operationen nutzen `prisma.$transaction()` fuer Atomaritaet.

### Vorzeichen-Konvention

Entry und Transaction haben invertierte Vorzeichen (bestehende Konvention):
- Entry +50 (Geld in Sub-Account) → Transaction -50 (EXPENSE auf Hauptkonto)
- Entry -50 (Geld aus Sub-Account) → Transaction +50 (INCOME auf Hauptkonto)
- Formel: `transaction.amount = -entry.amount`

### `createLinkedEntry(data)`

**Input:**
- `groupId` — SubAccountGroup-ID
- `categoryId` — Kategorie-ID (vom UI-Kontext uebergeben, nicht aus der Gruppe nachgeschlagen)
- `date` — Datum
- `description` — Beschreibung
- `amount` — Betrag (positiv oder negativ, aus Entry-Perspektive)
- `fromBudget` — Boolean (default: false)

**Validierung:**
- SubAccountGroup laden inkl. `subAccount.accountId`
- Pruefen, dass die uebergebene `categoryId` zu einer Kategorie gehoert, deren `subAccountGroupId === groupId`. Falls nicht → Fehler 400: "Kategorie gehoert nicht zu dieser Gruppe."
- Pruefen, dass die Kategorie `subAccountLinkType !== 'TRANSFER'` hat. Falls doch → Fehler 400: "TRANSFER-Eintraege muessen ueber den Transaktions-Dialog erstellt werden." (Der Linktyp sitzt auf `Category`, nicht auf der Gruppe.)

**Ablauf:**
1. `SubAccountEntry` erstellen mit den uebergebenen Feldern
2. `Transaction` erstellen mit:
   - `accountId`: vom uebergeordneten Konto (`subAccount.accountId`)
   - `categoryId`: aus dem Input-Parameter
   - `amount`: `-entry.amount` (invertiert)
   - `type`: `INCOME` wenn transaction.amount > 0, `EXPENSE` wenn < 0
   - `date`, `description`: aus den Entry-Daten
   - `subAccountEntryId`: Verknuepfung zum Entry
   - `status`: `PENDING`
3. Kontostand des uebergeordneten Kontos aktualisieren (`increment: transaction.amount`)

**Return:** `{ entry, transaction }`

### `updateLinkedEntry(entryId, data)`

**Input:**
- `entryId` — SubAccountEntry-ID
- `data` — Partielle Felder: `date?`, `description?`, `amount?`

**Ablauf:**
1. Bestehenden Entry laden inkl. verknuepfter Transaction und `group.subAccount.accountId`
2. Alten Transaction-Betrag merken (`oldTransactionAmount`)
3. Entry aktualisieren
4. Neuen Transaction-Betrag berechnen: `newTransactionAmount = -newEntry.amount`
5. Verknuepfte Transaction aktualisieren: `amount`, `type`, `date`, `description`
6. Kontostand-Differenz anwenden: `increment: newTransactionAmount - oldTransactionAmount`

**Return:** `{ entry, transaction }`

### `deleteLinkedEntry(entryId)`

**Input:**
- `entryId` — SubAccountEntry-ID

**Ablauf:**
1. Entry laden inkl. Transaction und `group.subAccount.accountId`
2. Kontostand korrigieren: `increment: -transaction.amount` (macht das Create rueckgaengig)
3. Transaction loeschen (haelt den FK, muss zuerst geloescht werden)
4. Entry loeschen

**Loeschreihenfolge:** Transaction vor Entry, da `Transaction.subAccountEntryId` der FK ist. Innerhalb einer `prisma.$transaction()` ist die Reihenfolge relevant fuer FK-Constraints.

**Return:** `void`

### Umgekehrte Richtung: Transaction-basierte Funktionen

Fuer den Fall, dass eine Transaktion erstellt/geloescht wird und dabei ein Entry betroffen ist:

**`createEntryFromTransaction(transactionData, linkedGroup)`**
- Wird aus dem Transaction-POST-Handler aufgerufen wenn eine Kategorie mit SubAccountGroup-Link gewaehlt wird
- Erstellt Entry mit `amount = -transactionData.amount`, `fromBudget: true`
- Verknuepft Transaction mit Entry
- Bei TRANSFER-Linktyp: erstellt zusaetzlich die gepaarte TRANSFER-Transaktion auf dem Zielkonto (inkl. transferToId und Saldo-Update beider Konten) — bestehende Logik wird hierhin verschoben
- Existierende Logik aus `/api/transactions/route.ts` (Zeilen 111-161) wird hierhin verschoben

**`updateEntryFromTransaction(transactionId, data)`**
- Wird aus dem Transaction-PUT-Handler aufgerufen
- Synchronisiert Entry-Felder mit Transaction-Aenderungen: `entry.amount = -transaction.amount`, `date`, `description`
- Bei TRANSFER: synchronisiert auch die gepaarte Transaction
- Existierende Logik aus `/api/transactions/[id]/route.ts` (Zeilen 41-72) wird hierhin verschoben

**`deleteEntryFromTransaction(transactionId)`**
- Wird aus dem Transaction-DELETE-Handler aufgerufen
- Loescht den verknuepften Entry
- Bei TRANSFER: loescht auch die gepaarte Transaction und korrigiert beide Kontosalden
- Loeschreihenfolge: erst `subAccountEntryId` auf null setzen, dann Entry loeschen — oder Transaction und Entry gemeinsam in korrekter Reihenfolge loeschen
- Existierende Logik wird hierhin verschoben

### API-Routen als Wrapper

Nach dem Refactoring rufen die API-Routen nur noch den Service Layer auf:

```
POST   /api/sub-account-groups/[id]/entries    →  createLinkedEntry()
DELETE /api/sub-account-entries/[id]           →  deleteLinkedEntry()
POST   /api/transactions (mit Kategorie-Link)  →  createEntryFromTransaction()
PUT    /api/transactions/[id] (mit Entry)      →  updateEntryFromTransaction()
DELETE /api/transactions/[id] (mit Entry)      →  deleteEntryFromTransaction()
```

---

## 2. Bidirektionale Verknuepfung

### Entry-Erstellung (SubAccounts UI)

**Aktuelles Verhalten:** `POST /api/sub-account-groups/[id]/entries` erstellt nur einen SubAccountEntry.

**Neues Verhalten:** Der Endpunkt ruft `createLinkedEntry()` auf. Eine Transaktion wird automatisch miterstellt auf dem uebergeordneten Konto mit der uebergebenen Kategorie.

**Einschraenkung:** Entry-Erstellung ueber die Sub-Account-UI ist nur fuer BOOKING-Gruppen moeglich. Bei TRANSFER-Gruppen wird der "Eintrag hinzufuegen"-Link nicht angezeigt (bzw. die API gibt 400 zurueck), da TRANSFER zwei Konten erfordert und nur ueber den Transaktions-Dialog erstellt werden kann.

### Transaction-Erstellung (Transaction UI)

**Aktuelles Verhalten:** Wenn die gewaehlte Kategorie einen SubAccountGroup-Link hat, wird ein Entry erstellt und verknuepft. Funktioniert bereits.

**Neues Verhalten:** Gleiche Logik, aber ueber `createEntryFromTransaction()` im Service Layer statt inline im Route-Handler. Unterstuetzt sowohl BOOKING als auch TRANSFER.

### CSV-Import

Wenn der CSV-Import eine Kategorie mit SubAccountGroup-Link setzt, muss derselbe Service-Layer-Pfad (`createEntryFromTransaction()`) aufgerufen werden. Andernfalls entstehen verwaiste Transaktionen ohne Entry.

### Loeschen

**Bidirektionale Kaskade:**
- Entry loeschen → Transaction wird mitgeloescht (via `deleteLinkedEntry()`)
- Transaction loeschen → Entry wird mitgeloescht (via `deleteEntryFromTransaction()`)

### Bearbeiten

**Bidirektionale Synchronisation:**
- Entry bearbeiten → Transaction-Felder werden synchronisiert
- Transaction bearbeiten → Entry-Felder werden synchronisiert
- Synchronisierte Felder: `date`, `description`, `amount` (mit Vorzeichen-Invertierung)
- Bei Betragsaenderung: Transaction-`type` wird nach Transaction-Vorzeichen angepasst

---

## 3. Transaction Editing UI

### 3a: Zeilen-Edit (Einzelne Transaktion)

**Aenderung an:** `src/app/(app)/transactions/page.tsx`

- Jede Tabellenzeile bekommt einen **Edit-Button** (Stift-Icon) neben dem bestehenden Delete-Button
- Klick oeffnet den `TransactionFormDialog` im Edit-Modus:
  - Alle Felder vorausgefuellt mit aktuellen Werten
  - Speichern ruft `PUT /api/transactions/[id]` auf
  - Dialog schliesst nach erfolgreichem Speichern

**Aenderung an:** `src/components/transactions/TransactionFormDialog.tsx`

- Neuer Prop: `editTransaction?: Transaction` (optional)
- Wenn gesetzt: Formular wird vorausgefuellt, Submit ruft PUT statt POST auf
- Titel aendert sich zu "Transaktion bearbeiten"

**Einzel-Edit: erlaubte Uebergaenge bei verknuepften Transaktionen**

Wenn eine Transaktion mit `subAccountEntryId` im Dialog bearbeitet wird, muss `updateEntryFromTransaction()` folgende Kategorie-Wechsel korrekt handhaben:

| Uebergang | Verhalten |
|-----------|-----------|
| Kategorie → gleiche Gruppe | Entry bleibt, `categoryId` wird aktualisiert |
| Kategorie → andere Gruppe | Alter Entry wird geloescht, neuer Entry in neuer Gruppe erstellt |
| Kategorie → ohne Gruppe | Entry wird geloescht, Transaction verliert `subAccountEntryId` |
| Keine Gruppe → Kategorie mit Gruppe | Neuer Entry wird erstellt und verknuepft |

Bei Konto-Wechsel: analoges Verhalten — alter Entry/Transaction-Link wird aufgeloest, neuer Entry auf dem neuen Konto erstellt (sofern die Kategorie dort eine passende Gruppe hat). Falls keine passende Gruppe existiert → Entry wird geloescht, Transaction bleibt ohne Entry.

Diese Logik existiert bereits im aktuellen PUT-Handler und wird in `updateEntryFromTransaction()` verschoben.

### 3b: Massen-Edit (Inline-Editing)

**Aenderung an:** `src/app/(app)/transactions/page.tsx`

**UI-Ablauf:**
1. In der Tabellenueberschrift erscheint ein **Edit-Button** (Stift-Icon)
2. Klick aktiviert den Inline-Edit-Modus:
   - Der Edit-Button wird zum **Speichern-Button** (gleiche Position)
   - Daneben erscheint ein **Abbrechen-Button**
   - Alle sichtbaren Zeilen werden editierbar
3. Editierbare Felder pro Zeile:
   - **Datum**: Date-Input
   - **Beschreibung**: Text-Input
   - **Betrag**: Number-Input
   - **Konto**: AppSelect-Dropdown — **read-only bei Zeilen mit `subAccountEntryId`**
   - **Kategorie**: AppSelect-Dropdown (gruppiert nach CategoryGroup) — **read-only bei Zeilen mit `subAccountEntryId`**
4. Geaenderte Zeilen werden visuell hervorgehoben (z.B. leichter farbiger Hintergrund)
5. Klick auf Speichern:
   - Nur tatsaechlich geaenderte Zeilen werden gespeichert
   - Sequentielle PUT-Requests pro geaenderter Zeile
   - Bei Fehler: bereits gespeicherte Zeilen bleiben gespeichert, fehlgeschlagene Zeilen bleiben im Edit-Modus mit Fehlermeldung
   - Nach Abschluss: Tabelle kehrt in den Lese-Modus zurueck
6. Klick auf Abbrechen: Alle Aenderungen verwerfen, zurueck zum Lese-Modus

**Einschraenkung bei verknuepften Zeilen:** Transaktionen mit `subAccountEntryId` koennen im Massen-Edit nur Datum, Beschreibung und Betrag aendern. Konto- und Kategorie-Aenderungen erfordern den Einzel-Edit-Dialog, wo der Service Layer die noetige Entry-Korrektur (Verschieben, Loeschen, Neuanlegen) durchfuehren kann.

**State-Management (seitenlokal):**
- `isEditMode: boolean` — steuert Lese-/Edit-Darstellung
- `editingRows: Record<string, Partial<TransactionFormData>>` — speichert Aenderungen pro Zeile bis zum Batch-Save
- Kein Zustand-Store noetig, da der State nur auf der Transaktionsseite relevant ist

---

## 4. Cache-Invalidierung

### Invalidierungsstrategie

Jede Mutation invalidiert die betroffenen TanStack Query Keys:

| Aktion | Invalidierte Query Keys |
|--------|------------------------|
| Entry erstellen/loeschen | `transactions`, `sub-accounts`, `accounts` |
| Transaction erstellen/loeschen (mit Entry) | `transactions`, `sub-accounts`, `accounts` |
| Transaction erstellen/loeschen (ohne Entry) | `transactions`, `accounts` |
| Transaction/Entry updaten | `transactions`, `sub-accounts`, `accounts` |
| TRANSFER erstellen/loeschen/updaten | `transactions`, `sub-accounts`, `accounts` (beide Konten) |
| Massen-Edit (Batch) | Einmalig nach letztem PUT: `transactions`, `sub-accounts`, `accounts` |

### Umsetzung

- Invalidierung erfolgt in den TanStack `useMutation`-Hooks (clientseitig), nicht im Service Layer (serverseitig)
- Bestehende Hooks (`useTransactions`, `useSubAccounts`) werden um fehlende Invalidierungen ergaenzt
- Beim Massen-Edit wird `queryClient.invalidateQueries()` erst nach dem letzten Request aufgerufen
- Bei TRANSFER-Mutationen muessen beide betroffenen Konten invalidiert werden

---

## 5. Berechnungen

- **Sub-Account-Balance**: `initialBalance + SUM(entries.amount)` — bleibt identisch, da Entries weiterhin existieren
- **correctedBalance** (Budget-API): Muss aktualisiert werden. Bisher werden nur `TRANSFER` + `EXPENSE mit subAccountEntryId` ausgeschlossen. Neu: **alle** Transaktionen mit `subAccountEntryId` ausschliessen (auch INCOME), da diese nur interne Umbuchungen darstellen. Filter aendern von:
  ```
  OR: [
    { type: 'TRANSFER' },
    { type: 'EXPENSE', subAccountEntryId: { not: null } },
  ]
  ```
  zu:
  ```
  OR: [
    { type: 'TRANSFER' },
    { subAccountEntryId: { not: null } },
  ]
  ```
- **Account-Balance**: Wird vom Service Layer korrekt aktualisiert bei Create/Update/Delete
- **Nach Migration und correctedBalance-Aenderung**: Gezielt testen mit einem Konto das Subkonten und Budget-Ansicht hat, um sicherzustellen dass keine Budget-Zahlen springen

---

## 6. Migration bestehender Daten

**Gewaehlt: Option A — Retroaktive Migration**

Ein Migrations-Script erstellt fuer jeden bestehenden SubAccountEntry ohne verknuepfte Transaction eine neue Transaction.

**Wichtig — keine Doppelzaehlung:** Bestehende Entries existierten bisher **ohne Auswirkung auf `currentBalance`** des Hauptkontos. Die Migration darf daher NICHT einfach `currentBalance` inkrementieren, da der aktuelle Saldo bereits korrekt ist.

**Ablauf:**
1. Fuer jeden Entry ohne Transaction: Transaction erstellen mit korrekten Feldern (amount = -entry.amount, accountId vom uebergeordneten Konto, categoryId von verknuepfter Kategorie, status: CLEARED)
2. **Keine Balance-Inkremente** bei der Transaction-Erstellung
3. Nach Erstellung aller Transactions: `currentBalance` pro betroffenem Konto **neu berechnen** als `SUM(alle Transaction.amount)` — damit der Saldo die neuen Transactions korrekt widerspiegelt
4. correctedBalance-Filter gleichzeitig aktualisieren, damit die Nettoanzeige stabil bleibt

**Status der migrierten Transactions:** `CLEARED` (nicht PENDING), da diese historische, bereits vollzogene Buchungen darstellen.

**fromBudget-Flag:** `fromBudget` existiert nur auf `SubAccountEntry`, nicht auf `Transaction`. Bestehende Entries behalten ihren Wert. Reporting/Filter, die `fromBudget` benoetigen, lesen diesen Wert weiterhin ueber den verknuepften Entry (`transaction.subAccountEntry.fromBudget`).

**categoryId pro Entry:** Mehrere Kategorien koennen dieselbe SubAccountGroup referenzieren. Fuer das Backfill-Script gilt die deterministische Regel: `MIN(category.id)` unter allen Kategorien mit `subAccountGroupId === entry.groupId`. Falls keine Kategorie existiert, wird die Transaction ohne `categoryId` erstellt (mit Warnung im Migrations-Log).

**Neuberechnung currentBalance:** Das `Account`-Modell hat kein `initialBalance` — nur `currentBalance`, das bei Erstellung auf 0 steht und danach ausschliesslich durch Transaction-Inkremente veraendert wird. Die Neuberechnungsformel ist daher: `currentBalance_neu = SUM(transaction.amount) WHERE accountId = ?`. Falls der neu berechnete Saldo vom bisherigen `currentBalance` abweicht (z.B. durch fruehere manuelle Anpassungen), wird die Abweichung im Migrations-Log ausgegeben, damit der Nutzer diese pruefen kann.

Das Migrations-Script wird als SQL-Datei in `prisma/migrations/` abgelegt.

---

## 7. Betroffene Dateien

### Neue Dateien
- `src/lib/sub-account-entries/service.ts` — Shared Service Layer

### Zu aendernde Dateien
- `src/app/api/sub-account-groups/[id]/entries/route.ts` — Refactor zu Service-Wrapper
- `src/app/api/sub-account-entries/[id]/route.ts` — Refactor zu Service-Wrapper
- `src/app/api/transactions/route.ts` — Entry-Logik in Service auslagern, CSV-Import-Pfad anpassen
- `src/app/api/transactions/[id]/route.ts` — Entry-Sync-Logik in Service auslagern
- `src/app/api/sub-accounts/route.ts` — correctedBalance-Filter aktualisieren (alle Transactions mit subAccountEntryId ausschliessen)
- `src/app/(app)/transactions/page.tsx` — Edit-Button pro Zeile + Massen-Edit-Modus
- `src/components/transactions/TransactionFormDialog.tsx` — Edit-Modus mit Prefill
- `src/components/accounts/SubAccountsSection.tsx` — Query-Invalidierung ergaenzen, "Eintrag hinzufuegen" bei TRANSFER-Gruppen ausblenden

### Neue Migrations-Datei
- `prisma/migrations/20260405_backfill_entry_transactions.sql` — Retroaktive Transactions fuer bestehende Entries + Neuberechnung der Kontosalden

### Keine Aenderung noetig
- `prisma/schema.prisma` — Datenmodell passt bereits (subAccountEntryId existiert)
- `src/lib/budget/calculations.ts` — Berechnungslogik bleibt gleich
- `src/components/ui/*` — Keine UI-Primitive betroffen
