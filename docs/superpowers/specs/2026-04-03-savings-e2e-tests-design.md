# Spec: Sparkonto E2E-Tests (Playwright)

**Datum:** 2026-04-03
**Status:** Freigegeben

---

## 1. Ziel

Automatisierte Playwright-Tests für das Sparkonto-Feature, die alle relevanten
Eingabefeld-Kombinationen und Anzeigelogik an der Oberfläche abdecken.
Tests laufen gegen die laufende Dev-App (`http://localhost:3000`).

---

## 2. Setup

- **Framework:** `@playwright/test`
- **Config:** `playwright.config.ts` — baseURL `http://localhost:3000`, headless, 1 Worker
- **DB:** Live-DB `prisma/dev.db` — Tests räumen selbst auf (DELETE via API)
- **Script:** `"test:e2e": "playwright test"` in `package.json`

---

## 3. Testdateien

```
tests/
  savings/
    01-create-sparplan.spec.ts
    02-create-festgeld.spec.ts
    03-laufzeit-startkapital.spec.ts
    04-detail-view.spec.ts
    05-detail-pay.spec.ts
    06-edit.spec.ts
playwright.config.ts
```

---

## 4. Testfälle im Detail

### 4.1 `01-create-sparplan.spec.ts` — Sparplan anlegen

**Vorbedingung:** Kein Girokonto nötig für Basis-Tests; für verknüpfte Tests
wird ein Girokonto via API angelegt und am Ende gelöscht.

| # | Beschreibung | Eingaben | Erwartetes Ergebnis |
|---|---|---|---|
| 1 | Pflichtfelder-Validierung: Button disabled ohne Name | name leer, rate=3, contrib=100 | „Anlegen"-Button disabled |
| 2 | Pflichtfelder-Validierung: Button disabled ohne Zinssatz | name="Test", rate leer, contrib=100 | Button disabled |
| 3 | Pflichtfelder-Validierung: Button disabled ohne Sparrate | name="Test", rate=3, contrib leer | Button disabled |
| 4 | Minimalanlage | name, rate, contrib, alle Defaults | Toast „Sparkonto angelegt", Dialog schließt |
| 5 | Zinsgutschrift MONTHLY + Einzahlung MONTHLY | freq=MONTHLY×MONTHLY | Konto erscheint in Kontenübersicht |
| 6 | Zinsgutschrift QUARTERLY + Einzahlung MONTHLY | freq=QUARTERLY×MONTHLY | Konto angelegt |
| 7 | Zinsgutschrift ANNUALLY + Einzahlung QUARTERLY | freq=ANNUALLY×QUARTERLY | Konto angelegt |
| 8 | Zinsgutschrift MONTHLY + Einzahlung ANNUALLY | freq=MONTHLY×ANNUALLY | Konto angelegt |
| 9 | Mit IBAN | accountNumber="DE89 3704 0044 0532 0130 00" | IBAN auf Detailseite sichtbar |
| 10 | Mit Notizen | notes="Mein Sparplan" | — (keine UI-Darstellung, kein Fehler) |
| 11 | Mit verknüpftem Girokonto, ohne Kategorie | linkedAccountId gesetzt | Konto angelegt, Girokonto-Dropdown zeigt Konto |
| 12 | Mit verknüpftem Girokonto + Kategorie | linkedAccountId + categoryId gesetzt | Konto angelegt |
| 13 | Kategorie-Dropdown erscheint nur wenn Girokonto gewählt | linkedAccountId="" | Kein Kategorie-Dropdown sichtbar |

### 4.2 `02-create-festgeld.spec.ts` — Festgeld anlegen

| # | Beschreibung | Eingaben | Erwartetes Ergebnis |
|---|---|---|---|
| 1 | Typ-Wechsel zu Festgeld: Sparplan-Felder verschwinden | savingsType=FESTGELD | Kein „Sparrate"-Feld, kein „Girokonto"-Feld |
| 2 | Pflichtfelder: Button disabled ohne Name | — | Button disabled |
| 3 | Pflichtfelder: Button disabled ohne Zinssatz | — | Button disabled |
| 4 | Minimalanlage Festgeld | name, rate | Toast, Dialog schließt |
| 5 | Zinsgutschrift MONTHLY | interestFrequency=MONTHLY | Konto angelegt |
| 6 | Zinsgutschrift QUARTERLY | interestFrequency=QUARTERLY | Konto angelegt |
| 7 | Zinsgutschrift ANNUALLY | interestFrequency=ANNUALLY | Konto angelegt |
| 8 | Mit Startkapital | initialBalance=10000 | Kontoübersicht zeigt 10.000 € |

### 4.3 `03-laufzeit-startkapital.spec.ts` — Laufzeit × Startkapital

Für Sparplan (MONTHLY/MONTHLY) und Festgeld (MONTHLY). 4 Matrixfälle je Typ:

| # | Typ | Startkapital | Laufzeit | Erwartung |
|---|---|---|---|---|
| 1 | Sparplan | 0 | 12 Monate | Genau 12+ Einträge (INTEREST+CONTRIBUTION), Saldo wächst |
| 2 | Sparplan | 5000 | 12 Monate | Erste scheduledBalance > 5000 |
| 3 | Sparplan | 0 | unbegrenzt | Einträge ≥ 24 (horizon today+24M), vergangene initialisiert |
| 4 | Sparplan | 5000 | unbegrenzt | Vergangene Einträge haben paidAt gesetzt, Saldo ≥ initialBalance |
| 5 | Festgeld | 0 | 12 Monate | 12 INTEREST-Einträge (monatlich), keine CONTRIBUTION |
| 6 | Festgeld | 10000 | 12 Monate | Saldo nach 12 Monaten > 10000 |
| 7 | Festgeld | 0 | unbegrenzt | Einträge ≥ 24 |
| 8 | Festgeld | 10000 | unbegrenzt | Vergangene Einträge initialisiert |

Geprüft wird auf der Detailseite: Anzahl sichtbarer Einträge mit Filter „Alle",
scheduledBalance der letzten Zeile, Status vergangener Einträge.

### 4.4 `04-detail-view.spec.ts` — Anzeigefilter

Vorbedingung: Sparplan angelegt mit startDate = vor 6 Monaten,
monatliche Rate, unbegrenzte Laufzeit → mind. 30+ Einträge total.

| # | Filter | Erwartung |
|---|---|---|
| 1 | 1 J. | Zeigt Einträge ≤ today+1 Jahr, vergangene paid bleiben sichtbar |
| 2 | 2 J. | Mehr Einträge als bei 1 J. |
| 3 | 5 J. | Deutlich mehr Einträge |
| 4 | 10 J. | Noch mehr Einträge |
| 5 | Alle | Alle Einträge sichtbar (= max) |
| 6 | Reihenfolge: 1J → Alle → 1J | Filter schaltet korrekt um |
| 7 | Paid-Einträge | Vergangene paid-Einträge erscheinen auch bei engem Filter |

Für jeden Filter: Zeilen in `<tbody>` zählen, Reihenfolge prüfen (älteste oben).

### 4.5 `05-detail-pay.spec.ts` — Buchen & Rückgängig

Vorbedingung: Frischer Sparplan mit startDate = heute, monatlich, kein Startkapital.

| # | Aktion | Erwartung |
|---|---|---|
| 1 | „Bezahlen"-Button auf erster Contribution-Zeile | Zeile zeigt „✓ gebucht", Saldo aktualisiert |
| 2 | „Bezahlt bis"-Datum auf heute+2M eingeben → Buchen | Mehrere Einträge gebucht, Toast zeigt Anzahl |
| 3 | Zinsen werden automatisch mitgebucht | INTEREST-Zeilen vor der CONTRIBUTION zeigen „✓ automatisch" |
| 4 | „rückgängig"-Link klicken | Zeile zeigt wieder „Bezahlen"-Button, Saldo reduziert |
| 5 | Kein Datum eingegeben → Buchen | Toast „Bitte ein Datum eingeben" |
| 6 | Mit verknüpftem Girokonto: Contribution buchen | Girokonto-Saldo sinkt um Sparrate |

### 4.6 `06-edit.spec.ts` — Bearbeiten

| # | Aktion | Erwartung |
|---|---|---|
| 1 | Name ändern + Speichern | Detailseite zeigt neuen Namen |
| 2 | IBAN eingeben + Speichern | IBAN in Detailseite sichtbar |
| 3 | Notizen ändern | Kein Fehler |
| 4 | Zinssatz ändern → Warnung erscheint | Gelbe Hinweistext sichtbar |
| 5 | Zinssatz ändern + Speichern → Neuberechnung | Offene INTEREST-Einträge neu berechnet |
| 6 | Zinssatz unverändert → keine Warnung | Kein Hinweistext |
| 7 | Girokonto verknüpfen (Sparplan) | Kategorie-Dropdown erscheint |
| 8 | Girokonto entfernen | Kategorie-Dropdown verschwindet |
| 9 | Zahlungsplan verlängern (+12 Monate, nur unbegrenzt) | Toast „X neue Einträge generiert" |
| 10 | Verlängerungssektion bei Festgeld mit Laufzeit | Sektion NICHT sichtbar |

---

## 5. Cleanup-Strategie

Jede Spec-Datei legt Testkonten in `beforeAll`/`beforeEach` via API an und
löscht sie in `afterAll`/`afterEach` via `DELETE /api/savings/[id]`.
Damit bleibt die DB sauber auch wenn Tests fehlschlagen.

---

## 6. Nicht im Scope

- Performance-Tests
- Mobile Viewport
- Dark Mode
- Gleichzeitige Zugriffe
