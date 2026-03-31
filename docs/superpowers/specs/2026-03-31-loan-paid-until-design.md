# Loan „Bezahlt bis" — Design Spec

**Datum:** 2026-03-31
**Status:** Approved

---

## Problemstellung

Beim Anlegen eines Kredits, der schon Jahre läuft, sind alle monatlichen Raten zunächst als offen markiert. Der Nutzer muss sie einzeln anklicken, um sie als bezahlt zu markieren — was bei Jahren von Raten unpraktikabel ist. Zudem löst jedes Markieren eine Buchung auf dem verknüpften Konto aus, was für historische Zahlungen nicht erwünscht ist.

---

## Lösung

Ein optionales Feld **„Bezahlt bis"** (Datum) im Kredit-Formular (Erstanlage und Bearbeitung). Alle Perioden mit `dueDate ≤ paidUntil` werden beim Speichern stumm als bezahlt markiert — kein Buchungseintrag, keine Kontostand-Änderung.

---

## Datenmodel

Kein Schema-Change erforderlich. Die bestehenden Felder reichen aus:

- `LoanPayment.paidAt` — gesetzt = bezahlt
- `LoanPayment.transactionId` — `null` = stumm markiert (kein Buchungseintrag)

**Unterscheidung:**
| Zustand | paidAt | transactionId |
|---------|--------|---------------|
| Offen | null | null |
| Stumm bezahlt (rückwirkend) | gesetzt | null |
| Normal bezahlt (gebucht) | gesetzt | gesetzt |

---

## API-Änderungen

### POST `/api/loans`

Neuer optionaler Parameter im Request Body:

```ts
paidUntil?: string  // ISO-Datum, z.B. "2026-01-31"
```

**Verhalten nach Tilgungsplan-Generierung:**
- Alle Perioden mit `dueDate ≤ new Date(paidUntil)` erhalten `paidAt = new Date()`
- Kein Transaction-Objekt wird erstellt
- Kein Account-Balance-Update
- `transactionId` bleibt `null`

### PUT `/api/loans/[id]`

Neuer optionaler Parameter im Request Body:

```ts
paidUntil?: string | null  // ISO-Datum oder null (= alle stumm-bezahlten öffnen)
```

**Verhalten:**
- Datum nach **vorne** verschoben (oder neu gesetzt): Perioden mit `dueDate ≤ paidUntil` und `transactionId = null` → `paidAt = new Date()`
- Datum nach **hinten** verschoben oder auf `null` gesetzt: Perioden mit `dueDate > paidUntil` und `transactionId = null` → `paidAt = null`
- Perioden mit `transactionId != null` werden **nie** verändert (wurden über normalen Flow gebucht)

**Bestimmung des aktuellen `paidUntil`-Werts für den Edit-Dialog:**
- Späteste Periode mit `paidAt != null` und `transactionId = null` → deren `dueDate` ist der vorausgefüllte Wert

---

## UI-Änderungen

### LoanDialog (`src/app/(app)/settings/loans/page.tsx`)

**Neues Formularfeld:**
- Label: „Bezahlt bis"
- Typ: `date` input, optional
- Position: direkt nach dem Feld „Erste Zahlung am" (startDate)
- Hinweistext: *„Alle Raten bis zu diesem Datum werden ohne Buchung als bezahlt markiert."*
- Validierung: `paidUntil` darf nicht vor `startDate` liegen (clientseitig)

**Bearbeitungs-Modus:**
- Vorausgefüllt mit `dueDate` der spätesten stumm-bezahlten Periode (falls vorhanden)
- Berechnung clientseitig aus dem bereits geladenen `payments`-Array: `max(dueDate where paidAt != null && transactionId == null)`
- Kein neues Feld im API-Response nötig

### Kredit-Detailseite

Keine Änderungen. Stumm-bezahlte Raten erscheinen wie normal bezahlte, aber ohne das „gebucht"-Badge (da `transactionId = null`).

---

## Edge Cases

- **Keine `paidUntil`-Angabe:** Verhalten unverändert, alle Perioden offen.
- **`paidUntil` liegt nach dem letzten Tilgungsplan-Datum:** Alle Perioden werden stumm markiert.
- **Kredit ohne verknüpftes Konto:** Funktioniert identisch — stummes Markieren ist unabhängig vom Account-Link.
- **Mischzustand:** Einige Perioden stumm, spätere normal gebucht (z.B. Nutzer hat rückwirkend importiert und dann normal weitergemacht) — beide Modi koexistieren problemlos, da die Logik ausschließlich auf `transactionId` prüft.

---

## Nicht im Scope

- Kein UI-Indikator auf der Detailseite, der stumm-bezahlte von normal-bezahlten Perioden unterscheidet (YAGNI).
- Keine Bulk-Rückbuchungs-Funktion für stumm-bezahlte Perioden.
