# Design: Konten-Reihenfolge anpassen

**Datum:** 2026-03-27
**Status:** Approved

## Zusammenfassung

Nutzer sollen die Reihenfolge der Konten manuell festlegen können. Diese Reihenfolge wird in der Datenbank gespeichert und in allen Ansichten, in denen Konten aufgelistet oder ausgewählt werden können, automatisch berücksichtigt.

---

## 1. Datenmodell & API

### Schema-Änderung

`sortOrder Int @default(0)` wird dem `Account`-Modell hinzugefügt.

Migration (manuelles SQL, da kein `prisma migrate dev`):
```sql
ALTER TABLE Account ADD COLUMN sortOrder INTEGER NOT NULL DEFAULT 0;
UPDATE Account SET sortOrder = rowid;
```

Anschließend: `npx prisma generate`

### API-Änderungen

**`GET /api/accounts`** — Sortierung ändert sich:
```ts
orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
```

**Neuer Endpoint `PATCH /api/accounts/reorder`:**
- Request-Body: `{ ids: string[] }` — vollständige, geordnete Liste aller Konto-IDs
- Validierung: alle IDs müssen existierende Konten sein
- Schreibt `sortOrder = index` für jeden Eintrag via Prisma-Transaktion
- Response: `200 OK` mit leerem Body

Alle anderen Account-Endpoints bleiben unverändert.

---

## 2. UI-Komponenten

### Geteilter Hook: `useAccountReorder`

Kapselt die gesamte Sortier-Logik und wird von beiden Seiten verwendet:

```ts
// src/hooks/useAccountReorder.ts
const { isReordering, localAccounts, startReorder, cancelReorder, saveReorder, handleDragEnd } = useAccountReorder(accounts)
```

- `isReordering`: boolean — ob Sortier-Modus aktiv ist
- `localAccounts`: die aktuell lokal geordnete Liste (für optimistic UI)
- `startReorder()`: aktiviert Modus, kopiert aktuelle Reihenfolge lokal
- `cancelReorder()`: deaktiviert Modus, verwirft lokale Änderungen
- `saveReorder()`: ruft `PATCH /api/accounts/reorder` auf, invalidiert `['accounts']`-Query, deaktiviert Modus. Bei Fehler: lokale Änderungen zurücksetzen.
- `handleDragEnd(event)`: `@dnd-kit`-Handler, aktualisiert `localAccounts`

### Konten-Übersichtsseite (`/accounts/page.tsx`)

- Button "Reihenfolge bearbeiten" erscheint oben rechts in der Titelzeile
- Im Sortier-Modus:
  - Button wird durch "Speichern" und "Abbrechen" ersetzt
  - Karten werden mit `@dnd-kit/sortable` (`SortableContext`, `useSortable`) umhüllt
  - Drag-Handle-Icon (⠿) erscheint oben links auf jeder Karte
  - Grid-Layout bleibt erhalten (horizontales Sortieren)
- Neue Wrapper-Komponente `SortableAccountCard` wrапpt `AccountCard` und fügt Drag-Handle + `useSortable`-Props hinzu

### Einstellungsseite (`/settings/general/page.tsx`)

- Identische Logik: "Reihenfolge bearbeiten"-Button → Sortier-Modus → Speichern/Abbrechen
- Liste ist vertikal — `@dnd-kit/sortable` mit vertikalem Layout
- Drag-Handle links neben dem Kontonamen

---

## 3. Konsistenz in der restlichen App

Da alle Stellen `fetch('/api/accounts')` nutzen und der Endpoint die Sortierung selbst vorgibt, sind **keine Code-Änderungen** an den folgenden Stellen nötig:

| Stelle | Verwendung |
|--------|-----------|
| `src/app/(app)/dashboard/page.tsx` | Konten-Übersicht |
| `src/components/transactions/TransactionFormDialog.tsx` | Konto-Dropdown |
| `src/components/import/ImportStep1Upload.tsx` | Konto-Auswahl |
| `src/app/(app)/settings/categories/page.tsx` | Konto-Filter |
| `src/app/(app)/settings/loans/page.tsx` | Konto-Dropdown |
| `src/components/accounts/AccountBudgetTab.tsx` | Konto-Liste |

Nach erfolgreichem `PATCH /api/accounts/reorder` wird `queryClient.invalidateQueries({ queryKey: ['accounts'] })` aufgerufen — alle offenen Abfragen laden automatisch neu.

---

## Dateien, die erstellt oder geändert werden

| Datei | Änderung |
|-------|---------|
| `prisma/schema.prisma` | `sortOrder` zu `Account` hinzufügen |
| `prisma/dev.db` | Migration via manuelles SQL |
| `src/app/api/accounts/route.ts` | `orderBy` anpassen |
| `src/app/api/accounts/reorder/route.ts` | Neuer PATCH-Endpoint |
| `src/hooks/useAccountReorder.ts` | Neuer shared Hook |
| `src/components/accounts/SortableAccountCard.tsx` | Neue Wrapper-Komponente |
| `src/app/(app)/accounts/page.tsx` | Sortier-Modus integrieren |
| `src/app/(app)/settings/general/page.tsx` | Sortier-Modus integrieren |
