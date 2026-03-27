# BudgetApp – Gesamtsystemdokumentation

> Stand: März 2026 | Version: 1.0 (Development)

---

## Inhaltsverzeichnis

1. [Projektübersicht](#1-projektübersicht)
2. [Tech-Stack](#2-tech-stack)
3. [Architektur](#3-architektur)
4. [Datenbankschema](#4-datenbankschema)
5. [API-Referenz](#5-api-referenz)
6. [UI-Seiten & Features](#6-ui-seiten--features)
7. [Komponenten](#7-komponenten)
8. [State-Management](#8-state-management)
9. [Business-Logik](#9-business-logik)
10. [Konfiguration & Einstellungen](#10-konfiguration--einstellungen)
11. [Entwicklungsumgebung](#11-entwicklungsumgebung)
12. [Dateistruktur](#12-dateistruktur)

---

## 1. Projektübersicht

BudgetApp ist eine persönliche Finanzverwaltungs-App nach dem **Envelope-Budgeting-Prinzip** (angelehnt an YNAB – You Need A Budget). Sie läuft lokal im Desktop-Browser und speichert alle Daten in einer lokalen SQLite-Datenbank.

### Kernfunktionen

| Bereich | Beschreibung |
|---|---|
| **Kontoverwaltung** | Physische Bankkonten mit IBAN, Typ, Farbe und Kontoabgleich |
| **Transaktionen** | Manuelle Erfassung, CSV-Import, Volltextsuche |
| **Envelope Budgeting** | Virtuelle Unterkonten pro Kategorie, monatliche Budgets, Rollover |
| **Kreditverwaltung** | Annuitätendarlehen & Ratenkredite mit Tilgungsplan und Sondertilgung |
| **CSV-Import** | 4-Schritt-Wizard mit 10 vordefinierten Bank-Profilen und Duplikaterkennung |
| **Berichte** | Monatsübersicht, Kategorienanalyse, Budget vs. Ist |
| **Kategorisierungsregeln** | Automatische Kategorienzuweisung beim Import via Regex/Text-Matching |

### Zielplattform

- Desktop-Browser, lokal gehostet (kein Cloud-Backend)
- Betriebssystem: macOS (getestet)
- Node.js v25.8.1 (via Homebrew)

---

## 2. Tech-Stack

### Frontend

| Technologie | Version | Verwendung |
|---|---|---|
| **Next.js** | 14 (App Router) | Framework, Routing, SSR/Client |
| **React** | 19.2.3 | UI-Rendering |
| **TypeScript** | 5 | Typsicherheit |
| **Tailwind CSS** | 4 | Styling |
| **shadcn/ui** | – | UI-Komponentenbibliothek |
| **TanStack Query** | 5.90 | Server-State, Caching, Mutations |
| **Zustand** | 5 | Client-State (Settings, UI, Import-Wizard) |
| **React Hook Form** | – | Formular-Verwaltung |
| **Zod** | 4 | Schema-Validierung (Backend & Frontend) |
| **Recharts** | 3.8 | Diagramme (Bar, Line, Pie) |
| **PapaParse** | 5.5.3 | CSV-Parsing |
| **Sonner** | – | Toast-Benachrichtigungen |
| **next-themes** | – | Dark/Light Mode |
| **lucide-react** | – | Icon-Bibliothek |
| **date-fns** | – | Datum-Hilfsfunktionen |

### Backend / Datenbank

| Technologie | Version | Verwendung |
|---|---|---|
| **Next.js API Routes** | 14 | REST-API (TypeScript) |
| **Prisma** | 7 | ORM |
| **PrismaLibSql** | – | Prisma-Adapter für SQLite |
| **SQLite** | – | Lokale Datenbank (`prisma/dev.db`) |

> **Hinweis Prisma v7:** Nutzt `prisma.config.ts` mit `PrismaLibSql`-Adapter statt `url` in `schema.prisma`. Datenbankmigrationen erfolgen über manuelle SQL-Skripte mit `@libsql/client` (kein `prisma migrate dev`).

---

## 3. Architektur

### Übersicht

```
Browser
  └── Next.js 14 (App Router)
        ├── (app)/ – Client-Seiten (React)
        │     ├── TanStack Query → /api/... (fetch)
        │     └── Zustand Stores (localStorage)
        └── api/ – API-Routes (Node.js)
              └── Prisma (PrismaLibSql) → SQLite (dev.db)
```

### Request-Fluss (Beispiel: Transaktion erstellen)

```
1. User füllt TransactionFormDialog
2. useMutation → POST /api/transactions
3. API-Route: Zod-Validierung
4. Prisma.$transaction:
   a. Transaction erstellen
   b. Account-Balance aktualisieren
   c. SubAccountEntry erstellen (falls Kategorie verknüpft)
   d. Paar-Transaktion erstellen (falls TRANSFER-Typ)
5. queryClient.invalidateQueries(['transactions', 'accounts'])
6. Toast "Transaktion erstellt"
```

### Routing-Struktur

```
/                   → Redirect zu /dashboard
/dashboard          → Übersicht (KPIs, Charts)
/accounts           → Kontoliste
/accounts/[id]      → Kontodetails (Transaktionen, Unterkonten, Budget)
/transactions       → Transaktionsliste mit Suche
/loans              → Kreditübersicht
/loans/[id]         → Tilgungsplan
/reports            → Berichte & Charts
/import             → CSV-Import-Wizard
/settings           → Einstellungen (Übersicht)
/settings/general   → Konten, Kategorien, Währung
/settings/loans     → Kreditverwaltung
/settings/rules     → Kategorisierungsregeln
```

### Datenfluss

- **Server-State** (API-Daten): TanStack Query mit automatischer Invalidierung nach Mutationen
- **Client-State** (UI): Zustand Stores (Settings persistent via localStorage, Import- und UI-State in-memory)
- **Datenbankzugriff**: Ausschließlich serverseitig über Prisma in API-Routes

---

## 4. Datenbankschema

### Entity-Relationship-Übersicht

```
Account ──< Transaction >── Category ──< CategoryGroup
   │              │
   │         SubAccountEntry >── SubAccountGroup ──< SubAccount >── Account
   │
   ├──< SubAccount ──< SubAccountGroup ──< Category (via subAccountGroupId)
   ├──< AccountCategoryGroup >── CategoryGroup
   ├──< Loan ──< LoanPayment
   └──< Reconciliation
```

---

### Account (Konto)

Physische Bankkonten des Benutzers.

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | String (CUID) | Primärschlüssel |
| `name` | String | Kontobezeichnung |
| `iban` | String? (unique) | IBAN (optional) |
| `bank` | String? | Bankname |
| `type` | AccountType | CHECKING / SAVINGS / CREDIT_CARD / CASH / INVESTMENT |
| `color` | String | Hex-Farbe für UI (#6366f1) |
| `icon` | String? | Icon-Name (optional) |
| `currentBalance` | Float | Aktueller Kontostand |
| `isActive` | Boolean | Soft-Delete Flag |
| `createdAt` / `updatedAt` | DateTime | Zeitstempel |

---

### Category (Kategorie)

Kategorien für Einnahmen und Ausgaben. Können mit Unterkonten verknüpft sein.

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | String (CUID) | Primärschlüssel |
| `name` | String | Kategoriename |
| `color` | String | Hex-Farbe |
| `type` | CategoryType | INCOME / EXPENSE / TRANSFER |
| `groupId` | String? | FK → CategoryGroup |
| `subAccountGroupId` | String? | FK → SubAccountGroup (Envelope-Verknüpfung) |
| `subAccountLinkType` | String | "BOOKING" oder "TRANSFER" |
| `sortOrder` | Int | Reihenfolge |
| `isActive` | Boolean | Soft-Delete Flag |

**Vordefinierte Seed-Kategorien (18 Stück):**

| Gruppe | Kategorien |
|---|---|
| Einnahmen | Gehalt, Nebeneinkommen, Sonstige Einnahmen |
| Fixkosten | Miete/Hypothek, Strom & Gas, Internet & Telefon, Versicherungen, Abonnements |
| Lebenshaltung | Lebensmittel, Restaurant & Café, Transport, Gesundheit & Apotheke, Kleidung |
| Freizeit | Hobbys, Urlaub & Reisen, Sport & Fitness, Unterhaltung |
| (ohne Gruppe) | Umbuchung (Typ: TRANSFER) |

---

### Transaction (Transaktion)

Alle Geldbewegungen auf Konten.

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | String (CUID) | Primärschlüssel |
| `date` | DateTime | Buchungsdatum |
| `amount` | Float | Betrag (negativ = Ausgabe, positiv = Einnahme) |
| `description` | String | Beschreibungstext |
| `payee` | String? | Auftraggeber / Empfänger |
| `notes` | String? | Notizen |
| `accountId` | String | FK → Account |
| `categoryId` | String? | FK → Category |
| `type` | TransactionType | INCOME / EXPENSE / TRANSFER |
| `status` | TransactionStatus | PENDING / CLEARED / RECONCILED |
| `importHash` | String? (unique) | SHA256-Hash zur Duplikaterkennung |
| `subAccountEntryId` | String? (unique) | FK → SubAccountEntry |
| `transferToId` | String? (unique) | FK → Transaction (Paar-Transaktion bei Transfer) |

**Indizes:** `accountId`, `categoryId`, `date`

---

### BudgetEntry (Budgeteintrag)

Monatliche Budgetplanung pro Kategorie.

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | String (CUID) | Primärschlüssel |
| `categoryId` | String | FK → Category |
| `month` | Int | Monat (1–12) |
| `year` | Int | Jahr |
| `budgeted` | Float | Geplanter Betrag (negativ, z. B. -600) |
| `rolledOver` | Float | Übertrag aus Vormonat |

**Unique-Constraint:** `(categoryId, month, year)` – Ein Eintrag pro Kategorie pro Monat

---

### SubAccount / SubAccountGroup / SubAccountEntry (Unterkonten)

Virtuelles Envelope-System für YNAB-artiges Budgeting.

```
Account
  └── SubAccount (Unterkonto, z. B. "Sparziel Urlaub")
        └── SubAccountGroup (Gruppe, z. B. "2026 Mallorca")
              └── SubAccountEntry (Einzel-Buchungen im Unterkonto)
                    └── Transaction (verknüpfte Haupttransaktion)
```

Eine Kategorie kann mit einer `SubAccountGroup` verknüpft werden. Jede Transaktion auf diese Kategorie erzeugt automatisch einen `SubAccountEntry`.

---

### Loan (Kredit/Darlehen)

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | String (CUID) | Primärschlüssel |
| `name` | String | Kreditbezeichnung |
| `loanType` | String | "ANNUITAETENDARLEHEN" oder "RATENKREDIT" |
| `principal` | Float | Darlehensbetrag |
| `interestRate` | Float | Zinssatz p.a. (Dezimal, z. B. 0.035 = 3,5 %) |
| `initialRepaymentRate` | Float | Anfangstilgungssatz p.a. (nur Annuität) |
| `termMonths` | Int | Laufzeit in Monaten |
| `startDate` | DateTime | Datum der ersten Rate |
| `monthlyPayment` | Float | Berechnete Monatsrate |
| `accountId` | String? | Verknüpftes Konto für Ratenbuchungen |
| `categoryId` | String? | Buchungskategorie für Kreditraten |
| `isActive` | Boolean | Soft-Delete Flag |

---

### LoanPayment (Tilgungsplanzeile)

| Feld | Typ | Beschreibung |
|---|---|---|
| `loanId` | String | FK → Loan |
| `periodNumber` | Int | Ratennummer (1, 2, 3, …) |
| `dueDate` | DateTime | Fälligkeitsdatum |
| `scheduledPrincipal` | Float | Planmäßige Tilgung |
| `scheduledInterest` | Float | Planmäßige Zinsen |
| `scheduledBalance` | Float | Restschuld nach dieser Rate |
| `extraPayment` | Float | Sondertilgungsbetrag |
| `paidAt` | DateTime? | Bezahlt am (null = offen) |
| `transactionId` | String? (unique) | Gebuchte Transaktion auf Konto |

---

### CategoryRule (Kategorisierungsregel)

Regeln zur automatischen Kategorienzuweisung beim CSV-Import.

| Feld | Typ | Beschreibung |
|---|---|---|
| `field` | RuleField | DESCRIPTION / PAYEE / AMOUNT |
| `operator` | RuleOperator | CONTAINS / STARTS_WITH / ENDS_WITH / EQUALS / GREATER_THAN / LESS_THAN / REGEX |
| `value` | String | Vergleichswert |
| `categoryId` | String | Zuzuweisende Kategorie |
| `priority` | Int | Priorität (höher = früher angewendet) |

---

### Weitere Modelle

| Modell | Beschreibung |
|---|---|
| `CategoryGroup` | Gruppe für Kategorien (Einnahmen, Fixkosten, etc.) |
| `Reconciliation` | Protokoll der Kontoabgleiche |
| `AccountCategoryGroup` | Steuert, welche Kategoriegruppen im Konto-Budget-Tab sichtbar sind |
| `CsvProfile` | Gespeicherte CSV-Import-Profile (Delimiter, Spalten-Mapping, etc.) |

---

## 5. API-Referenz

Alle Endpunkte sind Next.js API Routes unter `/api/`. Anfragen und Antworten sind JSON. Validierung erfolgt mit **Zod v4**.

### Konten

| Methode | Endpunkt | Beschreibung |
|---|---|---|
| GET | `/api/accounts` | Alle aktiven Konten mit korrigiertem Saldo und Transaktionszähler |
| POST | `/api/accounts` | Konto erstellen |
| GET | `/api/accounts/[id]` | Kontodetails + letzte 50 Transaktionen |
| PUT | `/api/accounts/[id]` | Konto bearbeiten |
| DELETE | `/api/accounts/[id]` | Konto deaktivieren (Soft-Delete) |
| POST | `/api/accounts/[id]/reconcile` | Kontoabgleich durchführen |
| GET | `/api/accounts/[id]/category-groups` | Kategoriegruppen-Konfiguration für Budget-Tab |
| PUT | `/api/accounts/[id]/category-groups` | Kategoriegruppen für Budget-Tab setzen |

**GET /api/accounts – Saldokorrektur:**
Interne Transaktionen (TRANSFER-Typ oder EXPENSE mit SubAccountEntry) werden vom gespeicherten Saldo abgezogen, um den tatsächlich verfügbaren Betrag anzuzeigen.

---

### Transaktionen

| Methode | Endpunkt | Beschreibung |
|---|---|---|
| GET | `/api/transactions` | Transaktionsliste (paginiert) |
| POST | `/api/transactions` | Transaktion erstellen |
| PUT | `/api/transactions/[id]` | Transaktion bearbeiten |
| DELETE | `/api/transactions/[id]` | Transaktion löschen + Saldo korrigieren |

**GET /api/transactions – Filterparameter:**

| Parameter | Typ | Beschreibung |
|---|---|---|
| `accountId` | String | Filter nach Konto |
| `categoryId` | String | Filter nach Kategorie |
| `from` | ISO-Datum | Von-Datum |
| `to` | ISO-Datum | Bis-Datum |
| `search` | String | Volltextsuche in description + payee |
| `limit` | Int | Max. Anzahl (Standard: 100) |

**POST /api/transactions – Sonderfall SubAccount:**
Falls die übergebene `categoryId` mit einer `SubAccountGroup` verknüpft ist:
- **BOOKING-Typ:** Erstellt einen `SubAccountEntry` (intern, kein Saldo-Transfer)
- **TRANSFER-Typ:** Erstellt zusätzlich eine Paar-Transaktion auf dem Zielkonto

---

### Kategorien

| Methode | Endpunkt | Beschreibung |
|---|---|---|
| GET | `/api/categories` | Alle Kategoriegruppen mit zugehörigen Kategorien |
| POST | `/api/categories` | Kategorie erstellen |
| PUT | `/api/categories/[id]` | Kategorie bearbeiten |
| DELETE | `/api/categories/[id]` | Kategorie deaktivieren |
| POST | `/api/categories/reorder` | Reihenfolge innerhalb einer Gruppe ändern |
| GET | `/api/category-groups` | Alle Kategoriegruppen |
| POST | `/api/category-groups` | Kategoriegruppe erstellen |
| PUT | `/api/category-groups/[id]` | Kategoriegruppe bearbeiten |
| POST | `/api/category-groups/reorder` | Reihenfolge der Gruppen ändern |

---

### Budget

| Methode | Endpunkt | Beschreibung |
|---|---|---|
| GET | `/api/budget/[year]/[month]` | Budgetdaten für einen Monat (Kategoriegruppen, Aktivitäten, Verfügbarkeit) |
| PUT | `/api/budget/[year]/[month]` | Budgetbeträge speichern |
| POST | `/api/budget/[year]/[month]/rollover` | Überschüsse in den nächsten Monat übertragen |

**GET /api/budget – Rückgabe pro Kategorie:**
```json
{
  "categoryId": "...",
  "budgeted": -600,
  "activity": -400,
  "rolledOver": 50,
  "available": 250
}
```

**Formel:** `available = rolledOver + activity - budgeted`
*(Beispiel: 50 + (-400) - (-600) = 250)*

---

### Unterkonten (Envelopes)

| Methode | Endpunkt | Beschreibung |
|---|---|---|
| GET | `/api/sub-accounts` | Alle Unterkonten |
| POST | `/api/sub-accounts` | Unterkonto erstellen |
| PUT | `/api/sub-accounts/[id]` | Unterkonto bearbeiten |
| DELETE | `/api/sub-accounts/[id]` | Unterkonto löschen |
| GET | `/api/sub-accounts/[id]/groups` | Gruppen eines Unterkontos |
| POST | `/api/sub-accounts/[id]/groups` | Gruppe erstellen |
| POST | `/api/sub-account-groups` | Sub-Account-Gruppe erstellen |
| PUT | `/api/sub-account-groups/[id]` | Gruppe bearbeiten |
| DELETE | `/api/sub-account-groups/[id]` | Gruppe löschen |
| GET | `/api/sub-account-groups/[id]/entries` | Einträge einer Gruppe |
| POST | `/api/sub-account-groups/[id]/entries` | Eintrag erstellen |
| PUT | `/api/sub-account-entries/[id]` | Eintrag bearbeiten |
| GET | `/api/sub-account-groups` | Alle Sub-Account-Gruppen |

---

### Kredite

| Methode | Endpunkt | Beschreibung |
|---|---|---|
| GET | `/api/loans` | Alle Kredite mit berechneten Stats (Restschuld, Zinsen, nächste Rate) |
| POST | `/api/loans` | Kredit erstellen + Tilgungsplan berechnen |
| GET | `/api/loans/[id]` | Kreditdetails + vollständiger Tilgungsplan |
| PUT | `/api/loans/[id]` | Kreditparameter bearbeiten (bei Finanzparameter-Änderung: Neuberechnung) |
| DELETE | `/api/loans/[id]` | Kredit deaktivieren |
| PUT | `/api/loans/[id]/payments/[period]` | Rate aktualisieren (Status, Sondertilgung, Kategorie) |

---

### CSV-Import

| Methode | Endpunkt | Beschreibung |
|---|---|---|
| POST | `/api/import` | Transaktionen massenimportieren (mit Duplikaterkennung) |

**Duplikaterkennung:** SHA256-Hash über `date + amount + description` wird in `importHash` gespeichert. Beim zweiten Import wird der Hash verglichen und Duplikate übersprungen.

---

### Berichte

| Methode | Endpunkt | Beschreibung |
|---|---|---|
| GET | `/api/reports/monthly-summary` | Einnahmen/Ausgaben der letzten N Monate |
| GET | `/api/reports/category-spending` | Ausgaben nach Kategorie für einen Monat |

---

### Kategorisierungsregeln

| Methode | Endpunkt | Beschreibung |
|---|---|---|
| GET | `/api/rules` | Alle aktiven Regeln (nach Priorität sortiert) |
| POST | `/api/rules` | Regel erstellen |
| PUT | `/api/rules/[id]` | Regel bearbeiten |
| DELETE | `/api/rules/[id]` | Regel löschen |

---

## 6. UI-Seiten & Features

### Dashboard (`/dashboard`)

Die Übersichtsseite zeigt den aktuellen Finanzstatus für den ausgewählten Monat.

**Bestandteile:**
- **KPI-Karten:** Gesamtvermögen (alle Konten), Einnahmen (Monat), Ausgaben (Monat), Noch zuzuteilen
- **Monat-Navigation:** Vor/Zurück-Pfeile, gesteuert über `useUIStore`
- **Balkendiagramm:** Einnahmen vs. Ausgaben der letzten 6 Monate (Recharts BarChart)
- **Kreisdiagramm:** Ausgabenverteilung nach Kategorie (Top 6, Recharts PieChart)
- **Konten-Widget:** Saldo aller Konten mit Farbbalken
- **Letzte Transaktionen:** 5 neueste Transaktionen mit Betrag und Kategorie

---

### Konten (`/accounts`)

Liste aller aktiven physischen Konten.

**AccountCard pro Konto:**
- Farbiger Balken (Kontofarbe)
- Name, Bank, Typ-Badge (Girokonto / Sparkonto / etc.)
- Kontostand (korrekte interne Saldokorrektur)
- Transaktionsanzahl
- Klickbar → `/accounts/[id]`

---

### Kontodetails (`/accounts/[id]`)

Detailansicht eines Kontos mit drei Tabs.

**Tab 1 – Transaktionen:**
- Tabelle: Datum, Beschreibung, Kategorie-Badge, Betrag (farbig: rot/grün)
- Letzte 50 Transaktionen
- Button: "Kontoabgleich" → öffnet `ReconcileDialog`

**Tab 2 – Unterkonten:**
- Verwaltung von Unterkonten (Envelopes)
- SubAccount erstellen/bearbeiten/löschen
- Sub-Gruppen und Einträge verwalten
- Kategorie-Verknüpfung konfigurieren (BOOKING vs. TRANSFER)

**Tab 3 – Budget:**
- Budgetplanung für dieses Konto
- Kategoriegruppen-Filter konfigurierbar
- Budgetbeträge pro Kategorie eingeben
- Verfügbarkeitsanzeige (budgetiert / Aktivität / verfügbar)

---

### Transaktionen (`/transactions`)

Vollständige Transaktionsliste über alle Konten.

- **Suche** (300ms debounced): Volltextsuche in Beschreibung und Empfänger
- **Tabelle:** Datum, Beschreibung + Empfänger, Konto (farbiger Punkt), Kategorie-Badge, Betrag
- **Löschen:** Bestätigungsdialog → DELETE + Saldo-Korrektur
- **Neue Transaktion:** Button → `TransactionFormDialog`
- **Limit:** 200 Transaktionen pro Anfrage

---

### Kredite (`/loans`)

Übersicht aller aktiven Kredite.

**Kreditkarte pro Darlehen:**
- Kreditname und Typ (Annuitätendarlehen / Ratenkredit)
- **Restschuld** (hervorgehoben in Rot)
- **Fortschrittsbalken:** Bezahlte / Gesamtrate in Prozent
- **Kennzahlen:** Gezahlte Zinsen, Zinssatz (3 Dezimalstellen), Nächste Rate
- Klickbar → `/loans/[id]`

---

### Kreditdetails (`/loans/[id]`)

Vollständiger Tilgungsplan mit interaktiver Ratenverwaltung.

**Header:**
- Kreditname, Typ-Badge
- Verknüpftes Konto (farbiges Badge)

**Kennzahlen-Karten:**
- Darlehensbetrag, Restschuld nach Laufzeit, Zinsen bezahlt, Geplante Gesamtzinsen

**Fortschrittsbalken:**
- Raten bezahlt / Gesamt + Zinssatz / Tilgungssatz

**Tilgungsplan-Tabelle** (sticky Header, scrollbar):

| Spalte | Beschreibung |
|---|---|
| # | Ratennummer (durchgestrichen wenn bezahlt) |
| Datum | Fälligkeitsdatum (locale-formatiert) |
| Rate | Zins + Tilgung |
| Zinsen | Zinsanteil (amber) |
| Tilgung | Tilgungsanteil (grün) |
| Sondertilgung | **Inline editierbar** (Klick → Eingabefeld → Bestätigen/Abbrechen) |
| Restschuld | Saldo nach Rate |
| Status | **Klickbarer Button** (Offen ↔ Bezahlt) |

**Kategorie-Dialog** (erscheint beim ersten Bezahlen ohne voreingestellte Kategorie):
- Fragt einmalig nach der Buchungskategorie
- Speichert Auswahl dauerhaft am Kredit

---

### CSV-Import (`/import`)

4-Schritt-Wizard zur Massenerfassung von Transaktionen aus Bankauszügen.

**Schritt 1 – Upload:**
- Datei-Upload (CSV)
- Bank-Profil wählen (10 vordefinierte + 2 generische Profile)
- Zielkonto auswählen

**Schritt 2 – Vorschau:**
- Tabelle mit geparsten Zeilen (Datum, Beschreibung, Empfänger, Betrag)
- Erkannte Spalten anzeigen

**Schritt 3 – Kategorisierung:**
- Automatische Kategorienzuweisung via Regeln (`src/lib/rules/matcher.ts`)
- Manuelle Anpassung pro Zeile möglich
- Duplikate markiert (grau)

**Schritt 4 – Zusammenfassung:**
- Anzahl importiert / übersprungen (Duplikate)
- Bestätigung und Reset

---

### Berichte (`/reports`)

Drei Analyse-Tabs für die Finanzauswertung.

**Tab 1 – Monatsübersicht:**
- Statistik-Karten: Ø Einnahmen, Ø Ausgaben, Ø Ersparnis (letzte 12 Monate)
- BarChart: Monatliche Einnahmen vs. Ausgaben
- LineChart: Monatliche Ersparnisse

**Tab 2 – Kategorienanalyse:**
- Monat wählbar
- PieChart: Ausgabenverteilung nach Kategorie
- Tabelle: Kategorie, Betrag, Anteil in %

**Tab 3 – Budget vs. Ist:**
- Monat wählbar
- Horizontal BarChart: Geplant vs. Tatsächlich
- Tabelle mit Differenzen (positiv = Ersparnis, negativ = Überschreitung)

---

### Einstellungen (`/settings`)

**Allgemein (`/settings/general`):**
- Kontoverwaltung (CRUD, Farbe, Typ, IBAN)
- Kategoriegruppen-Verwaltung
- Kategorien-Verwaltung (Reihenfolge per Drag & Drop)
- Währungsauswahl (CHF, EUR, USD, GBP, JPY mit zugehörigem Locale)

**Bankkredite (`/settings/loans`):**
- Kreditformular mit Live-Ratenberechnung
- Übersichtstabelle aller Kredite
- Bearbeiten (Bleistift-Icon) und Löschen
- Warnung bei Änderung von Finanzparametern (Tilgungsplan wird neu berechnet)

**Kategorisierungsregeln (`/settings/rules`):**
- Regelformular: Feld, Operator, Wert, Kategorie, Priorität
- Regeltabelle mit Bearbeiten / Löschen
- Regeln sortiert nach Priorität

---

## 7. Komponenten

### Layout-Komponenten

#### `Sidebar`
Linke Navigationsleiste mit Links zu allen Hauptseiten. Icons via lucide-react.

#### `providers.tsx`
Root-Provider-Wrapper:
- `QueryClientProvider` (TanStack Query, staleTime: 60s)
- `ThemeProvider` (next-themes, dark/light/system)
- `Toaster` (Sonner)

---

### Account-Komponenten

#### `AccountCard`
Konto-Karte für die Übersichtsseite.
```typescript
Props: { account: { id, name, bank, type, color, currentBalance, _count } }
```

#### `ReconcileDialog`
Dialog für den Kontoabgleich.
```typescript
Props: { accountId, accountName, open, onOpenChange }
```
- Lädt alle nicht-abgeglichenen Transaktionen (limit=500)
- Checkboxen zur Auswahl der geklärten Transaktionen
- Live-Berechnung: Ausgewählt vs. Auszugssaldo = Differenz
- Grüne Bestätigungsanzeige bei Differenz < 0,01

#### `AccountBudgetTab`
Budget-Tab in der Kontodetailseite.

#### `SubAccountsSection`
Verwaltung von Unterkonten und Gruppen.

---

### Transaktions-Komponenten

#### `TransactionFormDialog`
Dialog zum Erstellen neuer Transaktionen.
```typescript
Props: { open, onOpenChange }
```
- Felder: Typ (Einnahme/Ausgabe/Umbuchung), Datum, Beschreibung, Empfänger, Betrag, Konto, Kategorie
- Bei Umbuchung: Quell- und Zielkonto, optionale Gruppe und Kategorie
- Formularvalidierung via Zod + React Hook Form

---

### Import-Komponenten

| Komponente | Schritt | Funktion |
|---|---|---|
| `ImportStep1Upload` | 1 | Datei-Upload, Profil- und Kontoauswahl |
| `ImportStep2Preview` | 2 | Vorschau der geparsten Zeilen |
| `ImportStep3Categorize` | 3 | Kategoriezuweisung (auto + manuell) |
| `ImportStep4Summary` | 4 | Import-Ergebnis |

---

### Settings-Komponenten

#### `RuleFormDialog`
Dialog zum Erstellen und Bearbeiten von Kategorisierungsregeln.
```typescript
Props: { open, onOpenChange, rule? }
```

---

### UI-Bibliothek (shadcn/ui)

Alle UI-Basiskomponenten unter `src/components/ui/`:
`Badge`, `Button`, `Card`, `Dialog`, `DropdownMenu`, `Form`, `Input`, `Label`, `Progress`, `Select`, `Separator`, `Sheet`, `Skeleton`, `Sonner`, `Table`, `Tabs`

---

## 8. State-Management

### useSettingsStore (Zustand, persistent)

Gespeichert in localStorage (`budget-app-settings`).

```typescript
State: {
  currency: string  // z. B. "CHF"
  locale: string    // z. B. "de-CH"
}

Actions: {
  setCurrencyPreset(currency: string, locale: string): void
}
```

**Verfügbare Presets:**

| Preset | currency | locale |
|---|---|---|
| Schweizer Franken | CHF | de-CH |
| Euro (Deutschland) | EUR | de-DE |
| Euro (Österreich) | EUR | de-AT |
| Euro (Frankreich) | EUR | fr-FR |
| US-Dollar | USD | en-US |
| Britisches Pfund | GBP | en-GB |
| Japanischer Yen | JPY | ja-JP |

> Der Store ist auch **außerhalb von React** über `useSettingsStore.getState()` abrufbar. Dadurch können Utility-Funktionen (`formatCurrency`, `formatDate`) locale-bewusst arbeiten, ohne React-Hook-Kontext zu benötigen.

---

### useUIStore (Zustand, in-memory)

Steuert den aktuell angezeigten Budget-Monat.

```typescript
State: {
  budgetYear: number
  budgetMonth: number  // 1–12
}

Actions: {
  setBudgetMonth(year, month): void
  goToPrevMonth(): void
  goToNextMonth(): void
}
```

---

### useImportStore (Zustand, in-memory)

Wizard-State für den CSV-Import.

```typescript
State: {
  step: 1 | 2 | 3 | 4
  accountId: string
  profile: CsvProfile | null
  rawContent: string
  transactions: ImportTransaction[]
}

Actions: {
  setStep, setAccountId, setProfile, setTransactions,
  updateTransaction(index, patch), reset()
}
```

---

### TanStack Query

Alle API-Daten werden über TanStack Query gecacht und verwaltet.

**Wichtige Query-Keys:**

| Key | Daten |
|---|---|
| `['accounts']` | Alle Konten |
| `['account', id]` | Kontodetails |
| `['transactions', search]` | Transaktionsliste |
| `['transactions-reconcile', accountId]` | Transaktionen für Kontoabgleich |
| `['categories']` | Kategorien + Gruppen |
| `['budget', year, month]` | Budgetdaten |
| `['loans']` | Alle Kredite |
| `['loan', id]` | Kreditdetails |
| `['reports-monthly']` | Monatsbericht |

---

## 9. Business-Logik

### Kreditberechnung (`src/lib/loans/amortization.ts`)

#### Annuitätendarlehen (ANNUITAETENDARLEHEN)

```
Monatliche Rate = Darlehensbetrag × (Zinssatz + Tilgungssatz) / 12
```

- Feste Rate über die gesamte Laufzeit
- Der Zinsanteil sinkt monatlich (da Restschuld abnimmt)
- Der Tilgungsanteil steigt entsprechend
- Nach Ablauf von `termMonths` bleibt eine **Restschuld** (Anschlussfinanzierung notwendig)
- Zinssatz und Tilgungssatz werden mit 3 Dezimalstellen eingegeben (z. B. 3.500 %)

**Tilgungsplan-Berechnung (Schleife):**
1. Monatszinsen = Restschuld × Jahreszinssatz / 12
2. Tilgung = Rate − Zinsen
3. Neue Restschuld = Alte Restschuld − Tilgung − Sondertilgung
4. Schleife endet nach `termMonths` Perioden oder bei Restschuld ≤ 0,005

#### Ratenkredit (RATENKREDIT)

```
Monatliche Tilgung = Darlehensbetrag / Laufzeit in Monaten (konstant)
Monatliche Zinsen  = Restschuld × Jahreszinssatz / 12 (sinkend)
Gesamtrate         = Tilgung + Zinsen (daher monatlich sinkend)
```

- Vollständige Tilgung innerhalb der Laufzeit (keine Restschuld)
- Schleife endet bei Restschuld ≤ 0,005

#### Sondertilgung

Bei Änderung der Sondertilgung einer Rate:
1. Neue Restschuld = Alte Restschuld − Zusatzbetrag
2. Alle Folgezeilen werden mit `generateSchedule()` neu berechnet
3. Wenn Restschuld auf 0 fällt: Überschüssige Folgezeilen werden gelöscht

#### Ratenzahlung buchen

```
Bezahlt markieren (mit verknüpftem Konto):
  → Transaktion auf Konto erstellen (negativer Betrag)
  → Kontostand aktualisieren
  → transactionId auf LoanPayment speichern

Bezahlt → Offen:
  → Transaktion löschen
  → Kontostand zurückkorrigieren
  → transactionId auf null setzen

Sondertilgung ändern (bereits bezahlte Rate):
  → Transaktionsbetrag korrigieren
  → Kontostand-Differenz ausgleichen
```

---

### Envelope-Budgeting (`src/app/api/budget/`)

#### Berechnung pro Kategorie

```
available = rolledOver + activity - budgeted

Beispiel:
  budgeted   = -600  (600 budgetiert)
  activity   = -400  (400 ausgegeben)
  rolledOver = +50   (50 Übertrag)
  available  = 50 + (-400) - (-600) = +250
```

#### Rollover

```
Noch zuzuteilen = Summe Einnahmen + Summe budgetierter Beträge
```

Bei Rollover werden positive `available`-Werte in den `rolledOver` des Folgemonats übertragen.

---

### Saldo-Korrektur für interne Transaktionen

Das physische Konto kennt keine virtuellen Unterkonten. Um zu vermeiden, dass interne Umbuchungen doppelt im Saldo erscheinen, korrigiert `GET /api/accounts` den gespeicherten Saldo:

```
korrigierter Saldo = gespeicherter Saldo
  - Summe aller TRANSFER-Transaktionen
  - Summe aller EXPENSE-Transaktionen mit subAccountEntryId
```

---

### CSV-Import (`src/lib/csv/`)

#### Parser (`parser.ts`)

1. PapaParse liest CSV mit konfiguriertem Delimiter und Encoding
2. `skipRows` erste Zeilen werden übersprungen
3. Spalten-Mapping (aus `CsvProfile.columnMapping`) ordnet CSV-Spalten zu: `date`, `description`, `amount`, `payee`
4. Datum-Parsing: unterstützt `DD.MM.YYYY`, `YYYY-MM-DD`, `MM/DD/YYYY` u. a.
5. Betrag-Parsing: DE-Format (1.234,56) und EN-Format (1,234.56)
6. SHA256-Hash = `date|amount|description` → gespeichert als `importHash`

#### Bank-Profile (`profiles.ts`)

10 vordefinierte Profile für Schweizer und Deutsche Banken:

| Profil | Bank | Besonderheiten |
|---|---|---|
| ZKB | Zürcher Kantonalbank | Semikolon-Delimiter, DD.MM.YYYY |
| UBS | UBS Switzerland | Semikolon, DD.MM.YYYY |
| PostFinance | PostFinance CH | Semikolon, YYYY-MM-DD |
| Raiffeisen CH | Raiffeisen Schweiz | Semikolon, DD.MM.YYYY |
| DKB | Deutsche Kreditbank | Semikolon, DD.MM.YYYY |
| ING DE | ING-DiBa | Semikolon, DD.MM.YYYY |
| Sparkasse | Sparkasse | Semikolon, DD.MM.YYYY |
| Comdirect | Comdirect | Semikolon, DD.MM.YYYY |
| Generisch DE | – | Komma-Delimiter, DD.MM.YYYY |
| Generisch EN | – | Komma-Delimiter, YYYY-MM-DD |

#### Kategorisierungsregeln (`src/lib/rules/matcher.ts`)

```
Eingabe: Transaktion (description, payee, amount) + sortierte Regeln

Für jede Regel (nach Priorität absteigend):
  1. Feld bestimmen (description / payee / amount)
  2. Operator anwenden:
     - CONTAINS      → includes()
     - STARTS_WITH   → startsWith()
     - ENDS_WITH     → endsWith()
     - EQUALS        → ===
     - GREATER_THAN  → > (numerisch)
     - LESS_THAN     → < (numerisch)
     - REGEX         → RegExp.test()
  3. Match gefunden → categoryId zuweisen + break

Ausgabe: categoryId oder null
```

---

### Währungs- und Datumsformatierung (`src/lib/utils.ts`)

Alle Formatierungsfunktionen nutzen `useSettingsStore.getState()` und sind damit locale-aware, auch außerhalb von React-Komponenten.

```typescript
formatCurrency(amount: number, currency?: string): string
// → Intl.NumberFormat mit style: 'currency'

formatDate(date: Date | string): string
// → Intl.DateTimeFormat, Format: 02.01.2024

getMonthName(month: number): string
// → Intl.DateTimeFormat, Format: "Januar"
```

---

## 10. Konfiguration & Einstellungen

### Prisma-Konfiguration (`prisma.config.ts`)

```typescript
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'

const client = createClient({ url: process.env.DATABASE_URL ?? 'file:./prisma/dev.db' })
export default { adapter: new PrismaLibSql(client) }
```

### TypeScript (`tsconfig.json`)

- Pfad-Alias: `@/*` → `./src/*`
- Target: ES2017
- Strict Mode aktiviert

### Tailwind (`tailwind.config.ts`)

- Tailwind CSS v4
- shadcn/ui Design-System mit CSS-Variablen
- Dark Mode: `class`-basiert (next-themes)

### Next.js (`next.config.ts`)

Standard-Konfiguration, keine besonderen Anpassungen.

---

## 11. Entwicklungsumgebung

### App starten

```bash
cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp"
npm run dev
# → http://localhost:3000
```

### Datenbank

```bash
# Prisma Client regenerieren (nach Schema-Änderungen)
npx prisma generate
# Anschließend: Dev-Server neu starten!

# Seed ausführen (Kategorien anlegen)
npx tsx prisma/seed.ts

# Datenbankdatei
prisma/dev.db
```

### Manuelle Migration

Da `prisma migrate dev` mit dem LibSQL-Adapter nicht funktioniert, werden Schemaänderungen über Node.js-Skripte mit `@libsql/client` durchgeführt:

```javascript
import { createClient } from '@libsql/client'
const db = createClient({ url: 'file:./prisma/dev.db' })
await db.execute('ALTER TABLE "Loan" ADD COLUMN ...')
```

### Load-Test-Skript

```bash
# 10.000 Test-Transaktionen einfügen + API-Benchmark
node scripts/loadtest-seed.mjs
```

---

## 12. Dateistruktur

```
2026_BudgetApp/
├── prisma/
│   ├── schema.prisma         # Datenbankschema
│   ├── seed.ts               # Seed: 18 Kategorien + 4 Gruppen
│   └── dev.db                # SQLite-Datenbankdatei
├── scripts/
│   └── loadtest-seed.mjs     # Load-Test + API-Benchmark
├── src/
│   ├── app/
│   │   ├── (app)/            # Alle Client-Seiten
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── accounts/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── transactions/page.tsx
│   │   │   ├── loans/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── reports/page.tsx
│   │   │   ├── import/page.tsx
│   │   │   └── settings/
│   │   │       ├── page.tsx
│   │   │       ├── general/page.tsx
│   │   │       ├── loans/page.tsx
│   │   │       └── rules/page.tsx
│   │   ├── api/
│   │   │   ├── accounts/
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts
│   │   │   │       ├── reconcile/route.ts
│   │   │   │       ├── budget/[year]/[month]/route.ts
│   │   │   │       ├── category-groups/route.ts
│   │   │   │       └── sub-accounts/route.ts
│   │   │   ├── transactions/
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/route.ts
│   │   │   ├── categories/
│   │   │   │   ├── route.ts
│   │   │   │   ├── [id]/route.ts
│   │   │   │   └── reorder/route.ts
│   │   │   ├── category-groups/
│   │   │   │   ├── route.ts
│   │   │   │   ├── [id]/route.ts
│   │   │   │   └── reorder/route.ts
│   │   │   ├── budget/[year]/[month]/
│   │   │   │   ├── route.ts
│   │   │   │   └── rollover/route.ts
│   │   │   ├── loans/
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts
│   │   │   │       └── payments/[period]/route.ts
│   │   │   ├── sub-accounts/
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts
│   │   │   │       └── groups/route.ts
│   │   │   ├── sub-account-groups/
│   │   │   │   ├── route.ts
│   │   │   │   ├── [id]/route.ts
│   │   │   │   └── [id]/entries/route.ts
│   │   │   ├── sub-account-entries/[id]/route.ts
│   │   │   ├── import/route.ts
│   │   │   ├── rules/
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/route.ts
│   │   │   └── reports/
│   │   │       ├── monthly-summary/route.ts
│   │   │       └── category-spending/route.ts
│   │   ├── layout.tsx        # Root-Layout mit Providers + Sidebar
│   │   └── page.tsx          # Redirect → /dashboard
│   ├── components/
│   │   ├── providers.tsx     # QueryClient + ThemeProvider + Toaster
│   │   ├── accounts/
│   │   │   ├── AccountCard.tsx
│   │   │   ├── AccountBudgetTab.tsx
│   │   │   ├── AccountBudgetConfig.tsx
│   │   │   ├── SubAccountsSection.tsx
│   │   │   └── ReconcileDialog.tsx
│   │   ├── transactions/
│   │   │   └── TransactionFormDialog.tsx
│   │   ├── import/
│   │   │   ├── ImportStep1Upload.tsx
│   │   │   ├── ImportStep2Preview.tsx
│   │   │   ├── ImportStep3Categorize.tsx
│   │   │   └── ImportStep4Summary.tsx
│   │   ├── settings/
│   │   │   └── RuleFormDialog.tsx
│   │   ├── layout/
│   │   │   └── Sidebar.tsx
│   │   └── ui/               # shadcn/ui Basiskomponenten
│   ├── hooks/
│   │   └── useFormatCurrency.ts
│   ├── store/
│   │   ├── useSettingsStore.ts  # Währung, Locale (persistent)
│   │   ├── useUIStore.ts        # Budget-Monat (in-memory)
│   │   └── useImportStore.ts    # CSV-Import-Wizard (in-memory)
│   └── lib/
│       ├── prisma.ts            # Prisma-Client Singleton
│       ├── utils.ts             # formatCurrency, formatDate, getMonthName
│       ├── budget/
│       │   └── calculations.ts  # Budget-Hilfsfunktionen
│       ├── loans/
│       │   └── amortization.ts  # Tilgungsplan-Berechnung
│       ├── csv/
│       │   ├── parser.ts        # CSV-Parser
│       │   └── profiles.ts      # Bank-Profile
│       └── rules/
│           └── matcher.ts       # Kategorisierungsregel-Matcher
├── prisma.config.ts             # Prisma LibSQL-Adapter-Konfiguration
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── DOKUMENTATION.md             # Diese Datei
```

---

## Anhang: Bekannte Eigenheiten

| Thema | Beschreibung |
|---|---|
| **Prisma v7 + LibSQL** | Nach jedem `npx prisma generate` muss der Dev-Server neu gestartet werden (Singleton-Cache) |
| **Migrationen** | Kein `prisma migrate dev` — manuelle SQL-Skripte über `@libsql/client` |
| **Zod v4** | Nutzt `.issues` statt `.errors`; kein `.default()` in Formular-Schemas |
| **SelectValue** | shadcn/ui `SelectValue` unterstützt keine Render-Funktionen als Children — nur `<SelectValue />` oder `<SelectValue placeholder="..." />` |
| **SQLite UNIQUE auf nullable Spalte** | Erfordert partiellen Index: `CREATE UNIQUE INDEX ... WHERE column IS NOT NULL` |
| **Saldo-Korrektur** | Interne Transaktionen (TRANSFER, BOOKING-Expenses) erscheinen nicht im angezeigten Kontostand |
