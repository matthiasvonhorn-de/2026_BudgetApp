# Electron Upgrade-Safe App mit persistenter Datenbank

**Datum:** 2026-04-07
**Status:** Approved

## Ziel

Die BudgetApp als macOS `.app` (ZIP) so bauen, dass:
1. Neue Nutzer eine leere Datenbank bekommen (nicht die Entwicklungsdaten)
2. Bestehende Nutzerdaten bei App-Updates erhalten bleiben
3. Schema-Änderungen automatisch migriert werden (mit Backup + Hinweis)
4. Die App ein eigenes Icon hat

## Kontext

Die App soll an Freunde/Familie als ZIP verschickt werden können. Bei jedem Update ersetzt der Nutzer die `.app`-Datei. Die Datenbank liegt im macOS-`userData`-Verzeichnis und überlebt App-Updates. Das Problem: bisher wird `dev.db` (mit Entwicklungsdaten) gebündelt, und es gibt keinen Migrations-Mechanismus für Schema-Änderungen.

## Design

### 1. Build-Prozess — Leere DB generieren

**Neues Skript: `scripts/prepare-electron-db.js`**

- Liest das Schema aus `prisma/dev.db` via `sqlite3 dev.db ".schema"`
- Erstellt eine leere `electron/empty.db` mit allen Tabellen, Indizes, Constraints — ohne Daten
- Setzt `schema_version = 1` in der `AppSetting`-Tabelle (oder die aktuelle Version)
- Läuft automatisch als Teil von `npm run electron:build`

**Warum `dev.db` als Quelle:** Die `dev.db` hat immer das aktuelle Schema, weil der Entwickler sie aktiv nutzt. Der `.schema`-Dump enthält nur DDL (CREATE TABLE, CREATE INDEX), keine Daten.

### 2. Bundling

**`package.json` build config — Änderungen:**

```json
{
  "extraResources": [
    {
      "from": "electron/empty.db",
      "to": "db/budget.db"
    }
  ]
}
```

Ersetzt `prisma/dev.db` → kein Nutzer bekommt Entwicklungsdaten.

### 3. Runtime — Erster Start (keine DB vorhanden)

In `electron/main.js` → `ensureDatabase()`:

1. Prüfe ob `app.getPath('userData')/budget.db` existiert
2. Wenn nein → bundled `empty.db` aus `Resources/db/budget.db` kopieren
3. Nutzer hat eine leere App, kann sofort loslegen

**Keine Änderung zum bisherigen Verhalten**, außer dass die kopierte DB leer ist.

### 4. Runtime — App-Update (Schema-Migration)

**Neues Modul: `electron/migrator.js`**

Wird beim App-Start aufgerufen, BEVOR der Next.js-Server startet.

#### 4.1 Schema-Vergleich

Öffnet zwei Datenbanken via `better-sqlite3` (synchron, im Main-Process):
- **User-DB**: `app.getPath('userData')/budget.db`
- **Bundled-DB**: `Resources/db/budget.db`

Vergleicht:
1. **Tabellen**: `SELECT name, sql FROM sqlite_master WHERE type='table'`
2. **Spalten pro Tabelle**: `PRAGMA table_info(tablename)`
3. **Indizes**: `SELECT name, sql FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'`

#### 4.2 Auto-Migration (additive Änderungen)

Falls Unterschiede erkannt werden:

1. **Splash-Fenster** anzeigen: kleines zentriertes Fenster mit "Datenbank wird aktualisiert..."
2. **Backup** erstellen: `budget.db` → `budget-backup-YYYY-MM-DD-HHmmss.db` (im selben `userData`-Verzeichnis)
3. **Fehlende Tabellen**: `CREATE TABLE`-Statement aus der bundled DB übernehmen (das komplette `sql` aus `sqlite_master`)
4. **Fehlende Spalten**: `ALTER TABLE <table> ADD COLUMN <name> <type> DEFAULT <value>` — Default-Wert aus `PRAGMA table_info`
5. **Fehlende Indizes**: `CREATE INDEX IF NOT EXISTS` — Statement aus bundled DB
6. **Schema-Version** in `AppSetting` aktualisieren
7. Splash-Fenster schließen

#### 4.3 Manuelle Migrations (Escape-Hatch)

Für seltene, nicht-additive Änderungen (Spalte umbenennen, Typ ändern, Daten transformieren):

- Verzeichnis: `electron/migrations/`
- Dateien: `v002_rename_column.sql`, `v003_change_type.sql`, ...
- Versionsnummer wird in `AppSetting` (Key: `schema_version`) gespeichert
- Nach dem Auto-Diff: prüfe ob manuelle Migrations für Versionen > aktuelle Version existieren
- Falls ja: in Reihenfolge ausführen

**Wann nötig:** Nur bei breaking Schema-Änderungen. Für 95% der Entwicklung (neue Tabellen, neue Spalten) reicht der Auto-Diff.

### 5. Migration-Splash

Kleines `BrowserWindow` (400×200, zentriert, kein Rahmen):
- Text: "Datenbank wird aktualisiert..."
- Wird nur angezeigt wenn tatsächlich migriert wird
- Schließt sich automatisch nach Abschluss
- Bei Fehler: `dialog.showErrorBox()` mit Hinweis auf Backup

### 6. Backup-Strategie

- **Pfad**: `app.getPath('userData')/budget-backup-YYYY-MM-DD-HHmmss.db`
- **Wann**: Vor jeder Migration (auto oder manuell)
- **Aufbewahrung**: Backups bleiben liegen (Nutzer kann manuell aufräumen)
- **Namensformat**: Timestamp verhindert Überschreiben bei mehreren Updates am selben Tag

### 7. App-Icon

- Eigenes Icon: `electron/icon.icns` (macOS)
- Einfaches Finanz/Budget-Symbol (Wallet oder Kreisdiagramm-Stil)
- Referenz in `package.json`:

```json
{
  "build": {
    "mac": {
      "icon": "electron/icon.icns"
    }
  }
}
```

### 8. Dependency-Änderungen

- **Neu**: `better-sqlite3` als devDependency
  - Synchrone SQLite-Bibliothek für den Electron-Main-Process
  - Wird von `@electron/rebuild` automatisch für Electron kompiliert
  - Nur im Main-Process genutzt (Migrator), NICHT im Next.js-Server

### 9. Geänderter Build-Flow

```
npm run electron:build
  1. next build                         (wie bisher)
  2. scripts/copy-static.js             (wie bisher)
  3. scripts/prepare-electron-db.js     (NEU: leere DB generieren)
  4. electron-builder --mac zip         (wie bisher, mit empty.db + Icon)
```

`package.json` Script:
```
"electron:build": "next build && node scripts/copy-static.js && node scripts/prepare-electron-db.js && CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder --mac zip"
```

### 10. Geänderte Dateien

| Datei | Änderung |
|---|---|
| `electron/main.js` | Migration vor Server-Start aufrufen |
| `electron/migrator.js` | **NEU** — Schema-Vergleich + Auto-Migration |
| `electron/migrations/` | **NEU** — Verzeichnis für manuelle Migrations |
| `electron/icon.icns` | **NEU** — App-Icon |
| `scripts/prepare-electron-db.js` | **NEU** — Leere DB aus Schema generieren |
| `package.json` | `better-sqlite3` Dependency, Build-Script anpassen, Icon-Pfad, extraResources ändern |

### 11. Einschränkungen

- **Auto-Diff kann nicht**: Spalten umbenennen, Spaltentyp ändern, Spalten löschen, Daten transformieren → manuelle Migration nötig
- **SQLite-Limitierung**: `ALTER TABLE` kann nur Spalten hinzufügen/löschen. Für Typ-Änderungen braucht man Table-Recreation (CREATE new → copy data → DROP old → RENAME new)
- **Kein Code-Signing**: App ist unsigned (`CSC_IDENTITY_AUTO_DISCOVERY=false`), macOS zeigt beim ersten Start eine Warnung ("von einem nicht identifizierten Entwickler")
