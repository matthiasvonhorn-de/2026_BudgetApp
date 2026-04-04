import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'
import { DomainError } from '@/lib/api/errors'

const schema = z.object({
  ids: z.array(z.string()).min(1),
})

export const PATCH = withHandler(async (request: Request) => {
  const body = await request.json()
  const { ids } = schema.parse(body)

  const count = await prisma.account.count({ where: { id: { in: ids } } })
  if (count !== ids.length) {
    throw new DomainError('Ungültige Konto-IDs', 400)
  }

  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.account.update({ where: { id }, data: { sortOrder: index } })
    )
  )

  return new NextResponse(null, { status: 200 })
})
