import { prisma } from '@/lib/prisma'
import { cleanAll } from './helpers'

/**
 * Seed data IDs — deterministic so tests can reference them.
 * Using fixed CUIDs avoids needing to capture return values.
 */
export const SEED = {
  accounts: {
    girokonto: 'seed-acc-girokonto',
    sparkonto: 'seed-acc-sparkonto',
  },
  groups: {
    giroFixkosten: 'seed-grp-giro-fix',
    giroVariable: 'seed-grp-giro-var',
    sparFixkosten: 'seed-grp-spar-fix',
    sparVariable: 'seed-grp-spar-var',
  },
  categories: {
    miete: 'seed-cat-miete',
    lebensmittel: 'seed-cat-lebensmittel',
    gehalt: 'seed-cat-gehalt',
    sonstiges: 'seed-cat-sonstiges',
  },
  csvProfiles: {
    deutscheBank: 'seed-csv-deutsche-bank',
  },
} as const

/**
 * Insert all seed data. Call this in beforeAll of each test file.
 * Idempotent: calls cleanAll() first to avoid duplicates.
 */
export async function seedDatabase() {
  await cleanAll()

  // --- Accounts ---
  await prisma.account.createMany({
    data: [
      {
        id: SEED.accounts.girokonto,
        name: 'Girokonto',
        type: 'CHECKING',
        currentBalance: 1000,
        sortOrder: 0,
        color: '#3b82f6',
      },
      {
        id: SEED.accounts.sparkonto,
        name: 'Sparkonto',
        type: 'SAVINGS',
        currentBalance: 5000,
        sortOrder: 1,
        color: '#10b981',
      },
    ],
  })

  // --- Category Groups (2 per account) ---
  await prisma.categoryGroup.createMany({
    data: [
      {
        id: SEED.groups.giroFixkosten,
        name: 'Fixkosten',
        sortOrder: 0,
        accountId: SEED.accounts.girokonto,
      },
      {
        id: SEED.groups.giroVariable,
        name: 'Variable Kosten',
        sortOrder: 1,
        accountId: SEED.accounts.girokonto,
      },
      {
        id: SEED.groups.sparFixkosten,
        name: 'Fixkosten',
        sortOrder: 0,
        accountId: SEED.accounts.sparkonto,
      },
      {
        id: SEED.groups.sparVariable,
        name: 'Variable Kosten',
        sortOrder: 1,
        accountId: SEED.accounts.sparkonto,
      },
    ],
  })

  // --- Categories ---
  await prisma.category.createMany({
    data: [
      {
        id: SEED.categories.miete,
        name: 'Miete',
        type: 'EXPENSE',
        groupId: SEED.groups.giroFixkosten,
        sortOrder: 0,
        color: '#ef4444',
      },
      {
        id: SEED.categories.lebensmittel,
        name: 'Lebensmittel',
        type: 'EXPENSE',
        groupId: SEED.groups.giroVariable,
        sortOrder: 0,
        color: '#f59e0b',
      },
      {
        id: SEED.categories.gehalt,
        name: 'Gehalt',
        type: 'INCOME',
        groupId: SEED.groups.giroFixkosten,
        sortOrder: 1,
        color: '#22c55e',
      },
      {
        id: SEED.categories.sonstiges,
        name: 'Sonstiges',
        type: 'EXPENSE',
        groupId: SEED.groups.giroVariable,
        sortOrder: 1,
        color: '#6366f1',
      },
    ],
  })

  // --- CSV Profile ---
  await prisma.csvProfile.create({
    data: {
      id: SEED.csvProfiles.deutscheBank,
      name: 'Deutsche Bank',
      delimiter: ';',
      dateFormat: 'DD.MM.YYYY',
      encoding: 'UTF-8',
      skipRows: 4,
      columnMapping: JSON.stringify({
        date: 'Buchungstag',
        amount: 'Betrag',
        description: 'Verwendungszweck',
        payee: 'Beguenstigter/Zahlungspflichtiger',
      }),
      amountFormat: 'DE',
    },
  })

  // --- App Settings (upsert to avoid unique constraint issues) ---
  for (const { key, value } of [
    { key: 'currency', value: 'EUR' },
    { key: 'locale', value: 'de-DE' },
  ]) {
    await prisma.appSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    })
  }
}
