import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, ShadingType, convertInchesToTwip,
} from 'docx'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', 'SPEC.docx')

// ── Farben ────────────────────────────────────────────────────────────────────
const C = {
  primary:   '2563EB', // Blau
  heading1:  '1E3A5F', // Dunkelblau
  heading2:  '1D4ED8',
  heading3:  '2563EB',
  tableHead: 'DBEAFE', // Hellblau
  tableBand: 'F0F7FF',
  text:      '1E293B',
  muted:     '64748B',
  green:     '15803D',
  border:    'BFDBFE',
  white:     'FFFFFF',
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function h1(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 120 },
    run: { color: C.heading1, bold: true, size: 32 },
    border: { bottom: { color: C.primary, size: 8, style: BorderStyle.SINGLE } },
  })
}

function h2(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 80 },
    run: { color: C.heading2, bold: true, size: 26 },
  })
}

function h3(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 60 },
    run: { color: C.heading3, bold: true, size: 22 },
  })
}

function body(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    children: [new TextRun({ text, color: C.text, size: 20, ...opts })],
  })
}

function bold(text) {
  return body(text, { bold: true })
}

function muted(text) {
  return new Paragraph({
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, color: C.muted, size: 18, italics: true })],
  })
}

function bullet(text, level = 0) {
  return new Paragraph({
    spacing: { before: 40, after: 40 },
    indent: { left: convertInchesToTwip(0.25 + level * 0.25) },
    children: [
      new TextRun({ text: '• ', color: C.primary, bold: true, size: 20 }),
      new TextRun({ text, color: C.text, size: 20 }),
    ],
  })
}

function code(text) {
  return new Paragraph({
    spacing: { before: 40, after: 40 },
    indent: { left: convertInchesToTwip(0.3) },
    shading: { type: ShadingType.SOLID, color: 'F1F5F9' },
    children: [new TextRun({ text, font: 'Courier New', size: 18, color: '334155' })],
  })
}

function spacer(lines = 1) {
  return Array.from({ length: lines }, () => new Paragraph({ spacing: { before: 60, after: 60 }, children: [] }))
}

function divider() {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    border: { bottom: { color: C.border, size: 4, style: BorderStyle.SINGLE } },
    children: [],
  })
}

function statusBadge(text, color) {
  return new TextRun({ text: ` ${text} `, color, bold: true, size: 18 })
}

// ── Tabellen-Hilfsfunktionen ──────────────────────────────────────────────────

function cell(text, opts = {}) {
  const { bold: isBold = false, bg, shade = false, width, color = C.text } = opts
  return new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    shading: bg ? { type: ShadingType.SOLID, color: bg } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({
      children: [new TextRun({ text, bold: isBold, color, size: 18 })],
    })],
  })
}

function headerRow(cols, widths) {
  return new TableRow({
    tableHeader: true,
    children: cols.map((c, i) =>
      cell(c, { bold: true, bg: C.tableHead, width: widths?.[i] })
    ),
  })
}

function dataRow(cols, widths, even = true) {
  return new TableRow({
    children: cols.map((c, i) =>
      cell(c, { bg: even ? C.white : C.tableBand, width: widths?.[i] })
    ),
  })
}

function makeTable(headers, rows, widths) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top:           { style: BorderStyle.SINGLE, size: 4, color: C.border },
      bottom:        { style: BorderStyle.SINGLE, size: 4, color: C.border },
      left:          { style: BorderStyle.SINGLE, size: 4, color: C.border },
      right:         { style: BorderStyle.SINGLE, size: 4, color: C.border },
      insideH:       { style: BorderStyle.SINGLE, size: 2, color: C.border },
      insideV:       { style: BorderStyle.SINGLE, size: 2, color: C.border },
    },
    rows: [
      headerRow(headers, widths),
      ...rows.map((r, i) => dataRow(r, widths, i % 2 === 0)),
    ],
  })
}

// ── Info-Box ──────────────────────────────────────────────────────────────────

function infoBox(title, lines) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 6, color: C.primary },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: C.border },
      left:   { style: BorderStyle.SINGLE, size: 6, color: C.primary },
      right:  { style: BorderStyle.SINGLE, size: 4, color: C.border },
    },
    rows: [
      new TableRow({ children: [
        new TableCell({
          shading: { type: ShadingType.SOLID, color: 'EFF6FF' },
          margins: { top: 120, bottom: 120, left: 200, right: 200 },
          children: [
            new Paragraph({ children: [new TextRun({ text: title, bold: true, color: C.primary, size: 20 })] }),
            ...lines.map(l => new Paragraph({ spacing: { before: 40 }, children: [new TextRun({ text: l, color: C.text, size: 18 })] })),
          ],
        }),
      ]}),
    ],
  })
}

// ── Titelseite ────────────────────────────────────────────────────────────────

function buildTitlePage() {
  return [
    new Paragraph({ spacing: { before: 1200 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 120 },
      children: [new TextRun({ text: 'BudgetApp', bold: true, size: 72, color: C.heading1 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 240 },
      children: [new TextRun({ text: 'Spezifikation', size: 40, color: C.primary })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      shading: { type: ShadingType.SOLID, color: C.primary },
      spacing: { before: 0, after: 240 },
      children: [new TextRun({ text: '  Spec Driven Development  ', color: C.white, bold: true, size: 22 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 240 },
      children: [new TextRun({ text: `Stand: ${new Date().toLocaleDateString('de-CH', { day: '2-digit', month: 'long', year: 'numeric' })}`, color: C.muted, size: 20 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Persönliche Finanz-App · Lokal · Desktop Browser', color: C.muted, size: 18, italics: true })],
    }),
    new Paragraph({ pageBreakBefore: true }),
  ]
}

// ── Dokument aufbauen ─────────────────────────────────────────────────────────

const doc = new Document({
  styles: {
    default: {
      document: { run: { font: 'Calibri', size: 20, color: C.text } },
    },
  },
  sections: [{
    properties: {
      page: {
        margin: {
          top: convertInchesToTwip(1.0),
          bottom: convertInchesToTwip(1.0),
          left: convertInchesToTwip(1.2),
          right: convertInchesToTwip(1.2),
        },
      },
    },
    children: [

      // ── Titelseite ─────────────────────────────────────────────────────────
      ...buildTitlePage(),

      // ── 1. Arbeitsweise ───────────────────────────────────────────────────
      h1('1. Arbeitsweise — Spec Driven Development'),
      infoBox('Wie wir zusammenarbeiten', [
        'Vor jeder Änderung an der Anwendung wird dieses Dokument zuerst aktualisiert.',
        'Erst nach Freigabe durch den Auftraggeber wird implementiert.',
        'Bugfixes ohne Funktionsänderung sind ohne Spec-Update erlaubt.',
      ]),
      ...spacer(),
      h2('Ablauf'),
      bullet('Feature-Idee → Backlog-Eintrag mit Akzeptanzkriterien in diesem Dokument erstellen'),
      bullet('Freigabe → Auftraggeber bestätigt die Spezifikation'),
      bullet('Implementierung → Claude implementiert gemäß Spec'),
      bullet('Abnahme → Auftraggeber prüft gegen Akzeptanzkriterien'),
      ...spacer(),

      // ── 2. Projektüberblick ───────────────────────────────────────────────
      divider(),
      h1('2. Projektüberblick'),
      makeTable(
        ['Eigenschaft', 'Wert'],
        [
          ['Typ', 'Persönliche Budget-Web-App, läuft lokal im Desktop-Browser'],
          ['Stack', 'Next.js 14 · TypeScript · Tailwind · shadcn/base-ui · Prisma v7 + SQLite'],
          ['State', 'TanStack Query · Zustand (persistiert)'],
          ['Charts', 'Recharts'],
          ['CSV-Parser', 'Papa Parse'],
          ['Datenbankdatei', 'prisma/dev.db (SQLite, lokal)'],
        ],
        [30, 70]
      ),
      ...spacer(),
      h2('Kernkonzepte'),
      bold('Physische Konten'),
      body('Abbild echter Bankkonten mit IBAN, Bank, Typ, Farbe und Saldo. Typen: Girokonto, Sparkonto, Kreditkarte, Bargeld, Depot.'),
      bold('Kategorien & Gruppen (pro Konto)'),
      body('Kategorien sind immer Teil einer Gruppe. Jedes Konto hat seine eigene Kategorienliste. Typen: Einnahme, Ausgabe, Transfer.'),
      bold('Envelope Budgeting'),
      body('Jede Kategorie erhält pro Monat einen Planwert. Verfügbar = Rollover + Aktivität − Plan. Beim Übertrag auf den nächsten Monat wird sowohl der Planwert als auch ein nicht ausgeschöpftes Budget in den Folgemonat übertragen.'),
      bold('Unterkonten (Envelopes)'),
      body('Virtuelle Konten unter einem physischen Konto. Kategorien können mit Unterkonto-Gruppen verknüpft sein (Buchung oder Transfer).'),
      bold('Kredite'),
      body('Annuitätendarlehen und Ratenkredit mit generiertem Tilgungsplan, Sondertilgungen und Transaktionsverknüpfung.'),
      ...spacer(),

      // ── 3. Navigation ─────────────────────────────────────────────────────
      divider(),
      h1('3. Navigationsstruktur'),
      makeTable(
        ['Route', 'Seite / Funktion'],
        [
          ['/dashboard', 'Monatsübersicht · KPI-Kacheln · Charts · Letzte Transaktionen'],
          ['/accounts', 'Alle Konten als Kacheln'],
          ['/accounts/[id]', 'Kontodetail — 3 Tabs: Transaktionen · Unterkonten · Budget'],
          ['/budget', 'Globale Budget-Tabelle aller Konten'],
          ['/transactions', 'Transaktionsliste mit Suche'],
          ['/import', 'CSV-Import Assistent (4 Schritte)'],
          ['/reports', 'Berichte: Monatsübersicht · Kategorienanalyse · Budget vs. Ist'],
          ['/loans', 'Kreditübersicht'],
          ['/loans/[id]', 'Tilgungsplan · Ratenverwaltung'],
          ['/settings/general', 'Konten verwalten · Währung & Sprache'],
          ['/settings/categories', 'Kategorien & Gruppen (pro Konto)'],
          ['/settings/rules', 'Kategorisierungsregeln für CSV-Import'],
          ['/settings/loans', 'Kredite anlegen & bearbeiten'],
        ],
        [30, 70]
      ),
      ...spacer(),

      // ── 4. Datenmodell ────────────────────────────────────────────────────
      divider(),
      h1('4. Datenmodell'),

      h2('Account — Physisches Konto'),
      makeTable(
        ['Feld', 'Typ', 'Beschreibung'],
        [
          ['id', 'String (CUID)', 'Primärschlüssel'],
          ['name', 'String', 'Anzeigename'],
          ['bank', 'String?', 'Bankname (optional)'],
          ['iban', 'String?', 'IBAN (optional)'],
          ['type', 'Enum', 'CHECKING · SAVINGS · CREDIT_CARD · CASH · INVESTMENT'],
          ['color', 'String', 'Hex-Farbe für UI'],
          ['currentBalance', 'Float', 'Aktueller Kontostand'],
          ['isActive', 'Boolean', 'Soft-Delete (false = gelöscht)'],
        ],
        [22, 20, 58]
      ),
      ...spacer(),

      h2('CategoryGroup — Kategoriegruppe'),
      makeTable(
        ['Feld', 'Typ', 'Beschreibung'],
        [
          ['id', 'String', 'Primärschlüssel'],
          ['name', 'String', 'Gruppenname'],
          ['accountId', 'String', 'Konto-Zugehörigkeit (pro-Konto-Konfiguration)'],
          ['sortOrder', 'Int', 'Anzeigereihenfolge'],
        ],
        [22, 20, 58]
      ),
      ...spacer(),

      h2('Category — Kategorie'),
      makeTable(
        ['Feld', 'Typ', 'Beschreibung'],
        [
          ['id', 'String', 'Primärschlüssel'],
          ['name', 'String', 'Kategoriename'],
          ['color', 'String', 'Hex-Farbe'],
          ['type', 'Enum', 'INCOME · EXPENSE · TRANSFER'],
          ['groupId', 'String', 'Zugehörige Gruppe'],
          ['sortOrder', 'Int', 'Anzeigereihenfolge'],
          ['subAccountGroupId', 'String?', 'Verknüpftes Unterkonto (optional)'],
          ['subAccountLinkType', 'Enum', 'BOOKING · TRANSFER'],
        ],
        [22, 20, 58]
      ),
      ...spacer(),

      h2('Transaction — Transaktion'),
      makeTable(
        ['Feld', 'Typ', 'Beschreibung'],
        [
          ['id', 'String', 'Primärschlüssel'],
          ['date', 'DateTime', 'Buchungsdatum'],
          ['amount', 'Float', 'Betrag — negativ = Ausgabe, positiv = Einnahme'],
          ['description', 'String', 'Buchungstext'],
          ['payee', 'String?', 'Auftraggeber / Empfänger'],
          ['notes', 'String?', 'Interne Notizen'],
          ['type', 'Enum', 'INCOME · EXPENSE · TRANSFER'],
          ['status', 'Enum', 'PENDING · CLEARED · RECONCILED'],
          ['accountId', 'String', 'Zugehöriges Konto'],
          ['categoryId', 'String?', 'Kategorie (optional)'],
          ['importHash', 'String?', 'SHA-256 zur Duplikaterkennung beim Import'],
          ['transferToId', 'String?', 'Gegenbuchung bei Transfers'],
        ],
        [22, 20, 58]
      ),
      ...spacer(),

      h2('BudgetEntry — Budget-Eintrag'),
      makeTable(
        ['Feld', 'Typ', 'Beschreibung'],
        [
          ['id', 'String', 'Primärschlüssel'],
          ['year', 'Int', 'Budgetjahr'],
          ['month', 'Int', 'Budgetmonat (1–12)'],
          ['categoryId', 'String', 'Zugehörige Kategorie'],
          ['budgeted', 'Float', 'Planwert (negativ bei Ausgaben)'],
          ['rolledOver', 'Float', 'Übertrag aus Vormonat'],
        ],
        [22, 20, 58]
      ),
      ...spacer(),

      h2('Loan — Kredit'),
      makeTable(
        ['Feld', 'Typ', 'Beschreibung'],
        [
          ['id', 'String', 'Primärschlüssel'],
          ['name', 'String', 'Kreditname'],
          ['loanType', 'Enum', 'ANNUITAETENDARLEHEN · RATENKREDIT'],
          ['principal', 'Float', 'Darlehensbetrag'],
          ['interestRate', 'Float', 'Zinssatz p.a.'],
          ['initialRepaymentRate', 'Float?', 'Anfangstilgungssatz (nur Annuität)'],
          ['termMonths', 'Int', 'Laufzeit in Monaten'],
          ['startDate', 'DateTime', 'Datum der ersten Rate'],
          ['accountId', 'String?', 'Verknüpftes Konto (optional)'],
          ['categoryId', 'String?', 'Buchungskategorie (optional)'],
        ],
        [22, 20, 58]
      ),
      ...spacer(),

      h2('CategoryRule — Kategorisierungsregel'),
      makeTable(
        ['Feld', 'Typ', 'Beschreibung'],
        [
          ['id', 'String', 'Primärschlüssel'],
          ['name', 'String', 'Regelname'],
          ['field', 'Enum', 'DESCRIPTION · PAYEE · AMOUNT'],
          ['operator', 'Enum', 'CONTAINS · STARTS_WITH · ENDS_WITH · EQUALS · GT · LT · REGEX'],
          ['value', 'String', 'Suchwert'],
          ['categoryId', 'String', 'Ziel-Kategorie'],
          ['priority', 'Int', 'Höherer Wert = wird bevorzugt angewendet'],
          ['isActive', 'Boolean', 'Regel aktiv/inaktiv'],
        ],
        [22, 20, 58]
      ),
      ...spacer(),

      // ── 5. API-Routen ─────────────────────────────────────────────────────
      divider(),
      h1('5. API-Routen'),

      h2('Konten'),
      makeTable(
        ['Methode', 'Route', 'Funktion'],
        [
          ['GET',    '/api/accounts',                        'Alle aktiven Konten'],
          ['POST',   '/api/accounts',                        'Konto anlegen'],
          ['GET',    '/api/accounts/[id]',                   'Konto + letzte 50 Transaktionen'],
          ['PUT',    '/api/accounts/[id]',                   'Konto bearbeiten'],
          ['DELETE', '/api/accounts/[id]',                   'Soft-Delete'],
          ['GET',    '/api/accounts/[id]/category-groups',   'Kategoriegruppen des Kontos'],
          ['POST',   '/api/accounts/[id]/sub-accounts',      'Unterkonto anlegen'],
          ['POST',   '/api/accounts/[id]/reconcile',         'Kontoabgleich'],
        ],
        [12, 40, 48]
      ),
      ...spacer(),

      h2('Transaktionen'),
      makeTable(
        ['Methode', 'Route', 'Funktion'],
        [
          ['GET',    '/api/transactions',       'Liste (Filter: accountId, categoryId, from, to, search)'],
          ['POST',   '/api/transactions',       'Anlegen inkl. Gegenbuchung & Unterkonto-Eintrag'],
          ['PUT',    '/api/transactions/[id]',  'Bearbeiten'],
          ['DELETE', '/api/transactions/[id]',  'Löschen inkl. Kredit-Revert'],
        ],
        [12, 35, 53]
      ),
      ...spacer(),

      h2('Budget'),
      makeTable(
        ['Methode', 'Route', 'Funktion'],
        [
          ['GET',  '/api/budget/[year]/[month]',                                    'Globale Budget-Tabelle'],
          ['PUT',  '/api/budget/[year]/[month]',                                    'Planwerte speichern (Batch)'],
          ['POST', '/api/budget/[year]/[month]/rollover',                           'Übertrag in Folgemonat (global)'],
          ['GET',  '/api/accounts/[id]/budget/[year]/[month]',                      'Budget-Tabelle für ein Konto'],
          ['POST', '/api/accounts/[id]/budget/[year]/[month]/rollover',             'Übertrag für ein Konto'],
        ],
        [12, 46, 42]
      ),
      ...spacer(),

      h2('Kategorien & Gruppen'),
      makeTable(
        ['Methode', 'Route', 'Funktion'],
        [
          ['GET',  '/api/categories',                 'Alle Kategorien gruppiert'],
          ['POST', '/api/categories',                 'Kategorie anlegen'],
          ['PUT',  '/api/categories/[id]',            'Bearbeiten'],
          ['DELETE','/api/categories/[id]',           'Löschen'],
          ['POST', '/api/categories/reorder',         'Reihenfolge speichern'],
          ['GET',  '/api/category-groups',            'Alle Gruppen (opt. ?accountId=)'],
          ['POST', '/api/category-groups',            'Gruppe anlegen'],
          ['PUT',  '/api/category-groups/[id]',       'Gruppe bearbeiten'],
          ['DELETE','/api/category-groups/[id]',      'Gruppe löschen'],
          ['POST', '/api/category-groups/reorder',    'Reihenfolge speichern'],
        ],
        [12, 40, 48]
      ),
      ...spacer(),

      h2('Kredite · Regeln · Import · Berichte'),
      makeTable(
        ['Methode', 'Route', 'Funktion'],
        [
          ['GET',    '/api/loans',                         'Alle Kredite mit Kennzahlen'],
          ['POST',   '/api/loans',                         'Kredit anlegen + Tilgungsplan generieren'],
          ['PUT',    '/api/loans/[id]',                    'Bearbeiten'],
          ['DELETE', '/api/loans/[id]',                    'Löschen'],
          ['PUT',    '/api/loans/[id]/payments/[period]',  'Rate bezahlen / Sondertilgung'],
          ['GET',    '/api/rules',                         'Alle Regeln'],
          ['POST',   '/api/rules',                         'Regel anlegen'],
          ['PUT',    '/api/rules/[id]',                    'Bearbeiten'],
          ['DELETE', '/api/rules/[id]',                    'Löschen'],
          ['POST',   '/api/import',                        'Bulk-Import mit Duplikatprüfung'],
          ['GET',    '/api/reports/monthly-summary',       'Einnahmen/Ausgaben aggregiert'],
          ['GET',    '/api/reports/category-spending',     'Kategorienausgaben nach Monat'],
        ],
        [12, 42, 46]
      ),
      ...spacer(),

      // ── 6. Implementierungsstatus ─────────────────────────────────────────
      divider(),
      h1('6. Implementierungsstatus'),

      h2('✅ Vollständig implementiert'),
      bullet('Konten: Anlegen · Bearbeiten · Soft-Delete · Detailansicht (3 Tabs)'),
      bullet('Transaktionen: Manuell erfassen · Löschen · Suche · Transfer-Logik'),
      bullet('Kategorien & Gruppen: CRUD · Reihenfolge · Pro-Konto-Konfiguration'),
      bullet('Budget global: Monatliche Planwerte · Rollover · Verfügbar-Berechnung'),
      bullet('Budget konto-spezifisch: Im Konto-Detail-Tab · Separater Rollover'),
      bullet('Transaktionsdetail: Doppelklick auf Betrag im Budget-Tab zeigt Einzelbuchungen'),
      bullet('CSV-Import: 4-Schritt-Assistent · 10 Bankprofile · Regelanwendung · Hash-Duplikatprüfung'),
      bullet('Kategorisierungsregeln: CRUD · Alle Operatoren inkl. Regex'),
      bullet('Kredite: CRUD · Tilgungsplan (Annuität + Ratenkredit) · Ratenverwaltung · Sondertilgung'),
      bullet('Unterkonten: CRUD · Gruppen · Einträge · BOOKING/TRANSFER-Verknüpfung'),
      bullet('Kontoabgleich (Reconcile)'),
      bullet('Dashboard: KPI-Kacheln · 6-Monatschart · Kategorienverteilung'),
      bullet('Berichte: Monatliche Übersicht · Kategorienanalyse · Budget vs. Ist'),
      bullet('Einstellungen: Währung/Locale · Kategorien · Regeln · Kredite · Konten'),
      bullet('Dropdowns: Kein Schlüsselwert sichtbar — auch bei Vorbelegung'),
      bullet('Budget-Monat: Wird bei Page-Reload gespeichert (Zustand persistiert)'),
      ...spacer(),

      h2('🔲 Im Backlog (noch nicht implementiert)'),
      bullet('B-001 Transaktionen bearbeiten'),
      bullet('B-002 Wiederkehrende Transaktionen'),
      bullet('B-003 Kontoabgleich verbessern (Einzel-CLEARED)'),
      bullet('B-004 Massenbearbeitung Transaktionen'),
      bullet('B-005 Konto-Saldo-Verlauf (Chart)'),
      bullet('B-006 Importprofil speichern'),
      bullet('B-007 Export (CSV/JSON)'),
      ...spacer(),

      // ── 7. Backlog ────────────────────────────────────────────────────────
      divider(),
      h1('7. Backlog'),
      muted('Neue Features werden hier zuerst spezifiziert und freigegeben, bevor sie implementiert werden.'),
      ...spacer(),

      h2('B-001 · Transaktionen bearbeiten'),
      makeTable(
        ['', ''],
        [
          ['Status', '🔲 Offen'],
          ['Beschreibung', 'Eine bestehende Transaktion soll editierbar sein — Datum, Betrag, Beschreibung, Kategorie, Status.'],
        ],
        [20, 80]
      ),
      ...spacer(0),
      h3('Akzeptanzkriterien'),
      bullet('Klick auf eine Transaktion in der Transaktionsliste oder im Konto-Detail öffnet das Bearbeitungsformular'),
      bullet('Alle Felder aus der Erfassung sind editierbar'),
      bullet('Status kann auf CLEARED / RECONCILED gesetzt werden'),
      bullet('Speichern aktualisiert den Kontosaldo entsprechend der Differenz'),
      ...spacer(),

      h2('B-002 · Wiederkehrende Transaktionen'),
      makeTable(
        ['', ''],
        [
          ['Status', '🔲 Offen'],
          ['Beschreibung', 'Regelmäßige Buchungen (z.B. Miete) einmalig konfigurieren und automatisch vorschlagen.'],
        ],
        [20, 80]
      ),
      h3('Akzeptanzkriterien'),
      bullet('Transaktion als "wiederkehrend" markierbar mit Frequenz: täglich / wöchentlich / monatlich / jährlich'),
      bullet('Liste offener Fälligkeiten auf dem Dashboard sichtbar'),
      bullet('Manuelle Bestätigung jeder Buchung (kein vollautomatisches Buchen)'),
      ...spacer(),

      h2('B-003 · Kontoabgleich verbessern'),
      makeTable(
        ['', ''],
        [
          ['Status', '🔲 Offen'],
          ['Beschreibung', 'Beim Abgleich sollen einzelne Transaktionen als CLEARED markiert werden können.'],
        ],
        [20, 80]
      ),
      h3('Akzeptanzkriterien'),
      bullet('Liste aller PENDING-Transaktionen im Abgleich-Dialog'),
      bullet('Checkbox pro Transaktion zum Markieren als CLEARED'),
      bullet('Summe der markierten Transaktionen wird angezeigt und mit Kontoauszug verglichen'),
      bullet('Abschluss setzt alle markierten Transaktionen auf RECONCILED'),
      ...spacer(),

      h2('B-004 · Transaktionen: Massenbearbeitung'),
      makeTable(
        ['', ''],
        [
          ['Status', '🔲 Offen'],
          ['Beschreibung', 'Mehrere Transaktionen gleichzeitig auswählen und gemeinsam kategorisieren oder löschen.'],
        ],
        [20, 80]
      ),
      h3('Akzeptanzkriterien'),
      bullet('Checkbox-Spalte in der Transaktionsliste'),
      bullet('Aktionsleiste erscheint bei Selektion (Anzahl ausgewählt · Aktionen: Kategorie setzen, Löschen)'),
      bullet('Bestätigungsdialog vor Massenlöschung'),
      ...spacer(),

      h2('B-005 · Konto-Saldo-Verlauf'),
      makeTable(
        ['', ''],
        [
          ['Status', '🔲 Offen'],
          ['Beschreibung', 'Im Konto-Detail-Tab einen Chart zeigen, der den Saldo-Verlauf der letzten 12 Monate zeigt.'],
        ],
        [20, 80]
      ),
      h3('Akzeptanzkriterien'),
      bullet('Liniendiagramm: Monat auf X-Achse, Saldo auf Y-Achse'),
      bullet('Daten aus Transaktionshistorie berechnet (kumulierte Summe)'),
      bullet('Auf Desktop lesbar, kein horizontales Scrollen nötig'),
      ...spacer(),

      h2('B-006 · Importprofil speichern'),
      makeTable(
        ['', ''],
        [
          ['Status', '🔲 Offen'],
          ['Beschreibung', 'Eigene CSV-Importprofile (Spaltenreihenfolge, Trennzeichen) anlegen und speichern.'],
        ],
        [20, 80]
      ),
      h3('Akzeptanzkriterien'),
      bullet('Beim Import: "Neues Profil aus aktueller Konfiguration speichern"'),
      bullet('Gespeicherte Profile erscheinen in der Profil-Auswahl'),
      bullet('Profile sind in den Einstellungen editierbar und löschbar'),
      ...spacer(),

      h2('B-007 · Export (CSV/JSON)'),
      makeTable(
        ['', ''],
        [
          ['Status', '🔲 Offen'],
          ['Beschreibung', 'Transaktionen und Budget-Daten als CSV oder JSON exportieren.'],
        ],
        [20, 80]
      ),
      h3('Akzeptanzkriterien'),
      bullet('Export-Button in Transaktionsliste (aktuelle Filter werden übernommen)'),
      bullet('Felder: Datum · Beschreibung · Auftraggeber · Betrag · Kategorie · Konto'),
      bullet('Download direkt im Browser (kein Server-Upload)'),
      ...spacer(),

      // ── 8. Konventionen ───────────────────────────────────────────────────
      divider(),
      h1('8. Technische Konventionen'),
      makeTable(
        ['Bereich', 'Regel'],
        [
          ['Sprache', 'Deutsch in der UI · Englisch im Code'],
          ['Währungsformatierung', 'Immer useFormatCurrency() Hook verwenden — nie formatCurrency()'],
          ['Monatsnamen', 'Immer getMonthName(month, year) aus @/lib/budget/calculations'],
          ['Dropdown-Werte', 'Kein Schlüsselwert sichtbar — itemToStringLabel oder items Prop verwenden'],
          ['TypeScript', 'Kein any in Interfaces; any nur für externe API-Responses mit Kommentar'],
          ['API-Fehler', 'if (!res.ok) throw new Error(...) in jedem mutationFn'],
          ['Formulare', 'react-hook-form + Zod für alle Formulare mit Validierung'],
          ['Beträge (DB)', 'Negativ = Ausgabe, Positiv = Einnahme (Datenbankkonvention)'],
          ['Neue Seiten', 'Immer in src/app/(app)/ unter dem App-Router-Layout'],
          ['Neue Dialoge', 'Als eigenständige Komponente in src/components/'],
          ['State', 'Lokaler State: useState · Serverstate: TanStack Query · Global: Zustand'],
          ['Persistierung', 'Zustand-Stores mit persist-Middleware für nutzerrelevanten Zustand'],
        ],
        [30, 70]
      ),
    ],
  }],
})

// ── Datei schreiben ───────────────────────────────────────────────────────────

const buffer = await Packer.toBuffer(doc)
fs.writeFileSync(OUT, buffer)
console.log(`✅  SPEC.docx erstellt: ${OUT}`)
