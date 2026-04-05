# Umbuchung (Transfer) — Erweiterte Funktionalitaet

## Ziel

Die Umbuchungsfunktion im Transaktions-Dialog wird erweitert. Bei einer Umbuchung kann pro Seite (Quelle und Ziel) gewaehlt werden, ob der Betrag vom Hauptkonto oder vom Unterkonto gebucht wird. In Abhaengigkeit davon werden Pflichtfelder fuer Gruppe/Kategorie angezeigt.

## Ueberblick

### Ablauf im Dialog

1. Typ "Umbuchung" waehlen
2. **Von Konto** auswaehlen
3. **Quelle**: Hauptkonto oder Unterkonto?
   - Hauptkonto → Gruppe + Kategorie (Pflicht)
   - Unterkonto → Gruppe (Pflicht, = SubAccountGroup)
4. **Auf Konto** auswaehlen
5. **Ziel**: Hauptkonto oder Unterkonto?
   - Hauptkonto → Gruppe + Kategorie (Pflicht)
   - Unterkonto → Gruppe (Pflicht, = SubAccountGroup)
6. Betrag eingeben
7. Speichern → zwei Transaktionen entstehen

### Erlaubte Kombinationen

**Zwischen verschiedenen Konten — alle 4 Kombinationen:**

| Quelle | Ziel | Beispiel |
|--------|------|----------|
| Hauptkonto | Hauptkonto | ING HK → DKB HK |
| Hauptkonto | Unterkonto | ING HK → DKB UK "Sparen" |
| Unterkonto | Hauptkonto | ING UK "Kleidung" → DKB HK |
| Unterkonto | Unterkonto | ING UK "Kleidung" → DKB UK "Urlaub" |

**Innerhalb desselben Kontos — nur UK → UK:**

| Quelle | Ziel | Erlaubt? |
|--------|------|----------|
| Hauptkonto | Unterkonto | NEIN |
| Unterkonto | Hauptkonto | NEIN |
| Hauptkonto | Hauptkonto | NEIN |
| Unterkonto | Unterkonto | JA (z.B. Kleidung → Urlaub) |

Wenn dasselbe Konto als Quelle und Ziel gewaehlt wird, werden die Optionen "Hauptkonto" ausgeblendet — nur "Unterkonto" ist waehlbar.

## Duale Felder (mainAmount / subAmount)

Jede Umbuchung erzeugt **zwei Transaktionen** (verknuepft ueber `transferToId`).

### Quell-Transaktion (Von Konto)

| Quelle | mainAmount | mainType | subAmount | subType |
|--------|-----------|----------|-----------|---------|
| Hauptkonto | -Betrag | EXPENSE | null | null |
| Unterkonto | null | INCOME | -Betrag | EXPENSE |

### Ziel-Transaktion (Auf Konto)

| Ziel | mainAmount | mainType | subAmount | subType |
|------|-----------|----------|-----------|---------|
| Hauptkonto | +Betrag | INCOME | null | null |
| Unterkonto | null | INCOME | +Betrag | INCOME |

### Kategorie-Zuordnung

- **Hauptkonto-Seite**: `categoryId` = die gewaehlte Kategorie aus Gruppe → Kategorie
- **Unterkonto-Seite**: `categoryId` = die verknuepfte Kategorie der SubAccountGroup (via `linkedCategories`)

### SubAccountEntry

- **Unterkonto-Seite**: Ein SubAccountEntry wird erstellt mit `amount = subAmount` und `groupId = gewaehlte SubAccountGroup`
- **Hauptkonto-Seite**: Kein Entry

## UI-Aenderungen

### TransactionFormDialog — TRANSFER-Sektion

Aktuell:
- Von Konto → Auf Konto → optional Sub-Account-Gruppe

Neu:
- Von Konto
- Buchungsart Quelle: [Hauptkonto | Unterkonto] (Radio oder Select)
  - Hauptkonto → Gruppe-Dropdown + Kategorie-Dropdown (Pflicht)
  - Unterkonto → SubAccountGroup-Dropdown (Pflicht)
- Auf Konto
- Buchungsart Ziel: [Hauptkonto | Unterkonto] (Radio oder Select)
  - Hauptkonto → Gruppe-Dropdown + Kategorie-Dropdown (Pflicht)
  - Unterkonto → SubAccountGroup-Dropdown (Pflicht)
- Betrag

Wenn Von Konto == Auf Konto:
- Buchungsart Quelle wird auf "Unterkonto" fixiert (kein Toggle)
- Buchungsart Ziel wird auf "Unterkonto" fixiert (kein Toggle)

### Daten laden

- **CategoryGroups** des Von-Kontos: `GET /api/category-groups?accountId=X` (fuer Hauptkonto-Auswahl)
- **SubAccountGroups** des Von-Kontos: bereits geladen via `GET /api/sub-account-groups`
- Gleiche Queries fuer das Auf-Konto

## API-Aenderungen

### Transaction POST (`/api/transactions`)

Der POST-Handler muss erweitert werden fuer die neuen Transfer-Kombinationen:

**Request-Body (erweitert):**
```typescript
{
  date: string
  description: string
  mainAmount?: number | null    // Quell-mainAmount (wenn HK)
  mainType?: string
  subAmount?: number | null     // Quell-subAmount (wenn UK)
  subType?: string
  accountId: string             // Von Konto
  categoryId?: string           // Kategorie der Quelle
  // Transfer-spezifisch:
  transferTargetAccountId: string  // Auf Konto
  transferTargetType: 'MAIN' | 'SUB'  // Ziel: Hauptkonto oder Unterkonto
  transferTargetCategoryId?: string  // Kategorie des Ziels (wenn HK)
  transferTargetGroupId?: string     // SubAccountGroup des Ziels (wenn UK)
  sourceGroupId?: string             // SubAccountGroup der Quelle (wenn UK)
}
```

**Ablauf im Handler:**

1. Quell-Transaktion erstellen (mainAmount oder subAmount je nach Quelle)
2. Wenn Quelle = Unterkonto: SubAccountEntry erstellen + verknuepfen
3. Ziel-Transaktion erstellen (mainAmount oder subAmount je nach Ziel)
4. Wenn Ziel = Unterkonto: SubAccountEntry erstellen + verknuepfen
5. Beide Transaktionen ueber `transferToId` verknuepfen
6. Balance-Updates:
   - Von Konto: `balanceIncrement(-(mainAmount ?? 0) - (subAmount ?? 0))`
   - Auf Konto: `balanceIncrement((targetMainAmount ?? 0) + (targetSubAmount ?? 0))`

## Betroffene Dateien

### Zu aendernde Dateien
- `src/components/transactions/TransactionFormDialog.tsx` — TRANSFER-Sektion komplett ueberarbeiten
- `src/app/api/transactions/route.ts` — POST-Handler fuer neue Transfer-Logik
- `src/lib/schemas/transactions.ts` — createTransactionSchema erweitern

### Keine Aenderung noetig
- `prisma/schema.prisma` — Datenmodell passt bereits
- `src/app/api/transactions/[id]/route.ts` — PUT/DELETE bleiben gleich
- `src/lib/sub-account-entries/service.ts` — wird nicht direkt genutzt (Transfer-Logik inline im POST-Handler)
