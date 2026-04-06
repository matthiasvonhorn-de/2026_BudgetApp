import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'
import { DomainError } from '@/lib/api/errors'
import { validateRegexPattern } from '@/lib/rules/validate-regex'

const ruleSchema = z.object({
  name: z.string().min(1),
  field: z.enum(['DESCRIPTION', 'PAYEE', 'AMOUNT']),
  operator: z.enum(['CONTAINS', 'STARTS_WITH', 'ENDS_WITH', 'EQUALS', 'GREATER_THAN', 'LESS_THAN', 'REGEX']),
  value: z.string().min(1),
  categoryId: z.string(),
  priority: z.number().default(0),
  isActive: z.boolean().default(true),
})

export const GET = withHandler(async () => {
  const rules = await prisma.categoryRule.findMany({
    include: { category: { select: { id: true, name: true, color: true } } },
    orderBy: [{ priority: 'desc' }, { name: 'asc' }],
  })
  return NextResponse.json(rules)
})

export const POST = withHandler(async (request: Request) => {
  const body = await request.json()
  const data = ruleSchema.parse(body)

  if (data.operator === 'REGEX') {
    const check = validateRegexPattern(data.value)
    if (!check.valid) throw new DomainError(check.error!, 400)
  }

  const rule = await prisma.categoryRule.create({
    data,
    include: { category: true },
  })
  return NextResponse.json(rule, { status: 201 })
})
