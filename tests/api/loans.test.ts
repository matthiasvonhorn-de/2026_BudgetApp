import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { GET, POST } from '@/app/api/loans/route'
import { GET as GET_BY_ID, PUT, DELETE } from '@/app/api/loans/[id]/route'
import { seedDatabase, SEED } from './seed'
import { createRequest, createParams } from './helpers'
import { prisma } from '@/lib/prisma'

beforeAll(async () => {
  await seedDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

afterEach(async () => {
  await prisma.loanPayment.deleteMany()
  await prisma.loan.deleteMany()
})

const annuityLoan = {
  name: 'Wohnungskredit',
  loanType: 'ANNUITAETENDARLEHEN' as const,
  principal: 100000,
  interestRate: 0.036,
  initialRepaymentRate: 0.024,
  termMonths: 360,
  startDate: '2025-01-01',
  accountId: SEED.accounts.girokonto,
}

const installmentLoan = {
  name: 'Autokredit',
  loanType: 'RATENKREDIT' as const,
  principal: 12000,
  interestRate: 0.06,
  termMonths: 12,
  startDate: '2025-01-01',
}

describe('POST /api/loans', () => {
  it('creates an Annuitaetendarlehen with payment schedule', async () => {
    const res = await POST(createRequest('POST', '/api/loans', annuityLoan))
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.name).toBe('Wohnungskredit')
    expect(data.loanType).toBe('ANNUITAETENDARLEHEN')
    expect(data.principal).toBe(100000)

    // Check payment schedule was created (may be less than 360 if loan pays off early)
    const payments = await prisma.loanPayment.findMany({ where: { loanId: data.id }, orderBy: { periodNumber: 'asc' } })
    expect(payments.length).toBeGreaterThan(0)
    expect(payments.length).toBeLessThanOrEqual(360)
    expect(payments[0].periodNumber).toBe(1)
    expect(payments[0].scheduledInterest).toBe(300) // 100000 * 0.036/12
  })

  it('creates a Ratenkredit', async () => {
    const res = await POST(createRequest('POST', '/api/loans', installmentLoan))
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.loanType).toBe('RATENKREDIT')

    const payments = await prisma.loanPayment.findMany({ where: { loanId: data.id } })
    expect(payments.length).toBe(12)
    // Fixed principal = 12000 / 12 = 1000
    expect(payments[0].scheduledPrincipal).toBe(1000)
  })

  it('marks payments as paid when paidUntil is set', async () => {
    const res = await POST(createRequest('POST', '/api/loans', {
      ...installmentLoan,
      paidUntil: '2025-06-01',
    }))
    const data = await res.json()

    const paidPayments = await prisma.loanPayment.findMany({
      where: { loanId: data.id, paidAt: { not: null } },
    })
    expect(paidPayments.length).toBeGreaterThan(0)
    expect(paidPayments.length).toBeLessThanOrEqual(6)
  })

  it('rejects missing required fields', async () => {
    const res = await POST(createRequest('POST', '/api/loans', { name: 'Bad' }))
    expect(res.status).toBe(400)
  })
})

describe('GET /api/loans', () => {
  it('returns active loans with stats', async () => {
    await POST(createRequest('POST', '/api/loans', installmentLoan))

    const res = await GET(createRequest('GET', '/api/loans'))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.length).toBeGreaterThanOrEqual(1)
    expect(data[0].stats).toBeDefined()
    expect(data[0].stats.totalPeriods).toBe(12)
    expect(data[0].stats.currentBalance).toBe(12000) // nothing paid yet
  })

  it('excludes inactive loans', async () => {
    const createRes = await POST(createRequest('POST', '/api/loans', installmentLoan))
    const loan = await createRes.json()
    await prisma.loan.update({ where: { id: loan.id }, data: { isActive: false } })

    const res = await GET(createRequest('GET', '/api/loans'))
    const data = await res.json()
    const found = data.find((l: { id: string }) => l.id === loan.id)
    expect(found).toBeUndefined()
  })
})

describe('GET /api/loans/[id]', () => {
  it('returns loan with payments and stats', async () => {
    const createRes = await POST(createRequest('POST', '/api/loans', installmentLoan))
    const loan = await createRes.json()

    const res = await GET_BY_ID(
      createRequest('GET', `/api/loans/${loan.id}`),
      createParams({ id: loan.id }),
    )
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.name).toBe('Autokredit')
    expect(data.payments).toBeDefined()
    expect(data.payments.length).toBe(12)
    expect(data.stats.totalPeriods).toBe(12)
  })

  it('returns 404 for unknown id', async () => {
    const res = await GET_BY_ID(
      createRequest('GET', '/api/loans/nonexistent'),
      createParams({ id: 'nonexistent' }),
    )
    expect(res.status).toBe(404)
  })
})

describe('PUT /api/loans/[id]', () => {
  it('updates metadata without recalculating schedule', async () => {
    const createRes = await POST(createRequest('POST', '/api/loans', installmentLoan))
    const loan = await createRes.json()

    const res = await PUT(
      createRequest('PUT', `/api/loans/${loan.id}`, { name: 'Updated Name' }),
      createParams({ id: loan.id }),
    )
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.name).toBe('Updated Name')
  })

  it('recalculates schedule when financial params change', async () => {
    const createRes = await POST(createRequest('POST', '/api/loans', installmentLoan))
    const loan = await createRes.json()

    const res = await PUT(
      createRequest('PUT', `/api/loans/${loan.id}`, {
        principal: 24000,
        termMonths: 24,
      }),
      createParams({ id: loan.id }),
    )
    expect(res.status).toBe(200)

    const payments = await prisma.loanPayment.findMany({ where: { loanId: loan.id } })
    expect(payments.length).toBe(24)
    expect(payments[0].scheduledPrincipal).toBe(1000) // 24000 / 24
  })
})

describe('DELETE /api/loans/[id]', () => {
  it('soft-deletes a loan', async () => {
    const createRes = await POST(createRequest('POST', '/api/loans', installmentLoan))
    const loan = await createRes.json()

    const res = await DELETE(
      createRequest('DELETE', `/api/loans/${loan.id}`),
      createParams({ id: loan.id }),
    )
    expect(res.status).toBe(200)

    const deleted = await prisma.loan.findUnique({ where: { id: loan.id } })
    expect(deleted!.isActive).toBe(false)
  })
})
