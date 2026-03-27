import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'

const adapter = new PrismaLibSql({ url: 'file:./prisma/dev.db' })
const prisma = new PrismaClient({ adapter })

async function main() {
  const einnahmen = await prisma.categoryGroup.create({
    data: { name: 'Einnahmen', sortOrder: 0 },
  })
  const fixkosten = await prisma.categoryGroup.create({
    data: { name: 'Fixkosten', sortOrder: 1 },
  })
  const lebenshaltung = await prisma.categoryGroup.create({
    data: { name: 'Lebenshaltung', sortOrder: 2 },
  })
  const freizeit = await prisma.categoryGroup.create({
    data: { name: 'Freizeit', sortOrder: 3 },
  })

  await prisma.category.createMany({
    data: [
      { name: 'Gehalt', type: 'INCOME', color: '#10b981', groupId: einnahmen.id, sortOrder: 1 },
      { name: 'Nebeneinkommen', type: 'INCOME', color: '#34d399', groupId: einnahmen.id, sortOrder: 2 },
      { name: 'Sonstige Einnahmen', type: 'INCOME', color: '#6ee7b7', groupId: einnahmen.id, sortOrder: 3 },
      { name: 'Miete', type: 'EXPENSE', color: '#6366f1', groupId: fixkosten.id, sortOrder: 1 },
      { name: 'Strom & Gas', type: 'EXPENSE', color: '#8b5cf6', groupId: fixkosten.id, sortOrder: 2 },
      { name: 'Internet & Telefon', type: 'EXPENSE', color: '#a78bfa', groupId: fixkosten.id, sortOrder: 3 },
      { name: 'Versicherungen', type: 'EXPENSE', color: '#c4b5fd', groupId: fixkosten.id, sortOrder: 4 },
      { name: 'Abonnements', type: 'EXPENSE', color: '#7c3aed', groupId: fixkosten.id, sortOrder: 5 },
      { name: 'Lebensmittel', type: 'EXPENSE', color: '#f59e0b', groupId: lebenshaltung.id, sortOrder: 1 },
      { name: 'Restaurant & Café', type: 'EXPENSE', color: '#fbbf24', groupId: lebenshaltung.id, sortOrder: 2 },
      { name: 'Transport', type: 'EXPENSE', color: '#f97316', groupId: lebenshaltung.id, sortOrder: 3 },
      { name: 'Gesundheit', type: 'EXPENSE', color: '#ef4444', groupId: lebenshaltung.id, sortOrder: 4 },
      { name: 'Kleidung', type: 'EXPENSE', color: '#ec4899', groupId: lebenshaltung.id, sortOrder: 5 },
      { name: 'Hobbys', type: 'EXPENSE', color: '#3b82f6', groupId: freizeit.id, sortOrder: 1 },
      { name: 'Urlaub & Reisen', type: 'EXPENSE', color: '#60a5fa', groupId: freizeit.id, sortOrder: 2 },
      { name: 'Sport', type: 'EXPENSE', color: '#93c5fd', groupId: freizeit.id, sortOrder: 3 },
      { name: 'Unterhaltung', type: 'EXPENSE', color: '#a3e635', groupId: freizeit.id, sortOrder: 4 },
      { name: 'Umbuchung', type: 'TRANSFER', color: '#94a3b8', sortOrder: 0 },
    ],
  })

  console.log('Seed abgeschlossen!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
