/**
 * Comprehensive Test Suite – BudgetApp
 *
 * Abdeckung:
 *  - Alle API-Endpunkte (CRUD)
 *  - 10.000 Transaktionen pro Konto (via direktem SQLite-Insert)
 *  - Alle Reports
 *  - Performance-Benchmarks
 *
 * Ausführen: node scripts/test-comprehensive.mjs
 */

import { createClient } from '@libsql/client'
import { randomUUID } from 'crypto'
import { performance } from 'perf_hooks'

// ── Konfiguration ─────────────────────────────────────────────────────────────
const BASE = 'http://localhost:3000/api'
const DB_URL = 'file:./prisma/dev.db'
const TRANSACTIONS_PER_ACCOUNT = 10_000
const NOW = new Date()
const CURRENT_YEAR = NOW.getFullYear()
const CURRENT_MONTH = NOW.getMonth() + 1

// ── Ergebnis-Tracking ─────────────────────────────────────────────────────────
const results = []
let currentSuite = ''
let suitePass = 0
let suiteFail = 0

function suite(name) {
  if (currentSuite) {
    console.log(`   → ${suitePass} bestanden, ${suiteFail} fehlgeschlagen\n`)
  }
  currentSuite = name
  suitePass = 0
  suiteFail = 0
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  SUITE: ${name}`)
  console.log('═'.repeat(60))
}

function pass(name, info = '') {
  suitePass++
  results.push({ suite: currentSuite, name, status: 'PASS', info })
  const infoStr = info ? ` (${info})` : ''
  console.log(`  ✓ ${name}${infoStr}`)
}

function fail(name, error) {
  suiteFail++
  results.push({ suite: currentSuite, name, status: 'FAIL', error: String(error) })
  console.error(`  ✗ ${name}: ${error}`)
}

async function test(name, fn) {
  try {
    const result = await fn()
    pass(name, result?.info ?? '')
    return result?.data ?? result
  } catch (err) {
    fail(name, err.message ?? err)
    return null
  }
}

// ── HTTP-Helper ───────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status} ${method} ${path} → ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : null
}

async function bench(label, path) {
  const times = []
  let count = '?'
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now()
    const data = await fetch(`${BASE}${path}`).then(r => r.json())
    times.push(performance.now() - t0)
    if (i === 0) count = Array.isArray(data) ? data.length : JSON.stringify(data).length + 'B'
  }
  const avg = (times.reduce((a, b) => a + b, 0) / times.length).toFixed(0)
  const min = Math.min(...times).toFixed(0)
  const max = Math.max(...times).toFixed(0)
  pass(label, `${count} Einträge | avg ${avg}ms min ${min}ms max ${max}ms`)
}

// ── Hilfsfunktionen für Testdaten ─────────────────────────────────────────────
const pick = arr => arr[Math.floor(Math.random() * arr.length)]
const rnd = (min, max) => Math.round((Math.random() * (max - min) + min) * 100) / 100

const DESCRIPTIONS = [
  'REWE Markt', 'ALDI Süd', 'Lidl', 'EDEKA Center', 'Kaufland',
  'Amazon.de', 'Zalando SE', 'Netflix', 'Spotify', 'Apple iTunes',
  'Miete Dezember', 'Nebenkosten', 'GEZ Beitrag', 'Kfz Versicherung', 'Haftpflicht',
  'Tankstelle BP', 'Shell Tankstelle', 'Deutsche Bahn', 'BVG Monatskarte', 'Taxifahrt',
  'Restaurant zum Löwen', 'Cafe Müller', 'Pizzeria Roma', 'Asia Restaurant', 'Döner',
  'Fitnessstudio', 'Apotheke', 'Arztrechnung', 'Zahnarzt', 'Friseur',
  'Gehalt', 'Freiberufliche Arbeit', 'Mieteinnahme', 'Dividende', 'Zinsen',
  'Baumarkt Hornbach', 'Möbelhaus IKEA', 'Elektromarkt Media', 'Buchhandlung',
  'Supermarkt dm', 'Rossmann', 'Post Porto', 'Paketgebühr', 'Verzugszinsen',
  'Strom Stadtwerke', 'Gas Versorgung', 'Wasser Abwasser', 'Versicherung',
]
const PAYEES = [
  null, null, null,
  'Müller GmbH', 'Schulze & Co', 'Meyer OHG', 'Schmidt KG', 'Berger AG',
  'Fischer Handel', 'Wagner Service', 'Hoffmann Gruppe',
]
const STATUSES = ['PENDING', 'PENDING', 'CLEARED', 'CLEARED', 'CLEARED', 'RECONCILED']

// ── Hauptprogramm ─────────────────────────────────────────────────────────────
const db = createClient({ url: DB_URL })

// Shared test state
let accounts = []       // { id, name }
let categoryGroups = [] // { id, accountId }
let categories = []     // { id, accountId, groupId, type }
let subAccounts = []    // { id }
let loans = []          // { id }
let rules = []          // { id }
let testTxIds = []      // einzeln erstellte Transaktionen

// ── SUITE 1: Konten ────────────────────────────────────────────────────────────
suite('1 · Konten (Accounts)')

const accountDefs = [
  { name: 'TEST Girokonto', bank: 'Testbank AG', type: 'CHECKING', color: '#3B82F6', currentBalance: 5000 },
  { name: 'TEST Sparkonto', bank: 'Spar GmbH', type: 'SAVINGS', color: '#10B981', currentBalance: 15000 },
  { name: 'TEST Kreditkarte', bank: 'Card Corp', type: 'CREDIT_CARD', color: '#F59E0B', currentBalance: -850 },
]

for (const def of accountDefs) {
  const created = await test(`POST /accounts – ${def.name}`, async () => {
    const data = await api('POST', '/accounts', def)
    if (!data?.id) throw new Error('Kein id zurückgegeben')
    accounts.push({ id: data.id, name: data.name, type: data.type })
    return { data }
  })
}

await test('GET /accounts – Liste aller Konten', async () => {
  const data = await api('GET', '/accounts')
  if (!Array.isArray(data)) throw new Error('Kein Array')
  const testAccounts = data.filter(a => a.name.startsWith('TEST '))
  if (testAccounts.length < 3) throw new Error(`Nur ${testAccounts.length} Testkonten gefunden`)
  return { info: `${data.length} Konten gesamt` }
})

await test('GET /accounts/[id] – Einzelkonto mit Transaktionen', async () => {
  const data = await api('GET', `/accounts/${accounts[0].id}`)
  if (!data?.id) throw new Error('Kein id')
  if (!('transactions' in data)) throw new Error('Kein transactions-Feld')
  return { info: `${data.transactions?.length ?? 0} letzte Transaktionen` }
})

await test('PUT /accounts/[id] – Konto aktualisieren', async () => {
  // IBAN hat @unique – suffix mit Timestamp für Eindeutigkeit über Testläufe hinweg
  const suffix = Date.now().toString().slice(-8)
  const updated = await api('PUT', `/accounts/${accounts[1].id}`, {
    name: 'TEST Sparkonto (aktualisiert)',
    iban: `DE${suffix}37040044053201`,
    bank: 'Testbank Updated',
  })
  if (!updated?.id) throw new Error('Kein id')
  accounts[1].name = updated.name
})

// ── SUITE 2: Kategoriegruppen ─────────────────────────────────────────────────
suite('2 · Kategoriegruppen (CategoryGroups)')

const groupDefs = [
  { name: 'Haushalt & Wohnen', sortOrder: 1 },
  { name: 'Lebensmittel', sortOrder: 2 },
  { name: 'Mobilität', sortOrder: 3 },
  { name: 'Freizeit & Kultur', sortOrder: 4 },
  { name: 'Einnahmen', sortOrder: 5 },
  { name: 'Gesundheit', sortOrder: 6 },
]

// Gruppen für jedes Konto anlegen
for (const acc of accounts) {
  for (const gd of groupDefs) {
    await test(`POST /category-groups – ${gd.name} @ ${acc.name}`, async () => {
      const data = await api('POST', '/category-groups', { ...gd, accountId: acc.id })
      if (!data?.id) throw new Error('Kein id')
      categoryGroups.push({ id: data.id, accountId: acc.id, name: data.name })
    })
  }
}

await test('GET /category-groups – Alle Gruppen', async () => {
  const data = await api('GET', '/category-groups')
  if (!Array.isArray(data)) throw new Error('Kein Array')
  return { info: `${data.length} Gruppen` }
})

await test('GET /category-groups?accountId=... – Gruppen eines Kontos', async () => {
  const data = await api('GET', `/category-groups?accountId=${accounts[0].id}`)
  if (!Array.isArray(data)) throw new Error('Kein Array')
  return { info: `${data.length} Gruppen für Konto 0` }
})

await test('GET /accounts/[id]/category-groups', async () => {
  const data = await api('GET', `/accounts/${accounts[0].id}/category-groups`)
  if (!Array.isArray(data)) throw new Error('Kein Array')
  return { info: `${data.length} Gruppen` }
})

await test('PUT /category-groups/[id] – Gruppe umbenennen', async () => {
  const grp = categoryGroups[0]
  const updated = await api('PUT', `/category-groups/${grp.id}`, { name: 'Haushalt (updated)', sortOrder: 1 })
  if (!updated?.id) throw new Error('Kein id')
})

await test('PATCH /category-groups/reorder – Reihenfolge ändern', async () => {
  const accGroups = categoryGroups.filter(g => g.accountId === accounts[0].id)
  const payload = accGroups.map((g, i) => ({ id: g.id, sortOrder: accGroups.length - i }))
  const result = await api('PATCH', '/category-groups/reorder', payload)
  if (!result?.success && !result?.updated) throw new Error(`Unerwartete Antwort: ${JSON.stringify(result)}`)
  return { info: `${result.updated ?? accGroups.length} Gruppen umsortiert` }
})

// ── SUITE 3: Kategorien ───────────────────────────────────────────────────────
suite('3 · Kategorien (Categories)')

const categoryDefs = [
  { name: 'Miete', color: '#EF4444', type: 'EXPENSE', groupIndex: 0 },
  { name: 'Strom & Gas', color: '#F97316', type: 'EXPENSE', groupIndex: 0 },
  { name: 'Internet & Telefon', color: '#EAB308', type: 'EXPENSE', groupIndex: 0 },
  { name: 'Lebensmittel Supermarkt', color: '#22C55E', type: 'EXPENSE', groupIndex: 1 },
  { name: 'Restaurant & Essen gehen', color: '#06B6D4', type: 'EXPENSE', groupIndex: 1 },
  { name: 'Kfz Benzin', color: '#8B5CF6', type: 'EXPENSE', groupIndex: 2 },
  { name: 'ÖPNV', color: '#EC4899', type: 'EXPENSE', groupIndex: 2 },
  { name: 'Kino & Streaming', color: '#14B8A6', type: 'EXPENSE', groupIndex: 3 },
  { name: 'Sport & Fitness', color: '#F59E0B', type: 'EXPENSE', groupIndex: 3 },
  { name: 'Gehalt', color: '#3B82F6', type: 'INCOME', groupIndex: 4 },
  { name: 'Sonstige Einnahmen', color: '#6366F1', type: 'INCOME', groupIndex: 4 },
  { name: 'Arzt & Medikamente', color: '#84CC16', type: 'EXPENSE', groupIndex: 5 },
]

for (const acc of accounts) {
  const accGroups = categoryGroups.filter(g => g.accountId === acc.id)
  for (const cd of categoryDefs) {
    await test(`POST /categories – ${cd.name} @ ${acc.name}`, async () => {
      const grp = accGroups[cd.groupIndex]
      const data = await api('POST', '/categories', {
        name: cd.name,
        color: cd.color,
        type: cd.type,
        groupId: grp?.id,
        sortOrder: categoryDefs.indexOf(cd),
      })
      if (!data?.id) throw new Error('Kein id')
      categories.push({ id: data.id, accountId: acc.id, groupId: grp?.id, type: cd.type, name: cd.name })
    })
  }
}

await test('GET /categories – Alle Kategorien', async () => {
  const data = await api('GET', '/categories')
  if (!data?.groups && !data?.ungrouped) throw new Error('Ungültige Struktur')
  const total = (data.groups ?? []).flatMap(g => g.categories ?? []).length + (data.ungrouped ?? []).length
  return { info: `${total} Kategorien` }
})

await test('PUT /categories/[id] – Kategorie aktualisieren', async () => {
  const cat = categories[0]
  const updated = await api('PUT', `/categories/${cat.id}`, {
    name: cat.name + ' (upd)',
    color: '#FF0000',
  })
  if (!updated?.id) throw new Error('Kein id')
})

await test('PATCH /categories/reorder – Kategorien umsortieren', async () => {
  const accCats = categories.filter(c => c.accountId === accounts[0].id).slice(0, 4)
  const payload = accCats.map((c, i) => ({ id: c.id, sortOrder: accCats.length - i }))
  const result = await api('PATCH', '/categories/reorder', payload)
  if (!result?.success && !result?.updated) throw new Error(`Unerwartete Antwort: ${JSON.stringify(result)}`)
  return { info: `${result.updated ?? accCats.length} Kategorien umsortiert` }
})

// ── SUITE 4: Masseninsert – 10.000 Transaktionen pro Konto ────────────────────
suite('4 · Masseninsert – 10.000 Transaktionen pro Konto (via SQLite)')

const EXPENSE_CATEGORIES = categories.filter(c => c.type === 'EXPENSE')
const INCOME_CATEGORIES = categories.filter(c => c.type === 'INCOME')
const threeYearsMs = 3 * 365 * 24 * 60 * 60 * 1000
const now_ms = Date.now()

let totalInserted = 0

for (const acc of accounts) {
  await test(`10.000 Transaktionen für ${acc.name}`, async () => {
    const accExpense = EXPENSE_CATEGORIES.filter(c => c.accountId === acc.id)
    const accIncome = INCOME_CATEGORIES.filter(c => c.accountId === acc.id)
    const allAccCats = [...accExpense, ...accIncome]

    const rows = []
    let balanceDelta = 0

    for (let i = 0; i < TRANSACTIONS_PER_ACCOUNT; i++) {
      const id = randomUUID()
      const isIncome = Math.random() < 0.15
      const cat = allAccCats.length > 0 && Math.random() > 0.08
        ? (isIncome ? pick(accIncome) ?? pick(accExpense) : pick(accExpense) ?? pick(accIncome))
        : null
      const type = isIncome ? 'INCOME' : 'EXPENSE'
      const amount = isIncome ? rnd(800, 5000) : -rnd(1, 1200)
      const date = new Date(now_ms - Math.random() * threeYearsMs).toISOString()
      const description = `${pick(DESCRIPTIONS)} #${i}`
      const payee = pick(PAYEES)
      const status = pick(STATUSES)

      rows.push({
        id, date, amount, description,
        payee: payee ?? null,
        accountId: acc.id,
        categoryId: cat?.id ?? null,
        status, type,
      })
      balanceDelta += amount
    }

    // Batch-Insert in Chunks à 500
    const BATCH = 500
    const t0 = performance.now()
    for (let start = 0; start < rows.length; start += BATCH) {
      const chunk = rows.slice(start, start + BATCH)
      const stmts = chunk.map(r => ({
        sql: `INSERT INTO "Transaction"
          (id, date, amount, description, payee, notes, accountId, categoryId,
           status, type, importHash, isReconciled, subAccountEntryId, transferToId,
           createdAt, updatedAt)
          VALUES (?,?,?,?,?,NULL,?,?,?,?,NULL,0,NULL,NULL,datetime('now'),datetime('now'))`,
        args: [r.id, r.date, r.amount, r.description, r.payee,
               r.accountId, r.categoryId, r.status, r.type],
      }))
      await db.batch(stmts, 'write')
    }

    // Kontostand aktualisieren
    await db.execute({
      sql: `UPDATE Account SET currentBalance = currentBalance + ? WHERE id = ?`,
      args: [balanceDelta, acc.id],
    })

    const elapsed = ((performance.now() - t0) / 1000).toFixed(2)
    totalInserted += TRANSACTIONS_PER_ACCOUNT
    return { info: `${TRANSACTIONS_PER_ACCOUNT} Tx in ${elapsed}s, Δ${balanceDelta.toFixed(2)}` }
  })
}

await test('Gesamtanzahl Transaktionen in DB', async () => {
  const rows = (await db.execute('SELECT COUNT(*) as cnt FROM "Transaction"')).rows
  const cnt = Number(rows[0].cnt)
  if (cnt < totalInserted) throw new Error(`Nur ${cnt} statt >= ${totalInserted} Transaktionen`)
  return { info: `${cnt} Transaktionen total in DB` }
})

// ── SUITE 5: Transaktionen API ────────────────────────────────────────────────
suite('5 · Transaktionen API (CRUD + Filter)')

let createdTxId = null

// Kurze Pause nach Masseninsert, damit der Server sich erholt
await new Promise(r => setTimeout(r, 1000))

await test('POST /transactions – Einzelne EXPENSE erstellen', async () => {
  const cat = EXPENSE_CATEGORIES.find(c => c.accountId === accounts[0].id)
  const data = await api('POST', '/transactions', {
    date: new Date().toISOString(),
    amount: -49.99,
    description: 'API-Test Einzeltransaktion EXPENSE',
    payee: 'Testladen GmbH',
    accountId: accounts[0].id,
    categoryId: cat?.id,
    type: 'EXPENSE',
    status: 'PENDING',
  })
  if (!data?.id) throw new Error('Kein id')
  createdTxId = data.id
  testTxIds.push(data.id)
})

await test('POST /transactions – INCOME erstellen', async () => {
  const cat = INCOME_CATEGORIES.find(c => c.accountId === accounts[0].id)
  const data = await api('POST', '/transactions', {
    date: new Date().toISOString(),
    amount: 3200,
    description: 'API-Test Gehaltseingang',
    accountId: accounts[0].id,
    categoryId: cat?.id,
    type: 'INCOME',
    status: 'CLEARED',
  })
  if (!data?.id) throw new Error('Kein id')
  testTxIds.push(data.id)
})

await test('POST /transactions – Ohne Kategorie (uncategorized)', async () => {
  const data = await api('POST', '/transactions', {
    date: new Date(Date.now() - 86400000).toISOString(),
    amount: -12.50,
    description: 'API-Test Unkategorisiert',
    accountId: accounts[1].id,
    type: 'EXPENSE',
    status: 'PENDING',
  })
  if (!data?.id) throw new Error('Kein id')
  testTxIds.push(data.id)
})

await test('GET /transactions – Standard (limit=100)', async () => {
  const data = await api('GET', '/transactions?limit=100')
  if (!Array.isArray(data)) throw new Error('Kein Array')
  if (data.length === 0) throw new Error('Leer')
  return { info: `${data.length} Transaktionen` }
})

await test('GET /transactions – Limit=200', async () => {
  const data = await api('GET', '/transactions?limit=200')
  if (!Array.isArray(data)) throw new Error('Kein Array')
  return { info: `${data.length} Transaktionen` }
})

await test('GET /transactions – Nach accountId filtern', async () => {
  const data = await api('GET', `/transactions?accountId=${accounts[0].id}&limit=200`)
  if (!Array.isArray(data)) throw new Error('Kein Array')
  const wrongAccount = data.filter(t => t.accountId !== accounts[0].id)
  if (wrongAccount.length > 0) throw new Error('Falsche accountId in Ergebnis')
  return { info: `${data.length} Transaktionen für Konto 0` }
})

await test('GET /transactions – Textsuche (search=REWE)', async () => {
  const data = await api('GET', '/transactions?search=REWE&limit=200')
  if (!Array.isArray(data)) throw new Error('Kein Array')
  return { info: `${data.length} Treffer für "REWE"` }
})

await test('GET /transactions – Datumsfilter (from/to)', async () => {
  const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const to = new Date().toISOString().slice(0, 10)
  const data = await api('GET', `/transactions?from=${from}&to=${to}&limit=200`)
  if (!Array.isArray(data)) throw new Error('Kein Array')
  return { info: `${data.length} Transaktionen letzte 30 Tage` }
})

await test('GET /transactions – Nach categoryId filtern', async () => {
  const cat = EXPENSE_CATEGORIES.find(c => c.accountId === accounts[0].id)
  if (!cat) return { info: 'keine Kategorie verfügbar' }
  const data = await api('GET', `/transactions?categoryId=${cat.id}&limit=100`)
  if (!Array.isArray(data)) throw new Error('Kein Array')
  return { info: `${data.length} Transaktionen für Kategorie` }
})

await test('GET /transactions – Kombinierter Filter (accountId + search)', async () => {
  const data = await api('GET', `/transactions?accountId=${accounts[0].id}&search=Markt&limit=100`)
  if (!Array.isArray(data)) throw new Error('Kein Array')
  return { info: `${data.length} Treffer` }
})

await test('PUT /transactions/[id] – Status ändern (PENDING→CLEARED)', async () => {
  if (!createdTxId) throw new Error('Keine Test-Transaktion vorhanden')
  const updated = await api('PUT', `/transactions/${createdTxId}`, {
    status: 'CLEARED',
    notes: 'Geklärte Transaktion (API-Test)',
  })
  if (updated?.status !== 'CLEARED') throw new Error(`Status ist ${updated?.status}`)
})

await test('PUT /transactions/[id] – Betrag ändern', async () => {
  if (!createdTxId) throw new Error('Keine Test-Transaktion vorhanden')
  const updated = await api('PUT', `/transactions/${createdTxId}`, {
    amount: -79.99,
    description: 'API-Test Betrag geändert',
  })
  if (Math.abs(updated?.amount + 79.99) > 0.01) throw new Error(`Betrag ist ${updated?.amount}`)
})

await test('PUT /transactions/[id] – Kategorie zuweisen', async () => {
  if (!createdTxId) throw new Error('Keine Test-Transaktion vorhanden')
  const cat = EXPENSE_CATEGORIES.find(c => c.accountId === accounts[0].id)
  const updated = await api('PUT', `/transactions/${createdTxId}`, {
    categoryId: cat?.id,
  })
  if (!updated?.id) throw new Error('Kein id zurückgegeben')
})

await test('DELETE /transactions/[id] – Transaktion löschen', async () => {
  // Erstelle eine extra Transaktion zum Löschen
  const extra = await api('POST', '/transactions', {
    date: new Date().toISOString(),
    amount: -5.00,
    description: 'Wird gelöscht',
    accountId: accounts[0].id,
    type: 'EXPENSE',
    status: 'PENDING',
  })
  if (!extra?.id) throw new Error('Erstellen fehlgeschlagen')
  await api('DELETE', `/transactions/${extra.id}`)
})

// ── SUITE 6: Kategorisierungsregeln ───────────────────────────────────────────
suite('6 · Kategorisierungsregeln (Rules)')

let ruleId = null
const ruleCat = EXPENSE_CATEGORIES.find(c => c.name?.includes('Lebensmittel') || c.name?.includes('Restaurant'))
    ?? EXPENSE_CATEGORIES[0]

await test('POST /rules – CONTAINS-Regel erstellen', async () => {
  if (!ruleCat) throw new Error('Keine Kategorie verfügbar')
  const data = await api('POST', '/rules', {
    name: 'Supermarkt-Regel',
    field: 'DESCRIPTION',
    operator: 'CONTAINS',
    value: 'REWE',
    categoryId: ruleCat.id,
    priority: 10,
    isActive: true,
  })
  if (!data?.id) throw new Error('Kein id')
  ruleId = data.id
  rules.push({ id: data.id })
})

await test('POST /rules – STARTS_WITH-Regel', async () => {
  if (!ruleCat) throw new Error('Keine Kategorie verfügbar')
  const data = await api('POST', '/rules', {
    name: 'Aldi-Regel',
    field: 'DESCRIPTION',
    operator: 'STARTS_WITH',
    value: 'ALDI',
    categoryId: ruleCat.id,
    priority: 8,
  })
  if (!data?.id) throw new Error('Kein id')
  rules.push({ id: data.id })
})

await test('POST /rules – ENDS_WITH-Regel', async () => {
  if (!ruleCat) throw new Error('Keine Kategorie verfügbar')
  const data = await api('POST', '/rules', {
    name: 'GmbH-Regel',
    field: 'PAYEE',
    operator: 'ENDS_WITH',
    value: 'GmbH',
    categoryId: ruleCat.id,
    priority: 5,
  })
  if (!data?.id) throw new Error('Kein id')
  rules.push({ id: data.id })
})

await test('POST /rules – GREATER_THAN Betrag-Regel', async () => {
  const incomeCat = INCOME_CATEGORIES[0]
  if (!incomeCat) throw new Error('Keine Einnahmenkategorie')
  const data = await api('POST', '/rules', {
    name: 'Großer Eingang',
    field: 'AMOUNT',
    operator: 'GREATER_THAN',
    value: '2000',
    categoryId: incomeCat.id,
    priority: 20,
  })
  if (!data?.id) throw new Error('Kein id')
  rules.push({ id: data.id })
})

await test('POST /rules – REGEX-Regel', async () => {
  if (!ruleCat) throw new Error('Keine Kategorie verfügbar')
  const data = await api('POST', '/rules', {
    name: 'Tankstellen-Regex',
    field: 'DESCRIPTION',
    operator: 'REGEX',
    value: '^(BP|Shell|ARAL).*',
    categoryId: ruleCat.id,
    priority: 15,
  })
  if (!data?.id) throw new Error('Kein id')
  rules.push({ id: data.id })
})

await test('GET /rules – Alle Regeln laden', async () => {
  const data = await api('GET', '/rules')
  if (!Array.isArray(data)) throw new Error('Kein Array')
  return { info: `${data.length} Regeln` }
})

await test('PUT /rules/[id] – Regel aktualisieren', async () => {
  if (!ruleId) throw new Error('Keine Regel vorhanden')
  const updated = await api('PUT', `/rules/${ruleId}`, {
    name: 'Supermarkt-Regel (upd)',
    value: 'REWE Markt',
    priority: 12,
  })
  if (!updated?.id) throw new Error('Kein id')
})

await test('DELETE /rules/[id] – Regel löschen (letzte Regel)', async () => {
  const last = rules[rules.length - 1]
  if (!last) throw new Error('Keine Regel')
  await api('DELETE', `/rules/${last.id}`)
  rules.pop()
})

// ── SUITE 7: Budget ───────────────────────────────────────────────────────────
suite('7 · Budget (Envelope Budgeting)')

await test('GET /budget/[year]/[month] – Aktueller Monat', async () => {
  const data = await api('GET', `/budget/${CURRENT_YEAR}/${CURRENT_MONTH}`)
  if (!data?.groups && !data?.summary) throw new Error('Ungültige Struktur')
  return { info: `${data.groups?.length ?? 0} Gruppen, Σ budgeted=${data.summary?.totalBudgeted ?? 0}` }
})

await test('GET /budget/[year]/[month] – Vormonat', async () => {
  const pm = CURRENT_MONTH === 1 ? 12 : CURRENT_MONTH - 1
  const py = CURRENT_MONTH === 1 ? CURRENT_YEAR - 1 : CURRENT_YEAR
  const data = await api('GET', `/budget/${py}/${pm}`)
  if (!data) throw new Error('Keine Daten')
  return { info: `${py}-${String(pm).padStart(2,'0')}` }
})

await test('PUT /budget/[year]/[month] – Budgets setzen', async () => {
  const accCats = EXPENSE_CATEGORIES.filter(c => c.accountId === accounts[0].id).slice(0, 5)
  const payload = accCats.map((c, i) => ({
    categoryId: c.id,
    budgeted: (i + 1) * -200,  // negative sign convention for expenses
  }))
  const result = await api('PUT', `/budget/${CURRENT_YEAR}/${CURRENT_MONTH}`, payload)
  if (!result?.success && !result?.updated) throw new Error(`Unerwartete Antwort: ${JSON.stringify(result)}`)
  return { info: `${result.updated ?? accCats.length} Einträge gesetzt` }
})

await test('GET /accounts/[id]/budget/[year]/[month] – Konto-spezifisches Budget', async () => {
  const data = await api('GET', `/accounts/${accounts[0].id}/budget/${CURRENT_YEAR}/${CURRENT_MONTH}`)
  if (!data) throw new Error('Keine Daten')
  return { info: `openingBalance=${data.openingBalance}` }
})

await test('PUT /budget/[year]/[month] – Mehrere Monate historisch befüllen', async () => {
  // Budgets für die letzten 3 Monate
  let filled = 0
  for (let m = 1; m <= 3; m++) {
    let month = CURRENT_MONTH - m
    let year = CURRENT_YEAR
    if (month <= 0) { month += 12; year -= 1 }
    const accCats = EXPENSE_CATEGORIES.filter(c => c.accountId === accounts[0].id).slice(0, 4)
    const payload = accCats.map((c, i) => ({ categoryId: c.id, budgeted: (i + 1) * -150 }))
    const result = await api('PUT', `/budget/${year}/${month}`, payload)
    filled += result?.updated ?? accCats.length
  }
  return { info: `${filled} historische Einträge` }
})

await test('POST /budget/[year]/[month]/rollover – Rollover durchführen', async () => {
  const pm = CURRENT_MONTH === 1 ? 12 : CURRENT_MONTH - 1
  const py = CURRENT_MONTH === 1 ? CURRENT_YEAR - 1 : CURRENT_YEAR
  const result = await api('POST', `/budget/${py}/${pm}/rollover`)
  return { info: JSON.stringify(result)?.slice(0, 80) }
})

await test('POST /accounts/[id]/budget/[year]/[month]/rollover – Konto-Rollover', async () => {
  const pm = CURRENT_MONTH === 1 ? 12 : CURRENT_MONTH - 1
  const py = CURRENT_MONTH === 1 ? CURRENT_YEAR - 1 : CURRENT_YEAR
  const result = await api('POST', `/accounts/${accounts[0].id}/budget/${py}/${pm}/rollover`)
  return { info: JSON.stringify(result)?.slice(0, 80) }
})

// ── SUITE 8: Sub-Konten (Envelopes) ─────────────────────────────────────────
suite('8 · Sub-Konten / Envelopes (SubAccounts)')

let subAccountId = null
let subAccountGroupId = null
let subAccountEntryId = null

await test('POST /accounts/[id]/sub-accounts – Envelope erstellen', async () => {
  const data = await api('POST', `/accounts/${accounts[0].id}/sub-accounts`, {
    name: 'Notgroschen',
    color: '#10B981',
  })
  if (!data?.id) throw new Error('Kein id')
  subAccountId = data.id
  subAccounts.push({ id: data.id })
})

await test('POST /accounts/[id]/sub-accounts – Zweites Envelope', async () => {
  const data = await api('POST', `/accounts/${accounts[0].id}/sub-accounts`, {
    name: 'Urlaub Rücklage',
    color: '#3B82F6',
  })
  if (!data?.id) throw new Error('Kein id')
  subAccounts.push({ id: data.id })
})

await test('GET /accounts/[id]/sub-accounts – Liste', async () => {
  const data = await api('GET', `/accounts/${accounts[0].id}/sub-accounts`)
  if (!Array.isArray(data)) throw new Error('Kein Array')
  return { info: `${data.length} Sub-Konten` }
})

await test('GET /sub-accounts – Alle Sub-Konten', async () => {
  const data = await api('GET', '/sub-accounts')
  if (!Array.isArray(data) && !data?.subAccounts) throw new Error('Ungültige Antwort')
  const list = Array.isArray(data) ? data : data.subAccounts
  return { info: `${list?.length ?? '?'} Sub-Konten gesamt` }
})

await test('PUT /sub-accounts/[id] – Umbenennen', async () => {
  if (!subAccountId) throw new Error('Kein Sub-Konto')
  const updated = await api('PUT', `/sub-accounts/${subAccountId}`, {
    name: 'Notgroschen (3 Monatsgehälter)',
    color: '#059669',
  })
  if (!updated?.id) throw new Error('Kein id')
})

await test('POST /sub-accounts/[id]/groups – Gruppe erstellen', async () => {
  if (!subAccountId) throw new Error('Kein Sub-Konto')
  const data = await api('POST', `/sub-accounts/${subAccountId}/groups`, {
    name: 'Sparbeiträge 2026',
  })
  if (!data?.id) throw new Error('Kein id')
  subAccountGroupId = data.id
})

await test('GET /sub-account-groups – Alle Gruppen', async () => {
  const data = await api('GET', '/sub-account-groups')
  if (!Array.isArray(data)) throw new Error('Kein Array')
  return { info: `${data.length} Gruppen` }
})

await test('PUT /sub-account-groups/[id] – Gruppe umbenennen', async () => {
  if (!subAccountGroupId) throw new Error('Keine Gruppe')
  const updated = await api('PUT', `/sub-account-groups/${subAccountGroupId}`, {
    name: 'Sparbeiträge Q1/2026',
  })
  if (!updated?.id) throw new Error('Kein id')
})

await test('POST /sub-account-groups/[id]/entries – Eintrag erstellen', async () => {
  if (!subAccountGroupId) throw new Error('Keine Gruppe')
  const data = await api('POST', `/sub-account-groups/${subAccountGroupId}/entries`, {
    date: new Date().toISOString(),
    description: 'Monatliche Einlage',
    amount: 500,
    fromBudget: false,
  })
  if (!data?.id) throw new Error('Kein id')
  subAccountEntryId = data.id
})

await test('POST /sub-account-groups/[id]/entries – Zweiter Eintrag', async () => {
  if (!subAccountGroupId) throw new Error('Keine Gruppe')
  const data = await api('POST', `/sub-account-groups/${subAccountGroupId}/entries`, {
    date: new Date(Date.now() - 86400000).toISOString(),
    description: 'Einlage aus Budget',
    amount: 200,
    fromBudget: true,
  })
  if (!data?.id) throw new Error('Kein id')
  // Diesen direkt löschen
  await api('DELETE', `/sub-account-entries/${data.id}`)
})

await test('DELETE /sub-account-entries/[id] – Eintrag löschen', async () => {
  if (!subAccountEntryId) throw new Error('Kein Eintrag')
  await api('DELETE', `/sub-account-entries/${subAccountEntryId}`)
  subAccountEntryId = null
})

await test('DELETE /sub-account-groups/[id] – Gruppe löschen', async () => {
  if (!subAccountGroupId) throw new Error('Keine Gruppe')
  await api('DELETE', `/sub-account-groups/${subAccountGroupId}`)
  subAccountGroupId = null
})

await test('DELETE /sub-accounts/[id] – Sub-Konto löschen (zweites)', async () => {
  const second = subAccounts[1]
  if (!second) throw new Error('Kein zweites Sub-Konto')
  await api('DELETE', `/sub-accounts/${second.id}`)
  subAccounts.splice(1, 1)
})

// ── SUITE 9: Kredite / Darlehen ───────────────────────────────────────────────
suite('9 · Kredite und Darlehen (Loans)')

let loanId = null

await test('POST /loans – Annuitätendarlehen erstellen', async () => {
  const data = await api('POST', '/loans', {
    name: 'Baufinanzierung Test',
    loanType: 'ANNUITAETENDARLEHEN',
    principal: 250000,
    interestRate: 3.5,
    initialRepaymentRate: 2.0,
    termMonths: 360,            // 30 Jahre – Pflichtfeld!
    startDate: '2024-01-01',
    accountId: accounts[0].id,
    notes: 'Test-Kredit',
  })
  if (!data?.id) throw new Error('Kein id')
  loanId = data.id
  loans.push({ id: data.id })
})

await test('POST /loans – Ratenkredit erstellen', async () => {
  const data = await api('POST', '/loans', {
    name: 'Autokredit Test',
    loanType: 'RATENKREDIT',
    principal: 18000,
    interestRate: 4.9,
    termMonths: 60,
    startDate: '2025-06-01',
    accountId: accounts[1].id,
    notes: 'Test-Autokredit',
  })
  if (!data?.id) throw new Error('Kein id')
  loans.push({ id: data.id })
})

await test('GET /loans – Alle Kredite', async () => {
  const data = await api('GET', '/loans')
  if (!Array.isArray(data)) throw new Error('Kein Array')
  return { info: `${data.length} Kredite` }
})

await test('GET /loans/[id] – Kredit-Detail mit Tilgungsplan', async () => {
  if (!loanId) throw new Error('Kein Kredit')
  const data = await api('GET', `/loans/${loanId}`)
  if (!data?.id) throw new Error('Kein id')
  const periods = data.payments?.length ?? 0
  return { info: `${periods} Tilgungsraten, Restschuld=${data.stats?.remainingBalance?.toFixed(0) ?? '?'}` }
})

await test('PUT /loans/[id] – Kredit-Metadaten aktualisieren', async () => {
  if (!loanId) throw new Error('Kein Kredit')
  const updated = await api('PUT', `/loans/${loanId}`, {
    name: 'Baufinanzierung Test (upd)',
    notes: 'Zinssatz rückwirkend korrigiert',
  })
  if (!updated?.id) throw new Error('Kein id')
})

await test('PUT /loans/[id]/payments/1 – Erste Rate als bezahlt markieren', async () => {
  if (!loanId) throw new Error('Kein Kredit')
  const result = await api('PUT', `/loans/${loanId}/payments/1`, {
    paid: true,
  })
  if (!result) throw new Error('Keine Antwort')
  return { info: `paidAt=${result.paidAt ?? 'null'}` }
})

await test('PUT /loans/[id]/payments/1 – Rate als unbezahlt zurücksetzen', async () => {
  if (!loanId) throw new Error('Kein Kredit')
  const result = await api('PUT', `/loans/${loanId}/payments/1`, {
    paid: false,
  })
  if (!result) throw new Error('Keine Antwort')
})

await test('PUT /loans/[id]/payments/2 – Rate mit Sondertilgung', async () => {
  if (!loanId) throw new Error('Kein Kredit')
  const result = await api('PUT', `/loans/${loanId}/payments/2`, {
    paid: true,
    extraPayment: 5000,
    notes: 'Sondertilgung Q1',
  })
  if (!result) throw new Error('Keine Antwort')
  return { info: `extraPayment=5000, neues Schedule` }
})

await test('DELETE /loans/[id] – Kredit deaktivieren (zweiten)', async () => {
  const second = loans[1]
  if (!second) throw new Error('Kein zweiter Kredit')
  await api('DELETE', `/loans/${second.id}`)
})

// ── SUITE 10: Reconciliation ──────────────────────────────────────────────────
suite('10 · Kontoabstimmung (Reconciliation)')

await test('POST /accounts/[id]/reconcile – Abstimmung durchführen', async () => {
  // Hole einige CLEARED Transaktionen für das erste Konto
  const txs = await api('GET', `/transactions?accountId=${accounts[0].id}&limit=50`)
  const clearedIds = (txs ?? [])
    .filter(t => t.status === 'CLEARED')
    .slice(0, 10)
    .map(t => t.id)

  const result = await api('POST', `/accounts/${accounts[0].id}/reconcile`, {
    statementBalance: 4500,
    clearedTransactionIds: clearedIds,
  })
  if (!result) throw new Error('Keine Antwort')
  return { info: `${clearedIds.length} Transaktionen abgestimmt` }
})

await test('POST /accounts/[id]/reconcile – Zweites Konto abstimmen', async () => {
  const txs = await api('GET', `/transactions?accountId=${accounts[1].id}&limit=50`)
  const clearedIds = (txs ?? [])
    .filter(t => t.status === 'CLEARED')
    .slice(0, 5)
    .map(t => t.id)

  const result = await api('POST', `/accounts/${accounts[1].id}/reconcile`, {
    statementBalance: 14000,
    clearedTransactionIds: clearedIds,
  })
  if (!result) throw new Error('Keine Antwort')
  return { info: `${clearedIds.length} Transaktionen abgestimmt` }
})

// ── SUITE 11: CSV-Import ──────────────────────────────────────────────────────
suite('11 · CSV-Import (Bulk Import)')

await test('POST /import – 50 Transaktionen importieren', async () => {
  const hashes = new Set()
  const importTxs = []
  for (let i = 0; i < 50; i++) {
    const hash = `import-test-${Date.now()}-${i}-${Math.random()}`
    if (hashes.has(hash)) continue
    hashes.add(hash)
    const isIncome = i % 8 === 0
    importTxs.push({
      date: new Date(Date.now() - i * 86400000).toISOString(),
      amount: isIncome ? rnd(1000, 3000) : -rnd(5, 500),
      description: `CSV Import ${i}: ${pick(DESCRIPTIONS)}`,
      payee: pick(PAYEES),
      categoryId: isIncome ? INCOME_CATEGORIES[0]?.id : EXPENSE_CATEGORIES[0]?.id,
      hash,
      type: isIncome ? 'INCOME' : 'EXPENSE',
    })
  }
  const result = await api('POST', '/import', {
    accountId: accounts[2].id,
    transactions: importTxs,
  })
  if (!result) throw new Error('Keine Antwort')
  return { info: `importiert=${result.imported ?? '?'}, duplikate=${result.duplicates ?? 0}` }
})

await test('POST /import – Duplikat-Erkennung testen', async () => {
  const uniqueHash = `duplicate-test-${Date.now()}`
  const singleTx = [{
    date: new Date().toISOString(),
    amount: -99.99,
    description: 'Duplikat-Test',
    hash: uniqueHash,
    type: 'EXPENSE',
  }]
  // Erster Import
  await api('POST', '/import', { accountId: accounts[2].id, transactions: singleTx })
  // Zweiter Import (Duplikat)
  const result2 = await api('POST', '/import', { accountId: accounts[2].id, transactions: singleTx })
  if ((result2?.duplicates ?? 0) < 1) throw new Error(`Kein Duplikat erkannt: ${JSON.stringify(result2)}`)
  return { info: `${result2.duplicates} Duplikat(e) erkannt` }
})

// ── SUITE 12: Reports ─────────────────────────────────────────────────────────
suite('12 · Berichte und Reports')

await test('GET /reports/monthly-summary?months=12', async () => {
  const data = await api('GET', '/reports/monthly-summary?months=12')
  if (!Array.isArray(data)) throw new Error('Kein Array')
  return { info: `${data.length} Monate, Σ income=${data.reduce((s, m) => s + m.income, 0).toFixed(0)}` }
})

await test('GET /reports/monthly-summary?months=24', async () => {
  const data = await api('GET', '/reports/monthly-summary?months=24')
  if (!Array.isArray(data)) throw new Error('Kein Array')
  return { info: `${data.length} Monate` }
})

await test('GET /reports/monthly-summary?months=36', async () => {
  const data = await api('GET', '/reports/monthly-summary?months=36')
  if (!Array.isArray(data)) throw new Error('Kein Array')
  const totalIncome = data.reduce((s, m) => s + (m.income ?? 0), 0)
  const totalExpenses = data.reduce((s, m) => s + (m.expenses ?? 0), 0)
  return { info: `${data.length} Monate, income=${totalIncome.toFixed(0)}, expenses=${totalExpenses.toFixed(0)}` }
})

await test('GET /reports/category-spending – Aktueller Monat', async () => {
  const data = await api('GET', `/reports/category-spending?year=${CURRENT_YEAR}&month=${CURRENT_MONTH}`)
  if (!Array.isArray(data)) throw new Error('Kein Array')
  return { info: `${data.length} Kategorien, top=${data[0]?.name ?? 'keine'}` }
})

await test('GET /reports/category-spending – Vormonat', async () => {
  const pm = CURRENT_MONTH === 1 ? 12 : CURRENT_MONTH - 1
  const py = CURRENT_MONTH === 1 ? CURRENT_YEAR - 1 : CURRENT_YEAR
  const data = await api('GET', `/reports/category-spending?year=${py}&month=${pm}`)
  if (!Array.isArray(data)) throw new Error('Kein Array')
  return { info: `${data.length} Kategorien` }
})

await test('GET /reports/category-spending – Vor 6 Monaten', async () => {
  let month = CURRENT_MONTH - 6
  let year = CURRENT_YEAR
  if (month <= 0) { month += 12; year -= 1 }
  const data = await api('GET', `/reports/category-spending?year=${year}&month=${month}`)
  if (!Array.isArray(data)) throw new Error('Kein Array')
  return { info: `${data.length} Kategorien` }
})

await test('GET /reports/category-spending – Default (kein Parameter)', async () => {
  const data = await api('GET', '/reports/category-spending')
  if (!Array.isArray(data)) throw new Error('Kein Array')
  return { info: `${data.length} Kategorien` }
})

// ── SUITE 13: Performance-Benchmarks ─────────────────────────────────────────
suite('13 · Performance-Benchmarks (mit 10.000+ Transaktionen)')

await bench('GET /transactions?limit=200', '/transactions?limit=200')
await bench('GET /transactions?limit=50', '/transactions?limit=50')
await bench('GET /transactions?search=REWE&limit=200', '/transactions?search=REWE&limit=200')
await bench('GET /transactions?search=Markt&limit=200', '/transactions?search=Markt&limit=200')
await bench(`GET /transactions?accountId=[0]&limit=200`, `/transactions?accountId=${accounts[0].id}&limit=200`)
await bench('GET /accounts (mit Saldo-Berechnung)', '/accounts')
await bench(`GET /budget/${CURRENT_YEAR}/${CURRENT_MONTH}`, `/budget/${CURRENT_YEAR}/${CURRENT_MONTH}`)
await bench('GET /reports/monthly-summary?months=36', '/reports/monthly-summary?months=36')
await bench('GET /reports/category-spending', '/reports/category-spending')
await bench('GET /loans (mit Schedule-Stats)', '/loans')
await bench('GET /sub-accounts (mit Balance)', '/sub-accounts')

// ── SUITE 14: Konto-Löschung (Soft Delete) ────────────────────────────────────
suite('14 · Konten-Verwaltung (Update / Soft-Delete)')

await test('DELETE /accounts/[id] – Testkonten deaktivieren', async () => {
  for (const acc of accounts) {
    await api('DELETE', `/accounts/${acc.id}`)
  }
  return { info: `${accounts.length} Konten deaktiviert` }
})

await test('GET /accounts – Deaktivierte Konten nicht mehr sichtbar', async () => {
  const data = await api('GET', '/accounts')
  const testFound = (data ?? []).filter(a => a.name.startsWith('TEST '))
  if (testFound.length > 0) throw new Error(`Noch ${testFound.length} Testkonten sichtbar`)
  return { info: 'Alle Testkonten korrekt deaktiviert' }
})

// ── Abschlussbericht ──────────────────────────────────────────────────────────
console.log(`\n   → ${suitePass} bestanden, ${suiteFail} fehlgeschlagen\n`)
console.log('\n' + '═'.repeat(60))
console.log('  ABSCHLUSSBERICHT')
console.log('═'.repeat(60))

const passed = results.filter(r => r.status === 'PASS').length
const failed = results.filter(r => r.status === 'FAIL').length
const total = results.length

console.log(`\n  Gesamt:     ${total} Tests`)
console.log(`  Bestanden:  ${passed} ✓`)
console.log(`  Fehlerhaft: ${failed} ✗`)
console.log(`  Erfolgsquote: ${((passed / total) * 100).toFixed(1)}%`)

if (failed > 0) {
  console.log('\n  FEHLER:')
  for (const r of results.filter(r => r.status === 'FAIL')) {
    console.log(`  ✗ [${r.suite}] ${r.name}`)
    console.log(`      ${r.error}`)
  }
}

// Nach Suite gruppieren
const bySuite = {}
for (const r of results) {
  if (!bySuite[r.suite]) bySuite[r.suite] = { pass: 0, fail: 0 }
  bySuite[r.suite][r.status === 'PASS' ? 'pass' : 'fail']++
}

console.log('\n  Ergebnisse nach Suite:')
for (const [name, stats] of Object.entries(bySuite)) {
  const icon = stats.fail === 0 ? '✓' : '✗'
  console.log(`  ${icon} ${name}: ${stats.pass}/${stats.pass + stats.fail}`)
}

console.log('\n' + '═'.repeat(60))

db.close()
process.exit(failed > 0 ? 1 : 0)
