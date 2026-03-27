import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  field: z.enum(['DESCRIPTION', 'PAYEE', 'AMOUNT']).optional(),
  operator: z.enum(['CONTAINS', 'STARTS_WITH', 'ENDS_WITH', 'EQUALS', 'GREATER_THAN', 'LESS_THAN', 'REGEX']).optional(),
  value: z.string().min(1).optional(),
  categoryId: z.string().optional(),
  priority: z.number().optional(),
  isActive: z.boolean().optional(),
})

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = await request.json()
    const data = updateSchema.parse(body)
    const rule = await prisma.categoryRule.update({
      where: { id },
      data,
      include: { category: true },
    })
    return NextResponse.json(rule)
  } catch {
    return NextResponse.json({ error: 'Fehler' }, { status: 500 })
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    await prisma.categoryRule.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Fehler' }, { status: 500 })
  }
}
