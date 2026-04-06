# Sachwerte (Tangible Assets) — Design Spec

**Datum:** 2026-04-06
**Status:** Approved
**Ansatz:** Portfolio-Pattern (eigenständige Modelle, keine Verbindung zu Accounts/Transactions)

---

## Übersicht

Sachwerte sind physische oder immaterielle Vermögenswerte wie Immobilien, Fahrzeuge, Kunstwerke oder Rechte. Sie werden unabhängig vom Konto-/Transaktionssystem erfasst und verfolgt — analog zum bestehenden Portfolio-System für Aktiendepots.

**Kernfeatures:**
- Konfigurierbare Sachwert-Typen (in Einstellungen)
- Eigentumsanteil (1–100%), automatische anteilige Wertberechnung
- Kaufdatum + Kaufpreis für Gewinn/Verlust-Berechnung
- Wert-Zeitreihe (ein Wert pro Tag pro Asset)
- Übersichtsseite mit Gesamtwert, Verlauf und Kacheln
- Dashboard-Integration ins Gesamtvermögen

---

## 1. Datenmodell

### AssetType

Konfigurierbar in den Einstellungen. Wird beim Anlegen eines Sachwerts als Typ ausgewählt.

```prisma
model AssetType {
  id        String   @id @default(cuid())
  name      String
  icon      String   @default("Package")
  color     String   @default("#6366f1")
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  assets Asset[]
}
```

### Asset

Ein einzelner Sachwert mit Eigentumsanteil und Kaufinformationen.

```prisma
model Asset {
  id               String   @id @default(cuid())
  name             String
  assetTypeId      String
  color            String   @default("#6366f1")
  ownershipPercent Float    @default(100)
  purchaseDate     DateTime
  purchasePrice    Float
  notes            String?
  isActive         Boolean  @default(true)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  assetType AssetType     @relation(fields: [assetTypeId], references: [id])
  values    AssetValue[]

  @@index([assetTypeId])
}
```

### AssetValue

Wert-Zeitreihe — ein Eintrag pro Tag pro Asset. Speichert den **Gesamtwert** (vor Anteilsberechnung).

```prisma
model AssetValue {
  id        String   @id @default(cuid())
  assetId   String
  date      DateTime
  value     Float
  notes     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  asset Asset @relation(fields: [assetId], references: [id], onDelete: Cascade)

  @@unique([assetId, date])
  @@index([assetId])
}
```

### Wertberechnung

- **Angezeigter Wert:** `value × (ownershipPercent / 100)`
- **Gewinn/Verlust:** `(latestValue - purchasePrice) × (ownershipPercent / 100)`
- **Gewinn/Verlust %:** `((latestValue - purchasePrice) / purchasePrice) × 100`
- **Aktueller Wert:** Immer der neueste `AssetValue` (kein denormalisiertes Feld)

---

## 2. API-Routen

### AssetTypes (Einstellungen)

| Route | Method | Body/Params | Response | Beschreibung |
|-------|--------|-------------|----------|-------------|
| `/api/asset-types` | GET | — | `AssetType[]` | Alle Typen, sortiert nach `sortOrder` |
| `/api/asset-types` | POST | `{ name, icon, color }` | `AssetType` | Neuen Typ anlegen, `sortOrder` = max+1 |
| `/api/asset-types/[id]` | PUT | `{ name?, icon?, color?, sortOrder? }` | `AssetType` | Typ bearbeiten |
| `/api/asset-types/[id]` | DELETE | — | `204` | Löschen, nur wenn `assets.length === 0` |

### Assets (Sachwerte)

| Route | Method | Body/Params | Response | Beschreibung |
|-------|--------|-------------|----------|-------------|
| `/api/assets` | GET | — | `Asset[]` (mit assetType, latestValue, sparkline) | Alle aktiven Assets |
| `/api/assets` | POST | `{ name, assetTypeId, color, ownershipPercent, purchaseDate, purchasePrice, notes? }` | `Asset` | Neuen Sachwert anlegen |
| `/api/assets/[id]` | GET | — | `Asset` (mit assetType, alle values) | Asset-Detail |
| `/api/assets/[id]` | PUT | `{ name?, assetTypeId?, color?, ownershipPercent?, purchaseDate?, purchasePrice?, notes?, isActive? }` | `Asset` | Asset bearbeiten |
| `/api/assets/[id]` | DELETE | — | `204` | Asset löschen (cascade AssetValues) |
| `/api/assets/[id]/values` | POST | `{ date, value, notes? }` | `AssetValue` | Wert-Eintrag hinzufügen |
| `/api/assets/[id]/values/[valueId]` | PUT | `{ date?, value?, notes? }` | `AssetValue` | Wert bearbeiten |
| `/api/assets/[id]/values/[valueId]` | DELETE | — | `204` | Wert löschen |

**Validierungsregeln:**
- `date <= heute` (keine zukünftigen Werte)
- `value` wird mit `roundCents()` gerundet
- `ownershipPercent` muss zwischen 1 und 100 liegen
- `name` mindestens 1 Zeichen
- `purchasePrice > 0`
- Unique constraint `(assetId, date)` — ein Wert pro Tag

### Dashboard-Erweiterung

| Route | Änderung |
|-------|---------|
| `/api/reports/net-worth` | Neues Feld `totalRealAssets`: Summe der anteiligen aktuellen Werte aller aktiven Assets. `netWorth = totalAssets + totalPortfolios + totalRealAssets - totalDebts` |

---

## 3. UI

### 3.1 Sidebar-Navigation

Position nach "Aktiendepots", vor "Transaktionen":

```
Dashboard
Konten
Bankkredite
Aktiendepots
Sachwerte        ← NEU (Icon: Landmark)
Transaktionen
Berichte
Import
Einstellungen
```

### 3.2 Übersichtsseite `/assets`

**Header:** Titel "Sachwerte" + Button "Neuer Sachwert"

**Summen-Karte:** Gesamtwert aller Sachwerte (anteilig berechnet) + Gesamtgewinn/-verlust seit Kauf (absolut + prozentual, grün/rot eingefärbt)

**Gesamtverlauf-Chart:** Aggregierter Wertverlauf über Zeit (Recharts LineChart). Zeitfilter: 3M, 6M, 1J, Gesamt. Zeigt die Summe aller anteiligen Werte pro Datum.

**Kachel-Grid** (1 Spalte mobil, 2 Spalten Desktop): Pro Asset:
- Icon (vom AssetType) + Farbe als Indikator + Name
- Aktueller anteiliger Wert (groß)
- Eigentumsanteil falls < 100% (z.B. "50% Anteil")
- Gewinn/Verlust seit Kauf (absolut + prozentual, grün/rot)
- Mini-Sparkline (letzte 30 Werte)
- Klick navigiert zur Detailseite

**Empty State:** Icon, Text "Noch keine Sachwerte erfasst", CTA-Button

### 3.3 Detailseite `/assets/[id]`

**Header:** Zurück-Button, AssetType-Icon + Name, Bearbeiten-Button (öffnet AssetDialog)

**Wert-Karte:** Aktueller anteiliger Wert (groß), Kaufpreis (anteilig), Gewinn/Verlust (absolut + prozentual)

**Info-Zeile:** Typ-Badge, Kaufdatum, Eigentumsanteil (falls < 100%)

**Verlauf-Chart:** Recharts LineChart mit Zeitfiltern (3M, 6M, 1J, Gesamt)

**Wert-Tabelle:**
- Spalten: Datum, Gesamtwert, Anteiliger Wert, Notiz, Aktionen (Bearbeiten/Löschen)
- Sortiert nach Datum (neueste zuerst)
- Inline-Zeile oben zum Hinzufügen neuer Werte (Datum, Wert, Notiz, Speichern-Button)
- Inline-Bearbeitung wie bei Portfolios
- Datum-Input: max = heute

### 3.4 Einstellungen — Neuer Abschnitt "Sachwert-Typen"

**Neue Karte auf der Settings-Hub-Seite:**
- Icon: `Landmark`
- Titel: "Sachwert-Typen"
- Beschreibung: "Typen für Sachwerte verwalten"
- Link zu `/settings/asset-types`

**Seite `/settings/asset-types`:**
- Tabelle/Liste der vorhandenen Typen: Icon, Name, Farbe, Anzahl zugeordneter Assets
- Button "Neuer Typ" → öffnet AssetTypeDialog
- Pro Zeile: Bearbeiten- und Löschen-Buttons
- Löschen nur möglich wenn keine Assets zugeordnet (sonst Fehlermeldung)

### 3.5 Dashboard-Erweiterung

Gesamtvermögen-Karte — neuer Posten "Sachwerte" in der Aufschlüsselung:
```
Konten 45.000 € · Depots 12.000 € · Sachwerte 150.000 € · Schulden −80.000 €
```

Wird nur angezeigt wenn `totalRealAssets > 0`.

---

## 4. Komponenten

| Komponente | Pfad | Beschreibung |
|-----------|------|-------------|
| AssetDialog | `src/components/assets/AssetDialog.tsx` | Modal zum Erstellen/Bearbeiten eines Sachwerts. Felder: Name, Typ (AppSelect mit AssetTypes), Farbe, Kaufdatum, Kaufpreis, Eigentumsanteil (Slider oder Eingabe), Notizen |
| AssetTypeDialog | `src/components/settings/AssetTypeDialog.tsx` | Modal zum Erstellen/Bearbeiten eines Typs. Felder: Name, Icon (Auswahl-Grid), Farbe |

### Icon-Auswahl für AssetTypes

Kuratierte Liste von Lucide-Icons:

| Icon | Name | Typischer Einsatz |
|------|------|-------------------|
| Home | Home | Immobilien |
| Car | Car | Fahrzeuge |
| Palette | Palette | Kunst |
| FileText | FileText | Rechte, Dokumente |
| Gem | Gem | Schmuck, Edelsteine |
| Watch | Watch | Uhren, Sammlerstücke |
| Landmark | Landmark | Grundstücke |
| Sailboat | Sailboat | Boote |
| TreePine | TreePine | Land, Wald |
| Building2 | Building2 | Gewerbeimmobilien |
| Coins | Coins | Münzen, Edelmetalle |
| Package | Package | Sonstiges (Default) |

---

## 5. Nicht im Scope

- Bilder/Fotos für Sachwerte
- Abschreibungs-Berechnung
- Verknüpfung mit Konten oder Transaktionen (z.B. Mieteinnahmen einer Immobilie)
- Versicherungs-Tracking
- Dokument-Anhänge
