/**
 * Load test: 10.000 Transaktionen per Direct-SQLite-Insert
 * Ausführen: node scripts/loadtest-seed.mjs
 */
import { createClient } from '@libsql/client'
import { randomUUID } from 'crypto'
import { performance } from 'perf_hooks'

const db = createClient({ url: 'file:./prisma/dev.db' })

// ── Bestehende IDs laden ─────────────────────────────────────────────────────
const accountRows = (await db.execute('SELECT id FROM Account WHERE isActive = 1')).rows
const categoryRows = (await db.execute("SELECT id FROM Category WHERE isActive = 1 AND type != 'TRANSFER'")).rows

if (accountRows.length === 0) {
  console.error('Keine aktiven Konten gefunden. Bitte zuerst die App starten und Konten anlegen.')
  process.exit(1)
}
if (categoryRows.length === 0) {
  console.error('Keine aktiven Kategorien gefunden. Bitte zuerst Seed ausführen.')
  process.exit(1)
}

const accountIds = accountRows.map(r => r.id)
const categoryIds = categoryRows.map(r => r.id)

console.log(`Konten: ${accountIds.length} | Kategorien: ${categoryIds.length}`)

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────
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
]
const PAYEES = [
  null, null, null,
  'Müller GmbH', 'Schulze & Co', 'Meyer OHG', 'Schmidt KG', 'Berger AG',
]
const STATUSES = ['PENDING', 'PENDING', 'CLEARED', 'CLEARED', 'CLEARED', 'RECONCILED']
const TYPES = ['EXPENSE', 'EXPENSE', 'EXPENSE', 'INCOME']

// ── Transaktionen generieren ─────────────────────────────────────────────────
const TOTAL = 10_000
const now = Date.now()
const threeYearsMs = 3 * 365 * 24 * 60 * 60 * 1000

const rows = []
const balanceDelta = {} // accountId → delta
for (const id of accountIds) balanceDelta[id] = 0

for (let i = 0; i < TOTAL; i++) {
  const id = randomUUID()
  const accountId = pick(accountIds)
  const categoryId = Math.random() > 0.1 ? pick(categoryIds) : null
  const type = pick(TYPES)
  const amount = type === 'INCOME'
    ? rnd(500, 5000)
    : -rnd(1, 800)
  const date = new Date(now - Math.random() * threeYearsMs).toISOString()
  const description = pick(DESCRIPTIONS)
  const payee = pick(PAYEES)
  const status = pick(STATUSES)

  rows.push({ id, accountId, categoryId, type, amount, date, description, payee, status })
  balanceDelta[accountId] += amount
}

// ── Batch-Insert in Chunks von 500 ───────────────────────────────────────────
const BATCH = 500
let inserted = 0
const t0 = performance.now()

for (let start = 0; start < rows.length; start += BATCH) {
  const chunk = rows.slice(start, start + BATCH)
  const stmts = chunk.map(r => ({
    sql: `INSERT INTO "Transaction"
      (id, date, amount, description, payee, notes, accountId, categoryId,
       status, type, importHash, isReconciled, subAccountEntryId, transferToId,
       createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL, 0, NULL, NULL,
              datetime('now'), datetime('now'))`,
    args: [
      r.id, r.date, r.amount, r.description, r.payee ?? null,
      r.accountId, r.categoryId ?? null, r.status, r.type,
    ],
  }))
  await db.batch(stmts, 'write')
  inserted += chunk.length
  process.stdout.write(`\r${inserted}/${TOTAL} Transaktionen eingefügt...`)
}

// ── Account-Salden aktualisieren ─────────────────────────────────────────────
for (const [accountId, delta] of Object.entries(balanceDelta)) {
  await db.execute({
    sql: `UPDATE Account SET currentBalance = currentBalance + ? WHERE id = ?`,
    args: [delta, accountId],
  })
}

const t1 = performance.now()
console.log(`\n\nFertig! ${TOTAL} Transaktionen in ${((t1 - t0) / 1000).toFixed(2)}s eingefügt.`)
console.log('Saldo-Deltas aktualisiert.')

// ── API-Benchmark ────────────────────────────────────────────────────────────
console.log('\n── API-Benchmark (Dev-Server muss laufen auf :3000) ───────────────')
const BASE = 'http://localhost:3000'

async function bench(label, url) {
  const times = []
  for (let i = 0; i < 5; i++) {
    const s = performance.now()
    try {
      const r = await fetch(url)
      const data = await r.json()
      const ms = performance.now() - s
      times.push(ms)
      const count = Array.isArray(data) ? data.length : '?'
      if (i === 0) process.stdout.write(`  ${label}: ${count} Datensätze | `)
    } catch {
      console.log(`  ${label}: Server nicht erreichbar (${url})`)
      return
    }
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length
  const min = Math.min(...times)
  const max = Math.max(...times)
  console.log(`avg ${avg.toFixed(0)}ms  min ${min.toFixed(0)}ms  max ${max.toFixed(0)}ms`)
}

await bench('GET /api/transactions (limit=200)', `${BASE}/api/transactions?limit=200`)
await bench('GET /api/transactions (limit=50)', `${BASE}/api/transactions?limit=50`)
await bench('GET /api/transactions (search)', `${BASE}/api/transactions?search=REWE&limit=200`)
await bench('GET /api/accounts', `${BASE}/api/accounts`)
await bench('GET /api/transactions (accountId)', `${BASE}/api/transactions?accountId=${accountIds[0]}&limit=200`)

db.close()
