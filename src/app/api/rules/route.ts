import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const ruleSchema = z.object({
  name: z.string().min(1),
  field: z.enum(['DESCRIPTION', 'PAYEE', 'AMOUNT']),
  operator: z.enum(['CONTAINS', 'STARTS_WITH', 'ENDS_WITH', 'EQUALS', 'GREATER_THAN', 'LESS_THAN', 'REGEX']),
  value: z.string().min(1),
  categoryId: z.string(),
  priority: z.number().default(0),
  isActive: z.boolean().default(true),
})

export async function GET() {
  try {
    const rules = await prisma.categoryRule.findMany({
      include: { category: { select: { id: true, name: true, color: true } } },
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
    })
    return NextResponse.json(rules)
  } catch {
    return NextResponse.json({ error: 'Fehler' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const data = ruleSchema.parse(body)
    const rule = await prisma.categoryRule.create({
      data,
      include: { category: true },
    })
    return NextResponse.json(rule, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: 'Fehler' }, { status: 500 })
  }
}
