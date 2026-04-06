# Übertrag mit Warnung und Kaskade

## Kontext

Der "Übertrag"-Button im Account-Budget-Tab überträgt den verfügbaren Betrag (available) jeder Kategorie als `rolledOver` in den Folgemonat. Aktuell geschieht dies ohne Warnung und überschreibt bestehende Werte inkl. `budgeted`. Die Erweiterung fügt eine Warnung hinzu, wenn der Folgemonat bereits Einträge hat, und kaskadiert Änderungen in alle weiteren Monate.

## Ablauf

1. User klickt "Übertrag" für Monat M
2. **Vorab-Check** (GET): Hat der Folgemonat M+1 bereits BudgetEntries für die betroffenen Kategorien?
3. **Kein Eintrag vorhanden** → Übertrag wie bisher:
   - `rolledOver` = available aus Monat M
   - `budgeted` = budgeted aus Monat M (Kopie)
   - Keine Kaskade nötig
4. **Einträge vorhanden** → Bestätigungsdialog:
   > "Im Folgemonat existieren bereits Budgetvorgaben. Sollen die Überträge aktualisiert werden? Die monatlichen Budgets bleiben unverändert."
   - **"Abbrechen"** → nichts passiert
   - **"Überträge aktualisieren"** → nur `rolledOver` aktualisieren, `budgeted` unverändert, dann Kaskade

## Kaskade

Nach dem Update von M+1:
1. Prüfe ob M+2 BudgetEntries hat
2. Wenn ja: berechne `available` von M+1 = `rolledOver(M+1) + activity(M+1) - budgeted(M+1)`
3. Setze `rolledOver` in M+2 auf dieses `available`
4. Wiederhole für M+3, M+4, ... bis kein Folgemonat mehr Einträge hat

**Wichtig:**
- Nur `rolledOver` wird kaskadiert, `budgeted` wird nie verändert
- Activity muss für jeden Monat in der Kaskade einzeln berechnet werden
- Die Kaskade läuft auch in zukünftige Monate, solange BudgetEntries existieren

## API-Änderungen

### GET `/api/accounts/[id]/budget/[year]/[month]/rollover`

Neuer Check-Endpoint. Gibt zurück, ob der Folgemonat bereits Einträge hat.

**Response:**
```json
{
  "nextMonth": 5,
  "nextYear": 2026,
  "hasExistingEntries": true,
  "existingCount": 12
}
```

### POST `/api/accounts/[id]/budget/[year]/[month]/rollover`

Erweitert um `mode` im Request-Body:

**Body:**
```json
{ "mode": "create" }   // Default — wie bisher: rolledOver + budgeted setzen
{ "mode": "update" }   // Nur rolledOver setzen + Kaskade in Folgemonate
```

**Verhalten `mode=create`** (Folgemonat hat keine Einträge):
- Upsert: `rolledOver` = available, `budgeted` = budgeted aus aktuellem Monat
- Keine Kaskade

**Verhalten `mode=update`** (Folgemonat hat bereits Einträge):
- Update M+1: nur `rolledOver` setzen
- Kaskade: für jeden weiteren Monat mit BudgetEntries `rolledOver` neuberechnen
- `budgeted` wird nie verändert

**Response:**
```json
{
  "success": true,
  "nextMonth": 5,
  "nextYear": 2026,
  "entries": 12,
  "cascadedMonths": 3
}
```

## UI-Änderungen

### AccountBudgetTab.tsx

1. Button "Übertrag" löst zunächst GET-Check aus
2. Wenn `hasExistingEntries === false` → direkt POST mit `mode=create`
3. Wenn `hasExistingEntries === true` → AlertDialog anzeigen:
   - Titel: "Bestehende Budgetdaten"
   - Text: "Im Folgemonat existieren bereits Budgetvorgaben. Sollen die Überträge aktualisiert werden? Die monatlichen Budgets bleiben unverändert."
   - Buttons: "Abbrechen" / "Überträge aktualisieren"
4. Bei "Überträge aktualisieren" → POST mit `mode=update`
5. Toast anpassen: bei Kaskade "X Kategorien, Y Folgemonate aktualisiert"

## Nicht im Scope

- Änderung am globalen Rollover-Endpoint (`/api/budget/[year]/[month]/rollover`)
- Rückgängig-Funktion
- Vorschau der zu ändernden Werte
