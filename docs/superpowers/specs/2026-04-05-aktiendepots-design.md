# Aktiendepots (Stock Portfolios)

## Ziel

Neue Kategorie "Aktiendepots" in der App. Depots koennen angelegt und mit Wertstaenden versehen werden. Der aktuelle Wert eines Depots ist immer der neueste Wertstand. Alle Depotwerte fliessen in das Gesamtvermoegen auf dem Dashboard ein.

## Datenmodell

### Portfolio

```prisma
model Portfolio {
  id        String   @id @default(cuid())
  name      String
  color     String   @default("#6366f1")
  notes     String?
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  values PortfolioValue[]
}
```

- Eigenstaendiges Modell, kein Bezug zu Account, Transaction oder Kategorie
- Kein `currentValue`-Feld — der aktuelle Wert wird aus dem neuesten `PortfolioValue` gelesen

### PortfolioValue

```prisma
model PortfolioValue {
  id          String    @id @default(cuid())
  portfolioId String
  date        DateTime
  value       Float
  notes       String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  portfolio Portfolio @relation(fields: [portfolioId], references: [id], onDelete: Cascade)

  @@unique([portfolioId, date])
  @@index([portfolioId])
}
```

- **Unique Constraint**: Ein Wertstand pro Tag pro Depot
- **Validierung**: `date <= heute` — keine Zukunftswerte (API-seitig)
- **Geldwerte**: Prisma-Typ `Float` (SQLite-Limitation), alle Schreibzugriffe verwenden `roundCents()` aus `@/lib/money`

## Navigation

- Neuer Sidebar-Eintrag: **"Aktiendepots"** mit Icon `TrendingUp` aus lucide-react
- Position: nach "Bankkredite"

## Seiten

### Depotsuebersicht (`/portfolios`)

- Alle Depots als Karten (wie Konten-Seite)
- Pro Karte: Name, aktueller Wert (formatiert mit `useFormatCurrency`), Mini-Sparkline (letzte 30 Werte)
- Gesamtwert aller Depots oben als Summenzeile
- Button "Neues Depot" → oeffnet Anlage-Dialog

### Depot-Detailseite (`/portfolios/[id]`)

- Header: Name, aktueller Wert, Farbe
- Wertverlauf-Grafik (Recharts `LineChart`) mit Zeitfilter: 3M / 6M / 1J / Gesamt
- Tabelle aller Wertstande (Datum, Wert, Notiz) — sortiert nach Datum absteigend
- Inline: Neuen Wertstand erfassen (Datum, Wert, Notiz) — Datum validiert: max. heute
- Bearbeiten/Loeschen von Wertstaenden

### Einstellungen (`/settings/portfolios`)

- Liste aller Depots mit Bearbeiten/Loeschen
- Button "Neues Depot" → gleicher Anlage-Dialog

### Dialog "Depot anlegen/bearbeiten"

- Felder: Name, Farbe, Notizen (optional)
- Kein Initialwert — der erste Wertstand definiert den Startwert
- Gleicher Dialog wird auf der Depotsuebersicht und in den Einstellungen verwendet

## API Routes

| Route | Methode | Beschreibung |
|-------|---------|-------------|
| `/api/portfolios` | GET | Alle Depots mit neuestem Wertstand + Sparkline-Daten (letzte 30 Werte) |
| `/api/portfolios` | POST | Neues Depot anlegen (name, color, notes?) |
| `/api/portfolios/[id]` | GET | Depot-Detail mit allen Wertstaenden |
| `/api/portfolios/[id]` | PUT | Depot bearbeiten (name, color, notes) |
| `/api/portfolios/[id]` | DELETE | Depot loeschen (kaskadiert PortfolioValues) |
| `/api/portfolios/[id]/values` | POST | Neuen Wertstand erfassen (date, value, notes?) |
| `/api/portfolios/[id]/values/[valueId]` | PUT | Wertstand bearbeiten |
| `/api/portfolios/[id]/values/[valueId]` | DELETE | Wertstand loeschen |

### Validierung (API-seitig)

- POST/PUT `/values`: `date` darf nicht in der Zukunft liegen (`date <= new Date()`)
- POST `/values`: Unique-Constraint `(portfolioId, date)` — bei Duplikat Fehler 409
- POST/PUT `/values`: `value` wird mit `roundCents()` gerundet vor dem Schreiben
- POST `/portfolios`: `name` erforderlich, mindestens 1 Zeichen

### GET `/api/portfolios` Response

```typescript
interface PortfolioListItem {
  id: string
  name: string
  color: string
  notes: string | null
  isActive: boolean
  currentValue: number | null  // neuester Wertstand, null wenn keine Werte
  sparklineData: { date: string; value: number }[]  // letzte 30 Werte fuer Mini-Grafik
}
```

### GET `/api/portfolios/[id]` Response

```typescript
interface PortfolioDetail {
  id: string
  name: string
  color: string
  notes: string | null
  isActive: boolean
  values: {
    id: string
    date: string
    value: number
    notes: string | null
  }[]  // alle Wertstaende, sortiert nach Datum absteigend
}
```

## Dashboard Net-Worth-Integration

In `src/app/api/reports/net-worth/route.ts`:

1. Portfoliowerte laden: neuester Wertstand pro aktivem Depot
2. `totalPortfolios = SUM(neuester Wertstand pro Depot)`
3. Zu `totalAssets` addieren
4. Neues Feld in der Response: `totalPortfolios` (fuer separate Anzeige)

Angepasste Berechnung:
```
totalAssets = SUM(Account.currentBalance) + totalPortfolios
netWorth = totalAssets - totalDebts
```

## Keine Transaktionsverknuepfung

- Depots erzeugen keine Transaktionen
- Kein `accountId`, kein `categoryId`
- Komplett isoliert vom Buchungssystem
- Keine Auswirkung auf Budget, Unterkonten oder Kontosalden

## Betroffene Dateien

### Neue Dateien
- `src/app/(app)/portfolios/page.tsx` — Depotsuebersicht
- `src/app/(app)/portfolios/[id]/page.tsx` — Depot-Detailseite
- `src/app/(app)/settings/portfolios/page.tsx` — Einstellungen
- `src/app/api/portfolios/route.ts` — GET/POST
- `src/app/api/portfolios/[id]/route.ts` — GET/PUT/DELETE
- `src/app/api/portfolios/[id]/values/route.ts` — POST
- `src/app/api/portfolios/[id]/values/[valueId]/route.ts` — PUT/DELETE
- `src/components/portfolios/PortfolioDialog.tsx` — Anlage/Bearbeitung-Dialog

### Zu aendernde Dateien
- `prisma/schema.prisma` — Portfolio + PortfolioValue Modelle
- `src/components/layout/Sidebar.tsx` — Neuer Navigationseintrag
- `src/app/api/reports/net-worth/route.ts` — Portfoliowerte in totalAssets
- `src/types/api.ts` — Portfolio-Interfaces
- `src/app/(app)/settings/page.tsx` — Link zu Portfolio-Einstellungen
- `src/app/(app)/dashboard/page.tsx` — Portfoliowerte im Dashboard anzeigen (optional)
