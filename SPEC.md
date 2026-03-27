# BudgetApp — Spezifikation

> **Arbeitsweise:** Spec Driven Development.
> Vor jeder Änderung an der Anwendung wird zuerst dieses Dokument aktualisiert und vom Auftraggeber freigegeben. Erst nach Freigabe wird implementiert.

---

## 1. Projektüberblick

**Typ:** Persönliche Budget-Web-App, läuft lokal im Desktop-Browser
**Ziel:** Vollständige Kontrolle über persönliche Finanzen — Konten, Budgets, Kredite, Berichte
**Stack:** Next.js 14 (App Router) · TypeScript · Tailwind CSS · shadcn/base-ui · Prisma v7 + SQLite · TanStack Query · Zustand · Recharts · Papa Parse

---

## 2. Kernkonzepte

### Physische Konten
Abbild echter Bankkonten mit IBAN, Bank, Typ (Girokonto, Sparkonto, Kreditkarte, Bargeld, Depot), Farbe und aktuellem Saldo. Transaktionen werden einem Konto zugeordnet.

### Kategorien & Gruppen (pro Konto)
Kategorien sind Ausgaben-, Einnahmen- oder Transfer-Typen. Sie sind immer in einer Gruppe organisiert. Gruppen und Kategorien sind pro Konto konfigurierbar — jedes Konto hat seine eigene Kategorienliste.

### Envelope Budgeting
Jede Kategorie erhält pro Monat einen Planwert (budgetiert). Die Differenz zwischen Plan und tatsächlicher Aktivität ergibt den verfügbaren Betrag. Übrige Beträge können in den Folgemonat übertragen werden (Rollover). Bei dem Übertrag auf den nächsten Monat soll der Wert des aktuellen Monats ebenfalls auf den nächsten Monat übertragen werden. Für den Fall, dass im aktuellen Monat das Budget nicht ausgeschöpft wurde, soll es in den nächsten Monat übertragen werden. 

### Unterkonten (Envelopes)
Virtuelle Konten unter einem physischen Konto. Werden über Gruppen gesteuert. Kategorien können mit Unterkonto-Gruppen verknüpft sein (Buchung oder Transfer).

### Kredite
Annuitätendarlehen und Ratenkredit mit generiertem Tilgungsplan, Sondertilgungen, Status je Rate und optionaler Verknüpfung mit Buchungskategorie und Konto.

---

## 3. Navigationsstruktur

```
/dashboard          → Monatsübersicht, Kennzahlen, Charts, letzte Transaktionen
/accounts           → Alle Konten als Kacheln
/accounts/[id]      → Kontodetail: Transaktionen · Unterkonten · Budget (3 Tabs)
/budget             → Globale Budget-Tabelle aller Konten
/transactions       → Transaktionsliste mit Suche
/import             → CSV-Import Assistent (4 Schritte)
/reports            → Berichte: Monatsübersicht · Kategorienanalyse · Budget vs. Ist
/loans              → Kreditübersicht
/loans/[id]         → Tilgungsplan, Ratenverwaltung
/settings/general   → Konten verwalten, Währung/Sprache
/settings/categories → Kategorien & Gruppen (pro Konto)
/settings/rules     → Kategorisierungsregeln für CSV-Import
/settings/loans     → Kredite anlegen/bearbeiten
```

---

## 4. Datenmodell

### Account
| Feld | Typ | Beschreibung |
|---|---|---|
| id | String (CUID) | Primärschlüssel |
| name | String | Anzeigename |
| bank | String? | Bankname |
| iban | String? | IBAN (unique) |
| type | Enum | CHECKING · SAVINGS · CREDIT_CARD · CASH · INVESTMENT |
| color | String | Hex-Farbe für UI |
| icon | String? | Optionales Icon |
| currentBalance | Float | Aktueller Kontostand |
| isActive | Boolean | Soft-Delete |

### CategoryGroup
| Feld | Typ | Beschreibung |
|---|---|---|
| id | String | PK |
| name | String | Gruppenname |
| accountId | String | Konto-Zugehörigkeit (pro-Konto) |
| sortOrder | Int | Reihenfolge |

### Category
| Feld | Typ | Beschreibung |
|---|---|---|
| id | String | PK |
| name | String | Kategoriename |
| color | String | Hex-Farbe |
| icon | String? | Optionales Icon |
| type | Enum | INCOME · EXPENSE · TRANSFER |
| groupId | String? | Zugehörige Gruppe |
| sortOrder | Int | Reihenfolge |
| isActive | Boolean | Soft-Delete |
| subAccountGroupId | String? | Verknüpftes Unterkonto (optional) |
| subAccountLinkType | String | BOOKING · TRANSFER (default: BOOKING) |

### Transaction
| Feld | Typ | Beschreibung |
|---|---|---|
| id | String | PK |
| date | DateTime | Buchungsdatum |
| amount | Float | Betrag (negativ = Ausgabe, positiv = Einnahme) |
| description | String | Beschreibungstext |
| payee | String? | Auftraggeber / Empfänger |
| notes | String? | Notizen |
| type | Enum | INCOME · EXPENSE · TRANSFER |
| status | Enum | PENDING · CLEARED · RECONCILED |
| accountId | String | Konto |
| categoryId | String? | Kategorie (optional) |
| importHash | String? | SHA-256 für Duplikaterkennung (unique) |
| transferToId | String? | Gegenbuchung bei Transfers (unique) |
| isReconciled | Boolean | Abgeglichen-Flag |
| subAccountEntryId | String? | Verknüpfter Unterkonto-Eintrag (unique) |

### BudgetEntry
| Feld | Typ | Beschreibung |
|---|---|---|
| id | String | PK |
| year | Int | Budgetjahr |
| month | Int | Budgetmonat (1–12) |
| categoryId | String | Kategorie |
| budgeted | Float | Planwert (negativ bei Ausgaben) |
| rolledOver | Float | Übertrag aus Vormonat |

### Loan
| Feld | Typ | Beschreibung |
|---|---|---|
| id | String | PK |
| name | String | Kreditname |
| loanType | String | ANNUITAETENDARLEHEN · RATENKREDIT |
| principal | Float | Darlehensbetrag |
| interestRate | Float | Zinssatz p.a. (z.B. 0.035 = 3,5%) |
| initialRepaymentRate | Float | Anfangstilgung (nur Annuität, default: 0) |
| termMonths | Int | Laufzeit in Monaten |
| monthlyPayment | Float | Berechnete monatliche Rate |
| startDate | DateTime | Erste Rate |
| accountId | String? | Verknüpftes Konto |
| categoryId | String? | Buchungskategorie |
| notes | String? | Notizen |
| isActive | Boolean | Soft-Delete |

### LoanPayment
| Feld | Typ | Beschreibung |
|---|---|---|
| id | String | PK |
| loanId | String | Kredit |
| periodNumber | Int | Ratennummer (unique pro Kredit) |
| dueDate | DateTime | Fälligkeitsdatum |
| scheduledPrincipal | Float | Planmäßige Tilgung |
| scheduledInterest | Float | Planmäßige Zinsen |
| scheduledBalance | Float | Restschuld nach Rate |
| paidAt | DateTime? | Tatsächliches Zahldatum (null = unbezahlt) |
| extraPayment | Float | Sondertilgung (default: 0) |
| transactionId | String? | Verknüpfte Transaktion (unique) |
| notes | String? | Notizen |

> **Hinweis:** Eine Rate gilt als bezahlt wenn `paidAt IS NOT NULL`.

### CsvProfile
| Feld | Typ | Beschreibung |
|---|---|---|
| id | String | PK |
| name | String | Profilname |
| delimiter | String | Trennzeichen (default: ";") |
| dateFormat | String | Datumsformat (default: "DD.MM.YYYY") |
| encoding | String | Zeichenkodierung (default: "UTF-8") |
| skipRows | Int | Übersprungene Kopfzeilen (default: 0) |
| columnMapping | String | JSON-Spalten-Zuordnung |
| amountFormat | String | Betragsformat: DE · EN (default: "DE") |

> Wird für B-006 (Importprofil speichern) verwendet — noch nicht in der UI implementiert.

### CategoryRule
| Feld | Typ | Beschreibung |
|---|---|---|
| id | String | PK |
| name | String | Regelname |
| field | Enum | DESCRIPTION · PAYEE · AMOUNT |
| operator | Enum | CONTAINS · STARTS_WITH · ENDS_WITH · EQUALS · GREATER_THAN · LESS_THAN · REGEX |
| value | String | Suchwert |
| categoryId | String | Ziel-Kategorie |
| priority | Int | Höher = bevorzugt |
| isActive | Boolean | Aktiv/Inaktiv |

---

## 5. API-Routen

### Konten
| Methode | Route | Funktion |
|---|---|---|
| GET | /api/accounts | Alle aktiven Konten (inkl. internen Allokations-Abzug) |
| POST | /api/accounts | Konto anlegen |
| GET | /api/accounts/[id] | Konto + letzte 50 Transaktionen |
| PUT | /api/accounts/[id] | Konto bearbeiten |
| DELETE | /api/accounts/[id] | Soft-Delete (isActive = false) |
| GET | /api/accounts/[id]/category-groups | Kategoriegruppen des Kontos |
| POST | /api/accounts/[id]/sub-accounts | Unterkonto anlegen |
| POST | /api/accounts/[id]/reconcile | Kontoabgleich durchführen |

### Transaktionen
| Methode | Route | Funktion |
|---|---|---|
| GET | /api/transactions | Liste (Filter: accountId, categoryId, from, to, search, limit) |
| POST | /api/transactions | Transaktion anlegen (inkl. Gegenbuchung, Unterkonto-Eintrag) |
| PUT | /api/transactions/[id] | Transaktion bearbeiten |
| DELETE | /api/transactions/[id] | Transaktion löschen (inkl. Kredit-Revert) |

### Kategorien
| Methode | Route | Funktion |
|---|---|---|
| GET | /api/categories | Alle Kategorien gruppiert |
| POST | /api/categories | Kategorie anlegen |
| PUT | /api/categories/[id] | Kategorie bearbeiten |
| DELETE | /api/categories/[id] | Kategorie löschen |
| POST | /api/categories/reorder | Reihenfolge speichern |

### Kategoriegruppen
| Methode | Route | Funktion |
|---|---|---|
| GET | /api/category-groups | Alle Gruppen (optional: ?accountId=) |
| POST | /api/category-groups | Gruppe anlegen |
| PUT | /api/category-groups/[id] | Gruppe bearbeiten |
| DELETE | /api/category-groups/[id] | Gruppe löschen |
| POST | /api/category-groups/reorder | Reihenfolge speichern |

### Budget (global — alle Konten)
| Methode | Route | Funktion |
|---|---|---|
| GET | /api/budget/[year]/[month] | Budget-Tabelle mit Aktivität und Verfügbar-Berechnung |
| PUT | /api/budget/[year]/[month] | Planwerte speichern (Batch) |
| POST | /api/budget/[year]/[month]/rollover | Übertrag in Folgemonat |

### Budget (konto-spezifisch — für Konto-Detail-Tab)
| Methode | Route | Funktion |
|---|---|---|
| GET | /api/accounts/[id]/budget/[year]/[month] | Budget-Tabelle nur für dieses Konto |
| POST | /api/accounts/[id]/budget/[year]/[month]/rollover | Übertrag nur für dieses Konto |

### Regeln
| Methode | Route | Funktion |
|---|---|---|
| GET | /api/rules | Alle Regeln |
| POST | /api/rules | Regel anlegen |
| PUT | /api/rules/[id] | Regel bearbeiten |
| DELETE | /api/rules/[id] | Regel löschen |

### Kredite
| Methode | Route | Funktion |
|---|---|---|
| GET | /api/loans | Alle aktiven Kredite mit Kennzahlen |
| POST | /api/loans | Kredit anlegen + Tilgungsplan generieren |
| PUT | /api/loans/[id] | Kredit bearbeiten |
| DELETE | /api/loans/[id] | Kredit löschen |
| PUT | /api/loans/[id]/payments/[period] | Rate als bezahlt markieren, Sondertilgung |

### Unterkonten
| Methode | Route | Funktion |
|---|---|---|
| GET | /api/sub-accounts | Alle Unterkonten (inkl. Saldo) |
| POST | /api/sub-accounts | Unterkonto anlegen |
| PUT | /api/sub-accounts/[id] | Unterkonto bearbeiten |
| DELETE | /api/sub-accounts/[id] | Unterkonto löschen |
| GET | /api/sub-accounts/[id]/groups | Gruppen eines Unterkontos |
| POST | /api/sub-account-groups | Gruppe anlegen |
| PUT | /api/sub-account-groups/[id] | Gruppe bearbeiten |
| DELETE | /api/sub-account-groups/[id] | Gruppe löschen |
| DELETE | /api/sub-account-entries/[id] | Eintrag löschen |

### Import & Berichte
| Methode | Route | Funktion |
|---|---|---|
| POST | /api/import | Bulk-Import mit Duplikatprüfung via Hash |
| GET | /api/reports/monthly-summary | Einnahmen/Ausgaben nach Monat aggregiert |
| GET | /api/reports/category-spending | Kategorienausgaben nach Monat/Jahr |

---

## 6. Implementierungsstatus

### ✅ Vollständig implementiert
- Konten: Anlegen, Bearbeiten, Soft-Delete, Detailansicht
- Transaktionen: Manuell erfassen, Löschen, Suche, Transfer-Logik
- Kategorien & Gruppen: CRUD, Reihenfolge, pro-Konto-Konfiguration
- Budget (global): Monatliche Planwerte, Rollover, Verfügbar-Berechnung
- Budget (konto-spezifisch): Im Konto-Detail-Tab, separater Rollover
- CSV-Import: 4-Schritt-Assistent, 10 Bankprofile, Regelanwendung, Hash-Duplikatprüfung
- Kategorisierungsregeln: CRUD, alle Operatoren inkl. Regex
- Kredite: CRUD, Tilgungsplan (Annuität + Ratenkredit), Ratenverwaltung, Sondertilgung
- Unterkonten: CRUD, Gruppen, Einträge, BOOKING/TRANSFER-Verknüpfung
- Kontoabgleich (Reconcile)
- Dashboard: KPIs, Charts (Monatsverlauf, Kategorienverteilung)
- Berichte: Monatliche Übersicht, Kategorienanalyse, Budget vs. Ist
- Einstellungen: Währung/Locale, Kategorien, Regeln, Kredite, Konten
- Transaktionsdetail im Budget-Tab (Doppelklick auf Betrag)
- Dropdown-Anzeige: Alle Dropdowns zeigen Klartext statt Schlüsselwerte (auch bei Vorbelegung)

### 🔲 Geplant / Backlog
Siehe Abschnitt 7.

---

## 7. Backlog

> Neue Features werden hier zuerst spezifiziert. Format: Titel, Beschreibung, Akzeptanzkriterien.

### B-001 · Transaktionen bearbeiten
**Beschreibung:** Eine bestehende Transaktion soll editierbar sein — Datum, Betrag, Beschreibung, Kategorie, Status ändern.
**Akzeptanzkriterien:**
- Klick auf eine Transaktion (Transaktionsliste oder Konto-Detail) öffnet das Bearbeitungsformular
- Alle Felder aus der Erfassung sind editierbar
- Status kann auf CLEARED / RECONCILED gesetzt werden
- Speichern aktualisiert Kontosaldo entsprechend der Differenz

### B-002 · Wiederkehrende Transaktionen
**Beschreibung:** Regelmäßige Buchungen (z.B. Miete monatlich) einmalig konfigurieren und automatisch vorschlagen oder erzeugen.
**Akzeptanzkriterien:**
- Transaktion als "wiederkehrend" markierbar mit Frequenz (täglich / wöchentlich / monatlich / jährlich)
- Liste offener Fälligkeiten auf dem Dashboard
- Manuelle Bestätigung jeder Buchung (kein vollautomatisches Buchen)

### B-003 · Kontoabgleich verbessern
**Beschreibung:** Beim Abgleich sollen einzelne Transaktionen als CLEARED markiert werden können.
**Akzeptanzkriterien:**
- Liste aller PENDING-Transaktionen im Abgleich-Dialog
- Checkbox pro Transaktion zum Markieren als CLEARED
- Summe der markierten Transaktionen wird angezeigt und mit Kontoauszug verglichen
- Abschluss setzt alle markierten auf RECONCILED

### B-004 · Transaktionen: Massenbearbeitung
**Beschreibung:** Mehrere Transaktionen gleichzeitig auswählen und gemeinsam kategorisieren oder löschen.
**Akzeptanzkriterien:**
- Checkbox-Spalte in der Transaktionsliste
- Aktionsleiste erscheint bei Selektion (Anzahl gewählt, Aktionen: Kategorie setzen, Löschen)
- Bestätigungsdialog vor Massenlöschung

### B-005 · Konto-Saldo-Verlauf
**Beschreibung:** Im Konto-Detail-Tab einen Chart anzeigen, der den Saldo-Verlauf der letzten 12 Monate zeigt.
**Akzeptanzkriterien:**
- Liniendiagramm mit Monat auf X-Achse, Saldo auf Y-Achse
- Daten aus Transaktionshistorie berechnet (kumulierte Summe)
- Auf Desktop lesbar, kein horizontales Scrollen nötig

### B-006 · Importprofil speichern
**Beschreibung:** Eigene CSV-Importprofile (Spaltenreihenfolge, Trennzeichen etc.) anlegen und speichern.
**Akzeptanzkriterien:**
- Beim Import: "Neues Profil aus aktueller Konfiguration speichern"
- Gespeicherte Profile erscheinen in der Profil-Auswahl
- Profile sind editierbar und löschbar in den Einstellungen

### B-007 · Export (CSV/JSON)
**Beschreibung:** Transaktionen und Budget-Daten als CSV oder JSON exportieren.
**Akzeptanzkriterien:**
- Export-Button in Transaktionsliste (aktuelle Filter werden übernommen)
- Felder: Datum, Beschreibung, Auftraggeber, Betrag, Kategorie, Konto
- Download direkt im Browser (kein Server-Upload)

---

## 8. Arbeitsweise

### Spec Driven Development

1. **Feature-Idee** → Backlog-Eintrag mit Akzeptanzkriterien erstellen (in diesem Dokument)
2. **Freigabe** → Auftraggeber bestätigt die Spezifikation
3. **Implementierung** → Claude implementiert gemäß Spec
4. **Abnahme** → Auftraggeber prüft gegen Akzeptanzkriterien

**Regel:** Claude ändert keine bestehende Funktionalität ohne vorherige Spec-Aktualisierung und Freigabe. Ausnahme: Bugfixes, die keine Funktionsänderung bedeuten.

### Konventionen

| Bereich | Regel |
|---|---|
| Sprache | Deutsch in der UI, Englisch im Code |
| Währungsformatierung | Immer `useFormatCurrency()` Hook verwenden |
| Monatsnamen | Immer `getMonthName(month, year)` aus `@/lib/budget/calculations` |
| Dropdown-Werte | Kein Schlüsselwert sichtbar — `itemToStringLabel` oder `items` Prop |
| Typen | Kein `any` in Interfaces; `any` nur für externe API-Responses mit Kommentar |
| API-Fehler | `if (!res.ok) throw new Error(...)` in jedem `mutationFn` |
| Formulare | react-hook-form + Zod für alle Formulare mit Validierung |
| Beträge | Negativ = Ausgabe, Positiv = Einnahme (Datenbankkonvention) |
| Neue Seiten | Immer in `src/app/(app)/` unter dem App-Router-Layout |
| Neue Dialoge | Als eigenständige Komponente in `src/components/` |
