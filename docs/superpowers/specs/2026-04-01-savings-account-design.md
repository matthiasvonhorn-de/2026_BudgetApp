# Spec: Sparkonto / Sparplan Feature

**Datum:** 2026-04-01  
**Status:** Entwurf — wartet auf Freigabe

---

## 1. Kernprinzip

Ein Sparkonto / Festgeldkonto ist ein **vollwertiges `Account`** mit eigenem
`currentBalance` und eigener Transaktionsliste — genau wie ein Girokonto.

Automatische Buchungen (Sparraten + Zinsen) werden per Klick ausgelöst und
als `Transaction`-Einträge auf dem Sparkonto-Account gespeichert.

Damit erscheint das Konto natürlich in der Kontenübersicht, sein Saldo fließt
in das Gesamtguthaben ein, und alle Buchungen sind über die normale
Transaktionsansicht nachvollziehbar.

---

## 2. Zwei Varianten

| | **Sparplan** | **Festgeld** |
|---|---|---|
| Account-Typ | `SPARPLAN` | `FESTGELD` |
| Regelmäßige Einzahlungen | ✓ (konfigurierbar) | ✗ |
| Startkapital | optional | Pflicht |
| Zinsbuchungen | ✓ INCOME auf Sparkonto | ✓ INCOME auf Festgeldkonto |
| Buchungen auf Girokonto | ✓ EXPENSE (optional) | ✗ (Einmalzahlung entfällt) |
| Verknüpfung Girokonto/Kategorie | optional | ✗ |
| IBAN / Kontonummer | optional | optional |
| Enddatum | optional | optional |

---

## 3. Datenbankschema

### 3.1 Erweiterung `AccountType` (schema.prisma)

```prisma
enum AccountType {
  CHECKING
  SAVINGS       // bestehend — bleibt für manuelle Sparkonten ohne Plan
  CREDIT_CARD
  CASH
  INVESTMENT
  SPARPLAN      // neu — Sparkonto mit Zahlungsplan
  FESTGELD      // neu — Festgeldkonto mit Zahlungsplan
}
```

### 3.2 Neues Modell `SavingsConfig`

1:1-Verknüpfung mit einem `Account` vom Typ SPARPLAN oder FESTGELD.
Enthält alle spar-spezifischen Parameter.

```prisma
model SavingsConfig {
  id                    String            @id @default(cuid())
  accountId             String            @unique  // das Sparkonto-Account
  account               Account           @relation(fields: [accountId], references: [id])

  initialBalance        Float             @default(0)
  accountNumber         String?           // IBAN / Kontonummer (informativ)

  // Nur SPARPLAN:
  contributionAmount    Float             @default(0)
  contributionFrequency SavingsFrequency?

  // Beide Typen:
  interestRate          Float             // p.a. als Dezimal (z.B. 0.03 = 3 %)
  interestFrequency     SavingsFrequency

  startDate             DateTime
  termMonths            Int?              // null = unbegrenzt

  // Nur SPARPLAN — Girokonto für automatische EXPENSE-Buchungen:
  linkedAccountId       String?
  linkedAccount         Account?          @relation("SavingsLinkedAccount",
                                            fields: [linkedAccountId], references: [id])
  categoryId            String?           // Kategorie für EXPENSE auf Girokonto

  notes                 String?
  createdAt             DateTime          @default(now())

  entries               SavingsEntry[]
}
```

> `Account` bekommt zwei neue Relations in schema.prisma:
> ```prisma
> savingsConfig       SavingsConfig?   // wenn Typ SPARPLAN oder FESTGELD
> linkedSavingsPlans  SavingsConfig[]  @relation("SavingsLinkedAccount")
> ```

### 3.3 Neue Enums

```prisma
enum SavingsFrequency {
  MONTHLY
  QUARTERLY
  ANNUALLY
}

enum SavingsEntryType {
  CONTRIBUTION   // Sparrate (nur SPARPLAN)
  INTEREST       // Zinsgutschrift (beide Typen)
}
```

### 3.4 Neues Modell `SavingsEntry`

```prisma
model SavingsEntry {
  id               String           @id @default(cuid())
  savingsConfigId  String
  savingsConfig    SavingsConfig    @relation(fields: [savingsConfigId], references: [id],
                                      onDelete: Cascade)

  entryType        SavingsEntryType
  periodNumber     Int
  dueDate          DateTime

  scheduledAmount  Float            // Sparrate ODER geplanter Zinsbetrag
  scheduledBalance Float            // geplanter Saldo nach diesem Eintrag

  // Gesetzt sobald die Buchung ausgelöst wurde:
  paidAt           DateTime?
  transactionId    String?          // INCOME-Transaktion auf dem Sparkonto-Account
  giroTransactionId String?         // EXPENSE-Transaktion auf dem Girokonto (nur CONTRIBUTION)

  @@index([savingsConfigId])
  @@unique([savingsConfigId, entryType, periodNumber])
}
```

---

## 4. Buchungslogik

### 4.1 Sparrate als bezahlt markieren (SPARPLAN)

Auslöser: Klick auf „Als bezahlt markieren" oder „Bezahlt bis"-Datum

**Schritt 1 — INCOME auf Sparkonto:**
```
Transaction {
  accountId:   savingsConfig.accountId   (das Sparkonto)
  type:        INCOME
  amount:      +entry.scheduledAmount
  description: "Sparrate"
  date:        entry.dueDate
  categoryId:  null
  status:      CLEARED
}
Account(sparkonto).currentBalance += entry.scheduledAmount
```

**Schritt 2 — EXPENSE auf Girokonto (nur wenn linkedAccountId gesetzt):**
```
Transaction {
  accountId:   savingsConfig.linkedAccountId
  type:        EXPENSE
  amount:      -entry.scheduledAmount
  description: "Sparrate: [Sparkonto-Name]"
  date:        entry.dueDate
  categoryId:  savingsConfig.categoryId
  status:      CLEARED
}
Account(girokonto).currentBalance -= entry.scheduledAmount
```

→ `entry.transactionId` = ID der INCOME-Transaktion  
→ `entry.giroTransactionId` = ID der EXPENSE-Transaktion  

### 4.2 Zinsgutschrift buchen (beide Typen)

Zinsgutschriften werden **automatisch** gebucht, wenn der Nutzer auf
„Als bezahlt markieren" / „Bezahlt bis" klickt.  
Fällige INTEREST-Einträge vor der CONTRIBUTION desselben Datums werden
immer zuerst verarbeitet.

```
Transaction {
  accountId:   savingsConfig.accountId   (das Sparkonto)
  type:        INCOME
  amount:      +entry.scheduledAmount
  description: "Zinsgutschrift"
  date:        entry.dueDate
  categoryId:  null
  status:      CLEARED
}
Account(sparkonto).currentBalance += entry.scheduledAmount
entry.transactionId = neue Transaction.id
entry.paidAt = now()
```

### 4.3 Markierung rückgängig machen

- INCOME-Transaktion auf Sparkonto löschen, `currentBalance` korrigieren
- EXPENSE-Transaktion auf Girokonto löschen (falls vorhanden), `currentBalance` korrigieren
- `entry.paidAt`, `entry.transactionId`, `entry.giroTransactionId` = null

---

## 5. Zahlungsplan-Berechnung

### 5.1 Algorithmus (`src/lib/savings/schedule.ts`)

```
balance = initialBalance
Generiere bis termMonths (oder 60 Monate wenn unbegrenzt)

Für jede Periode t (aufsteigend nach Datum):
  1. Wenn Zinsgutschrift in dieser Periode fällig:
       interest = balance × (interestRate / periodsPerYear)
       Erstelle INTEREST-Eintrag:
         scheduledAmount  = interest
         scheduledBalance = balance + interest
       balance += interest

  2. Wenn Sparrate fällig (nur SPARPLAN):
       Erstelle CONTRIBUTION-Eintrag:
         scheduledAmount  = contributionAmount
         scheduledBalance = balance + contributionAmount
       balance += contributionAmount
```

Zinsen werden immer **vor** der gleichzeitigen Sparrate berechnet.

### 5.2 Frequenz-Mapping

| SavingsFrequency | Perioden/Jahr | Zinsdivisor |
|---|---|---|
| MONTHLY | 12 | 12 |
| QUARTERLY | 4 | 4 |
| ANNUALLY | 1 | 1 |

---

## 6. Neuberechnung bei Zinssatz-Änderung

Wenn nur `interestRate` geändert wird:

1. Alle unbezahlten `INTEREST`-Einträge löschen
2. Bereits bezahlte `INTEREST`-Einträge **behalten** (Buchungen bleiben)
3. Neue `INTEREST`-Einträge mit neuem Zinssatz berechnen (ab dem ersten noch offenen Termin)
4. `scheduledBalance` aller noch offenen Einträge (INTEREST + CONTRIBUTION) neu berechnen

Alle anderen Parameteränderungen (Name, IBAN, Girokonto, Kategorie, Notizen)
→ reines Metadaten-Update, keine Plan-Neuberechnung.

---

## 7. API-Routen

```
GET    /api/savings                           → Liste aller aktiven Sparkonten (mit Stats)
POST   /api/savings                           → Sparkonto anlegen (Account + SavingsConfig + Einträge)
GET    /api/savings/[id]                      → Einzelkonto inkl. Einträge + Stats
PUT    /api/savings/[id]                      → Zinssatz oder Metadaten ändern
DELETE /api/savings/[id]                      → Soft-delete (Account.isActive = false)

POST   /api/savings/[id]/pay                  → Fällige Einträge bis Datum buchen
                                                 (body: { paidUntil: "YYYY-MM-DD" })
DELETE /api/savings/[id]/entries/[eid]/pay    → Einzelne Buchung rückgängig machen
```

---

## 8. UI

### 8.1 Kontenübersicht (`/accounts`)

- Sparkonten (Typ SPARPLAN/FESTGELD) erscheinen in der bestehenden Kontenliste
- Badge „Sparplan" / „Festgeld" zur Unterscheidung
- `currentBalance` des Sparkonto-Accounts fließt in das Gesamtguthaben ein
- Kein separater API-Aufruf nötig — bestehende `/api/accounts` liefert sie mit

### 8.2 „+ Konto"-Dialog — Erweiterung

Der bestehende Dialog zur Konto-Anlage bekommt die neuen Typen SPARPLAN und
FESTGELD. Beim Wählen eines dieser Typen erscheinen die zusätzlichen
Spar-Felder (Zinssatz, Frequenzen, Startkapital, etc.).

**Gemeinsame Felder (alle Typen):**
- Name (Pflicht), Farbe, IBAN/Kontonummer

**Neue Felder für SPARPLAN/FESTGELD:**
- Startkapital (€)
- Zinssatz p.a. (%)
- Zinsgutschrift-Frequenz: Monatlich / Quartärlich / Jährlich
- Erste Zahlung / Anlage-Datum
- Laufzeit in Monaten (leer = unbegrenzt)
- Notizen

**Nur SPARPLAN:**
- Sparrate (€, Pflicht)
- Einzahlungsfrequenz: Monatlich / Quartärlich / Jährlich
- Verknüpftes Girokonto (optional)
- Buchungskategorie (optional)

### 8.3 Detailseite `/savings/[id]`

```
← Konten    Tagesgeldkonto — Sparplan              [Bearbeiten]
            IBAN: DE12 3456 …  · 3,5 % p.a. · 100 €/Monat

┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Akt. Saldo   │  │ Zinsen ges.  │  │ Nächste Rate │
│ 8.450,00 €   │  │ 450,00 €    │  │ 01.05.2026   │
└──────────────┘  └──────────────┘  └──────────────┘

Zahlungsplan    Zeitraum: [2026–2031 ▼]   Bezahlt bis: [__.__.__]

Datum         Typ           Betrag      Saldo        Status
01.01.2026    Zinsen        + 23,33     8.023,33     ✓ Gebucht
01.01.2026    Sparrate      +100,00     8.123,33     ✓ Gebucht
01.02.2026    Zinsen        + 23,62     8.146,95     ✓ Gebucht
01.02.2026    Sparrate      +100,00     8.246,95     [Als bezahlt markieren]
01.03.2026    Zinsen        + 23,91     8.270,86     —
01.03.2026    Sparrate      +100,00     8.370,86     —
```

- INTEREST-Zeilen: kein Button — werden automatisch mitgebucht
- CONTRIBUTION-Zeilen: Button „Als bezahlt markieren" (bucht gleichzeitig
  alle fälligen INTEREST-Einträge dieses und früherer Perioden)
- „Bezahlt bis"-Datumseingabe: markiert alles bis zum gewählten Datum

---

## 9. Implementierungsreihenfolge

1. **DB-Schema** — AccountType erweitern + SavingsConfig + SavingsEntry + SQL
2. **Schedule-Lib** — `src/lib/savings/schedule.ts`
3. **API-Routen** — `/api/savings` + `/api/savings/[id]` + Pay-Endpoint
4. **Detailseite** — `src/app/(app)/savings/[id]/page.tsx`
5. **Kontenübersicht-Integration** — Typen SPARPLAN/FESTGELD in Kontenliste + „+ Konto"-Dialog

---

## 10. Nicht im Scope (erste Version)

- Zinsen auf das verknüpfte Girokonto überweisen (Zinsen bleiben immer auf dem Sparkonto — keine zusätzliche EXPENSE-Buchung auf dem Girokonto für Zinsen)
- Sonderzahlungen / Extra-Einzahlungen
- Entnahmen aus dem Sparkonto
- Änderung von Sparrate / Startkapital nach Erstellung
- Grafischer Saldoverlauf (Chart)
