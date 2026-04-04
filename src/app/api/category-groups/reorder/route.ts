import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'

export const PATCH = withHandler(async (request: Request) => {
  const body = await request.json()
  const items = z.array(z.object({ id: z.string(), sortOrder: z.number() })).parse(body)
  await Promise.all(
    items.map(({ id, sortOrder }) =>
      prisma.categoryGroup.update({ where: { id }, data: { sortOrder } })
    )
  )
  return NextResponse.json({ success: true })
})
