# Test-Strategie BudgetApp

**Datum:** 2026-04-07
**Status:** Approved

## Ziel

Umfassende Test-Abdeckung auf drei Schichten (Unit, API-Integration, E2E) mit automatischer Ausführung bei Commits (Pre-Commit-Hook) und auf GitHub (CI). Regressionen sollen früh erkannt werden, besonders in Finanzberechnungen und Business-Logik.

## Kontext

Das Projekt hat aktuell:
- 6 Playwright E2E-Tests (nur Savings-Feature)
- ESLint
- Keine Unit-Tests, kein Test-Framework für Nicht-E2E
- Keine Pre-Commit-Hooks
- Keine CI/CD

Das Projekt enthält ~350 LOC reine Funktionen (Finanzmath, CSV-Parsing, Regeln), ~1.200 LOC Service-Layer mit DB-Zugriff und 51 API-Routes.

## Design

### 1. Test-Framework: Vitest

Vitest für Unit- und API-Integrationstests. Playwright bleibt für E2E.

**Warum Vitest:**
- Native ESM/TypeScript — kein Babel oder extra Config
- Kompatibel mit Next.js App Router
- Schnell (isolierte Worker, HMR-ähnliches Caching)
- Gleiche `expect`-API wie Jest (vertraute Syntax)

**Neue npm Scripts:**
```
"test":          "vitest run"
"test:unit":     "vitest run tests/unit"
"test:api":      "vitest run tests/api"
"test:e2e":      "playwright test"
"test:all":      "vitest run && playwright test"
```

### 2. Schicht 1 — Unit-Tests

Testen alle reinen Funktionen ohne DB oder Server.

**Verzeichnis:** `tests/unit/`

| Testdatei | Modul | Funktionen | Testfokus |
|---|---|---|---|
| `money.test.ts` | `src/lib/money.ts` | `roundCents`, `balanceIncrement` | Floating-Point-Randfälle (0.1+0.2, negative Werte, große Beträge, 0) |
| `amortization.test.ts` | `src/lib/loans/amortization.ts` | `calcAnnuityFromRates`, `generateSchedule` | Annuitäten vs. Ratenkredit, Restschuld=0 am Ende, Sondertilgungen, 0%-Zins |
| `savings-schedule.test.ts` | `src/lib/savings/schedule.ts` | `generateSavingsSchedule`, `addMonths` | Sparplan, Festgeld, Zinsen, Monatsüberläufe (Jan→Feb, Dez→Jan), Gebühren |
| `rules-matcher.test.ts` | `src/lib/rules/matcher.ts` | `applyRules`, `matchesRule` | Alle Operatoren (CONTAINS, STARTS_WITH, ENDS_WITH, EQUALS, REGEX, GREATER_THAN, LESS_THAN), Prioritäten, keine Matches |
| `validate-regex.test.ts` | `src/lib/rules/validate-regex.ts` | `validateRegexPattern` | Gültige Regex, ungültige Syntax, ReDoS-Muster |
| `csv-parser.test.ts` | `src/lib/csv/parser.ts` | `parseAmount`, `parseDate`, `computeHash` | DE-Format (1.234,56), EN-Format (1,234.56), verschiedene Datumsformate, leere Werte, Hash-Konsistenz |
| `schemas.test.ts` | `src/lib/schemas/*.ts` | Zod-Schemas | Valide Eingaben passieren, invalide werden abgelehnt, Randfälle (leere Strings, negative Zahlen) |
| `handler.test.ts` | `src/lib/api/handler.ts` + `errors.ts` | `withHandler`, `DomainError` | ZodError→400 mit Issues, DomainError→korrekter Status, unbekannter Fehler→500 |

**Geschätzt: ~100-150 Testfälle, Laufzeit < 2 Sekunden.**

### 3. Schicht 2 — API-Integrationstests

Testen die API-Route-Handler mit einer echten SQLite-Test-Datenbank — aber ohne HTTP-Server.

**Verzeichnis:** `tests/api/`

#### 3.1 Test-Datenbank

- Datei: `prisma/test.db` (in `.gitignore`)
- Wird vor jedem Testlauf frisch erstellt: Schema aus `dev.db` anwenden (wie `prepare-electron-db.js`), dann Seed-Daten laden
- Vitest `globalSetup` erstellt die DB, `globalTeardown` löscht sie

#### 3.2 Seed-Daten (Hybrid-Ansatz)

Eine `tests/api/seed.ts` lädt Basis-Daten die jeder Test braucht:

**Fester Seed:**
- 2 Konten: "Girokonto" (CHECKING, 1.000€ Balance), "Sparkonto" (SAVINGS, 5.000€)
- 2 Kategoriegruppen pro Konto: "Fixkosten", "Variable Kosten"
- 4 Kategorien: "Miete" (EXPENSE), "Lebensmittel" (EXPENSE), "Gehalt" (INCOME), "Sonstiges" (EXPENSE)
- 1 CSV-Profil (Deutsche Bank Format)
- App-Settings (EUR, de-DE)

**Pro Test:** Tests die Daten verändern (Transaktionen erstellen, Budget zuweisen, Loans anlegen) erstellen ihre eigenen Daten und räumen im `afterEach` auf.

#### 3.3 Aufruf-Pattern

Route-Handler sind async-Funktionen die direkt aufrufbar sind:

```ts
import { GET, POST } from '@/app/api/accounts/route'

const req = new Request('http://test/api/accounts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Testkonto', type: 'CHECKING' }),
})
const res = await POST(req)
const data = await res.json()
expect(res.status).toBe(201)
expect(data.name).toBe('Testkonto')
```

#### 3.4 Test-Helfer

`tests/api/helpers.ts` — Wiederverwendbare Utilities:
- `createRequest(method, path, body?)` — baut Request-Objekte
- `seedAccount(overrides?)` — erstellt Test-Konto direkt via Prisma
- `seedTransaction(accountId, overrides?)` — erstellt Test-Transaktion
- `cleanTable(tableName)` — leert eine Tabelle nach dem Test

#### 3.5 Abdeckung

| Testdatei | API-Routes | Testfokus |
|---|---|---|
| `accounts.test.ts` | GET/POST/PUT/DELETE accounts | CRUD, Sortierung, Balance-Berechnung, Soft-Delete |
| `transactions.test.ts` | GET/POST/PUT/DELETE transactions | Erstellen, Filtern (Datum, Kategorie, Suche), Pagination, Transfer-Paare, Balance-Updates via `balanceIncrement` |
| `budget.test.ts` | GET/PUT budget/[year]/[month] | Budget zuweisen, Zusammenfassung (budgeted/activity/available), Rollover |
| `categories.test.ts` | categories + category-groups | CRUD, Sortierung, konto-spezifisch |
| `loans.test.ts` | loans + payments | Kredit anlegen, Ratenplan, Zahlungen buchen |
| `savings.test.ts` | savings + entries | Sparplan/Festgeld erstellen, Einzahlungen, Verlängerung |
| `portfolios.test.ts` | portfolios + values | CRUD, Wertentwicklung |
| `assets.test.ts` | assets + asset-types + values | CRUD, Typen-Verwaltung |
| `import.test.ts` | import | CSV-Parsing, Duplikaterkennung (importHash) |
| `settings.test.ts` | settings | Lesen, Schreiben, Default-Werte |
| `rules.test.ts` | rules | CRUD, Anwendung auf Transaktionen |
| `reports.test.ts` | reports/* | Monatszusammenfassung, Kategorie-Spending, Kontostand-Verlauf, Net-Worth |

**Geschätzt: ~200-300 Testfälle, Laufzeit ~5-10 Sekunden.**

### 4. Schicht 3 — E2E-Tests (Playwright, erweitert)

Erweitern die bestehenden 6 Savings-Tests auf alle Features.

**Verzeichnis:** `tests/` (bestehendes Verzeichnis)

**Ansatz:** Jeder Feature-Ordner hat `helpers.ts` (API-Helfer für Setup/Teardown) + `*.spec.ts` (User-Flows). Tests erstellen ihre eigenen Daten über die API (kein Seed), wie die bestehenden Savings-Tests.

| Feature | User-Flows |
|---|---|
| `tests/accounts/` | Konto anlegen, bearbeiten, löschen, Sortierung per Drag&Drop |
| `tests/transactions/` | Manuell anlegen, bearbeiten, löschen, filtern, Status ändern |
| `tests/budget/` | Monat navigieren, Budget zuweisen, Verfügbar prüfen |
| `tests/import/` | CSV hochladen, Mapping konfigurieren, importieren, Duplikate erkennen |
| `tests/loans/` | Kredit anlegen, Ratenplan ansehen, Zahlung buchen |
| `tests/portfolios/` | Portfolio anlegen, Werte eintragen |
| `tests/assets/` | Sachtyp anlegen, Sachwert anlegen, Bewertung eintragen |
| `tests/reports/` | Monatsübersicht laden, Zeitraum wählen |
| `tests/settings/` | Einstellungen ändern, Seite neu laden → Einstellungen gespeichert |

**Geschätzt: ~50-80 Testfälle, Laufzeit ~1-2 Minuten.**

### 5. Automatisierung

#### 5.1 Pre-Commit-Hook (Husky + lint-staged)

Bei jedem `git commit`:
1. **ESLint** auf geänderte `.ts/.tsx`-Dateien
2. **Vitest** `--related` auf geänderte Dateien (nur betroffene Unit/API-Tests)

Blockiert den Commit bei Fehlern. Laufzeit: ~2-5 Sekunden.

#### 5.2 GitHub Actions CI

**Trigger:** Push auf alle Branches + PRs gegen `main`

**Workflow:**

```
Job 1: lint-and-unit (parallel)
  - npm ci
  - npm run lint
  - npm run test:unit

Job 2: api-integration (parallel)
  - npm ci
  - npx prisma generate
  - npm run test:api

Job 3: e2e (nach Job 1+2 bestanden)
  - npm ci
  - npx playwright install --with-deps
  - npm run build
  - npm run test:e2e
```

Jobs 1 und 2 laufen parallel (~15s). Job 3 läuft danach (~2min). Gesamte CI-Laufzeit: ~2-3 Minuten.

PR bekommt grünen/roten Status-Check. Merge nur bei grüner CI.

#### 5.3 Coverage-Schwelle (Pflicht-Tests für neuen Code)

**Vitest Coverage** mit `@vitest/coverage-v8`:
- Schwellwerte für `src/lib/` und `src/app/api/`: **80% Zeilen-Coverage**
- CI schlägt fehl wenn Coverage unter Schwelle fällt
- Effekt: Wer neue Funktionen in `src/lib/` oder neue API-Routes hinzufügt, MUSS Tests schreiben — sonst sinkt die Coverage und der PR wird blockiert

**Vitest Config:**
```ts
coverage: {
  include: ['src/lib/**', 'src/app/api/**'],
  thresholds: { lines: 80 }
}
```

Die Schwelle wird initial auf den Stand nach Implementierung der Tests gesetzt und darf danach nur steigen.

#### 5.4 Konvention in CLAUDE.md

Neue Regel die ins CLAUDE.md aufgenommen wird:

```
## Tests — MANDATORY

Jede Codeänderung an `src/lib/` oder `src/app/api/` MUSS entsprechende Tests mitbringen:
- Neue reine Funktionen → Unit-Test in `tests/unit/`
- Neue/geänderte API-Routes → API-Test in `tests/api/`
- Neue Features/Pages → E2E-Test in `tests/[feature]/`

Kein PR ohne Tests. CI prüft Coverage-Schwelle automatisch.
```

### 6. Verzeichnisstruktur

```
tests/
  unit/                          # Schicht 1: Unit-Tests
    money.test.ts
    amortization.test.ts
    savings-schedule.test.ts
    rules-matcher.test.ts
    validate-regex.test.ts
    csv-parser.test.ts
    schemas.test.ts
    handler.test.ts
  api/                           # Schicht 2: API-Integrationstests
    setup.ts                     # globalSetup: DB erstellen + seeden
    teardown.ts                  # globalTeardown: DB löschen
    seed.ts                      # Basis-Testdaten
    helpers.ts                   # Shared test utilities
    accounts.test.ts
    transactions.test.ts
    budget.test.ts
    categories.test.ts
    loans.test.ts
    savings.test.ts
    portfolios.test.ts
    assets.test.ts
    import.test.ts
    settings.test.ts
    rules.test.ts
    reports.test.ts
  accounts/                      # Schicht 3: E2E (erweitert)
    helpers.ts
    01-crud.spec.ts
  transactions/
    helpers.ts
    01-crud.spec.ts
  budget/
    helpers.ts
    01-assign.spec.ts
  savings/                       # (bestehend)
    helpers.ts
    01-create-sparplan.spec.ts
    ...
  import/
    helpers.ts
    01-csv-import.spec.ts
  loans/
    helpers.ts
    01-crud.spec.ts
  portfolios/
    helpers.ts
    01-crud.spec.ts
  assets/
    helpers.ts
    01-crud.spec.ts
  reports/
    01-monthly-summary.spec.ts
  settings/
    01-general.spec.ts
```

### 7. Neue Dependencies

| Paket | Typ | Zweck |
|---|---|---|
| `vitest` | devDependency | Test-Runner für Unit + API-Tests |
| `@vitest/coverage-v8` | devDependency | Coverage-Reporting + Schwellwert-Prüfung |
| `husky` | devDependency | Git-Hook-Management |
| `lint-staged` | devDependency | Lint/Test nur geänderte Dateien |

### 8. Geänderte/Neue Config-Dateien

| Datei | Zweck |
|---|---|
| `vitest.config.ts` | Vitest-Konfiguration (Pfad-Aliase, Test-Verzeichnisse, globalSetup) |
| `.husky/pre-commit` | Pre-Commit-Hook Script |
| `.github/workflows/ci.yml` | GitHub Actions CI Pipeline |
| `.gitignore` | `prisma/test.db` hinzufügen |

### 9. Implementierungsreihenfolge

1. Vitest Setup + Unit-Tests (höchster Wert, schnellster Effekt)
2. Pre-Commit-Hook (Husky + lint-staged)
3. GitHub Actions CI (Lint + Unit-Tests)
4. API-Integrationstests (Test-DB + Seed + Route-Tests)
5. CI erweitern (API-Tests hinzufügen)
6. Erweiterte E2E-Tests (Feature für Feature)
7. CI erweitern (E2E-Tests hinzufügen)

### 10. Einschränkungen

- **Kein Test-Coverage-Reporting** in Phase 1 — kann später ergänzt werden
- **E2E-Tests brauchen laufenden Dev-Server** — Playwright startet ihn automatisch (bestehende Config)
- **API-Integrationstests brauchen `prisma generate`** — muss vor Testlauf laufen
- **SQLite-spezifisch** — Test-DB ist SQLite wie Produktion, keine Abweichung
