# BudgetApp Projekt-Verbesserung — Design Spec

**Datum:** 2026-04-08
**Grundlage:** `docs/Bewertung_BudgetApp_Pruefungsprojekt.docx`
**Ziel:** Alle 12 Backlog-Items (B-01 bis B-12) umsetzen, um die Gesamtnote von 2,0 auf 1,0 zu verbessern.

---

## Überblick

12 Verbesserungsitems aus der Projektbewertung, gruppiert in 8 PRs über 4 Phasen. Reihenfolge optimiert nach: Quick Wins zuerst, dann Sicherheitsnetz (Tests), dann Refactoring, dann Polish.

## Phase 1: Quick Fixes & Fundament

### PR 1 — B-05, B-08, B-11, B-12 (Branch: `chore/quick-fixes`)

**B-05: `$queryRawUnsafe` eliminieren**
- `src/app/api/reports/net-worth/route.ts`: `$queryRawUnsafe` durch `$queryRaw` mit Tagged Template Literals ersetzen
- `src/app/api/sub-accounts/route.ts`: Gleiche Änderung
- Prisma `$queryRaw` mit Template Literals nutzt automatisch parametrisierte Queries — kein SQL-Injection-Risiko

**B-08: Magic Numbers extrahieren**
- `src/lib/loans/amortization.ts`: `0.005` → `const BALANCE_EPSILON = 0.005`
- `src/lib/savings/service.ts`: `30.44` → `const AVG_DAYS_PER_MONTH = 30.44`, `24` → `const DEFAULT_FORECAST_MONTHS = 24`
- Konstanten jeweils in der Datei definieren, in der sie genutzt werden (kein zentrales constants.ts nötig, da feature-spezifisch)

**B-11: `.env.example` und API-Dokumentation**
- `.env.example` im Root erstellen mit kommentiertem `DATABASE_URL`
- Keine OpenAPI-Spec (Overkill für lokale App), stattdessen: Endpoint-Übersicht als Abschnitt in `DOKUMENTATION.md` ergänzen, sofern nicht schon vorhanden

**B-12: `console.error` durch Logger ersetzen**
- `src/lib/logger.ts` erstellen: Minimaler Logger mit `debug`, `info`, `warn`, `error` Funktionen
- In Development: alle Levels ausgeben. In Production: nur `error`
- Erkennung über `process.env.NODE_ENV`
- `src/lib/api/handler.ts`: `console.error(e)` → `logger.error(e)`
- `src/components/import/ImportStep1Upload.tsx`: `console.error(e)` → `logger.error(e)`

**Aufwand:** ~2h

---

## Phase 2: Test-Sicherheitsnetz aufbauen

### PR 2 — B-02: Service-Layer-Tests (Branch: `test/service-layer`)

**`tests/unit/sub-account-entries-service.test.ts`**
- Testet alle 6 exportierten Funktionen: `createLinkedEntry`, `updateLinkedEntry`, `deleteLinkedEntry`, `createEntryFromTransaction`, `updateEntryFromTransaction`, `deleteEntryFromTransaction`
- Da diese Funktionen einen Prisma `TxClient` erwarten: Mock des Prisma-Clients oder Test gegen echte Test-DB (Entscheidung bei Implementierung — echter DB-Test bevorzugt für Integration)
- Testfälle: Erfolg, fehlende Gruppe (404), Balance-Updates korrekt gerundet, Transfer-Paarung

**`tests/unit/savings-service.test.ts`**
- `updateSavings()`: Schedule-Rebuild, Zinsänderung, Gebührenänderung
- `payEntry()`: Balance-Update, Status-Änderung, Rounding
- `deleteSavings()`: Cascading Deletes, Balance-Revert
- `extendSchedule()`: Korrekte Perioden-Generierung

**`tests/unit/budget-calculations.test.ts`**
- `getAvailableBg()`: Styling-Klassen für verschiedene Beträge
- `getMonthName()`: Locale-Tests (deutsch)
- Alle exportierten Funktionen aus `src/lib/budget/calculations.ts`

**Aufwand:** ~4-6h

### PR 3 — B-03: API-Tests erweitern (Branch: `test/api-coverage`)

Ziel: Von 12/51 (23,5%) auf mindestens 36/51 (>70%).

**Neue Testdateien:**
- `tests/api/sub-accounts.test.ts` — GET /api/sub-accounts, GET /api/sub-accounts/[id]
- `tests/api/sub-account-groups.test.ts` — CRUD für Gruppen + Entries
- `tests/api/sub-account-entries.test.ts` — CRUD für Entries
- `tests/api/savings-payments.test.ts` — POST pay, POST extend, POST entries/[id]/pay
- `tests/api/budget-rollover.test.ts` — POST rollover für Monat und Global
- `tests/api/reconciliation.test.ts` — POST accounts/[id]/reconcile
- `tests/api/reorder.test.ts` — POST accounts/reorder, categories/reorder, category-groups/reorder
- `tests/api/asset-values.test.ts` — CRUD für assets/[id]/values
- `tests/api/portfolio-values.test.ts` — CRUD für portfolios/[id]/values

**Testmuster:** Bestehende Patterns aus `tests/api/helpers.ts` und `tests/api/seed.ts` wiederverwenden. Seed-Daten erweitern wo nötig.

**Aufwand:** ~6-8h

---

## Phase 3: UI verbessern

### PR 4 — B-01 Teil 1: TransactionFormDialog aufbrechen (Branch: `refactor/transaction-form`)

**Aktuelle Datei:** `src/components/transactions/TransactionFormDialog.tsx` (825 Zeilen)

**Zielstruktur:**
```
src/components/transactions/
├── TransactionFormDialog.tsx          (~200 Zeilen, orchestriert Sub-Komponenten)
├── TransactionAccountSection.tsx      (Konto-Auswahl, Typ-Selector)
├── TransactionAmountSection.tsx       (Beträge, Haupt-/Unterkonto-Felder)
├── TransactionTransferSection.tsx     (Transfer-spezifische Felder, Zielkonto)
├── TransactionMetadataSection.tsx     (Datum, Beschreibung, Kategorie, Status)
└── useTransactionForm.ts             (Form-Logik, Zod-Schema, Mutations als Custom Hook)
```

**Regeln:**
- Kein Verhalten ändern — reines Refactoring
- Alle bestehenden Tests müssen weiter grün sein
- Shared Form State über react-hook-form `useFormContext` oder Props
- Keine neuen Dependencies

### PR 5 — B-01 Teil 2: Budget-Komponenten aufbrechen (Branch: `refactor/budget-components`)

**AccountBudgetTab.tsx (753 Zeilen) →**
```
src/components/accounts/budget/
├── AccountBudgetTab.tsx               (~250 Zeilen, Hauptcontainer)
├── BudgetMonthTable.tsx               (Tabellen-Rendering)
├── BudgetCategoryRow.tsx              (Einzelne Kategorie-Zeile mit Inline-Edit)
└── CategoryActivityDialog.tsx         (Dialog für Kategorie-Aktivitäten)
```

**AccountBudgetConfig.tsx (773 Zeilen) →**
```
src/components/accounts/budget/
├── AccountBudgetConfig.tsx            (~250 Zeilen, Hauptcontainer)
├── BudgetGroupEditor.tsx              (Gruppen-CRUD + Drag-Drop)
├── BudgetCategoryEditor.tsx           (Kategorie-CRUD innerhalb einer Gruppe)
└── useBudgetConfigDnd.ts              (Drag-Drop-Logik als Custom Hook)
```

**Regeln:** Wie PR 4 — reines Refactoring, keine Verhaltensänderung.

**Aufwand PR 4 + PR 5:** ~6-8h gesamt

### PR 6 — B-04 + B-06: Error-States & Accessibility (Branch: `feat/error-states-a11y`)

**B-04: Error-States**
- `src/components/ErrorBoundary.tsx` erstellen: React Error Boundary mit Fallback-UI ("Etwas ist schiefgelaufen" + Retry-Button)
- In `src/app/(app)/layout.tsx` um den Hauptinhalt wrappen
- Jeder `useQuery`-Aufruf: `isError`/`error` destructuren und Fallback rendern (Inline-Fehlermeldung oder Toast)
- Dashboard (`src/app/(app)/dashboard/page.tsx`): Einzelne Query-Fehler zeigen Placeholder statt die ganze Seite brechen zu lassen
- Mutations: `onError`-Callback prüfen und konsistent `toast.error()` aufrufen

**B-06: Accessibility**
- Icon-Buttons: `aria-label` auf alle Buttons die nur Icons enthalten (ChevronLeft, ChevronRight, Trash, Edit, etc.)
- Farb-Indikatoren: `aria-label` oder `title` Attribut mit Farbname/Zweck
- Budget-Tabelle: Prüfen dass Tab-Navigation durch editierbare Felder funktioniert
- `@axe-core/playwright` als devDependency installieren
- Ein Playwright-A11y-Test pro Hauptseite (Dashboard, Accounts, Transactions, Budget): Seite laden + `checkA11y()` laufen lassen

**Aufwand:** ~4h

---

## Phase 4: E2E & Polish

### PR 7 — B-07: E2E-Tests erweitern (Branch: `test/e2e-expansion`)

**Neue Playwright-Specs:**
```
tests/
├── savings/           (bestehend, 6 Specs)
├── accounts/          (NEU)
│   ├── 01-create-account.spec.ts
│   ├── 02-edit-account.spec.ts
│   └── 03-delete-account.spec.ts
├── transactions/      (NEU)
│   ├── 01-create-transaction.spec.ts
│   ├── 02-edit-transaction.spec.ts
│   ├── 03-filter-search.spec.ts
│   └── 04-delete-transaction.spec.ts
└── budget/            (NEU)
    ├── 01-set-budget.spec.ts
    └── 02-rollover.spec.ts
```

- `playwright.config.ts`: `testDir` auf `./tests` erweitern (nicht mehr nur `./tests/savings`)
- `.github/workflows/ci.yml`: E2E-Job einkommentieren und konfigurieren (braucht `npx playwright install`, Dev-Server starten)

**Aufwand:** ~6-8h

### PR 8 — B-09 + B-10: UX Polish (Branch: `feat/ux-polish`)

**B-09: Optimistic Updates**
- Häufigste Mutations identifizieren: Transaction erstellen/löschen, BudgetEntry ändern
- TanStack Query `onMutate` + `onError` (Rollback) + `onSettled` (Refetch) Pattern
- Nur dort wo die UI-Verzögerung spürbar ist — nicht überall

**B-10: Granulare Cache-Invalidierung**
- Query Keys mit Parametern anreichern: `['transactions', { accountId, page }]` statt `['transactions']`
- `invalidateQueries` nur betroffene Keys invaliadieren
- Audit aller Stellen wo `invalidateQueries` aufgerufen wird

**Aufwand:** ~3-4h

---

## Zusammenfassung

| Phase | PRs | Items | Gesamtaufwand |
|-------|-----|-------|---------------|
| 1: Quick Fixes | PR 1 | B-05, B-08, B-11, B-12 | ~2h |
| 2: Test-Sicherheitsnetz | PR 2, PR 3 | B-02, B-03 | ~10-14h |
| 3: UI verbessern | PR 4, PR 5, PR 6 | B-01, B-04, B-06 | ~10-12h |
| 4: E2E & Polish | PR 7, PR 8 | B-07, B-09, B-10 | ~9-12h |
| **Gesamt** | **8 PRs** | **12 Items** | **~31-40h** |

## Abhängigkeiten

```
PR 1 (Quick Fixes) ─────────────────────────────────────────→ kann sofort starten
PR 2 (Service Tests) ───────────────────────────────────────→ kann sofort starten
PR 3 (API Tests) ───────────────────────────────────────────→ kann sofort starten (nach PR 2 für Seed-Erweiterungen)
PR 4 (TransactionForm Refactor) ────→ nach PR 2+3 (Sicherheitsnetz)
PR 5 (Budget Refactor) ────────────→ nach PR 2+3 (Sicherheitsnetz)
PR 6 (Error States + A11y) ────────→ nach PR 4+5 (auf refactored Components)
PR 7 (E2E Tests) ──────────────────→ nach PR 6 (testet fertigen UI-Zustand)
PR 8 (UX Polish) ──────────────────→ nach PR 6 (ändert Query-Patterns nach Error-Handling)
```
