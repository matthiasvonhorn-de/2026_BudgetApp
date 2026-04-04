import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withHandler } from '@/lib/api/handler'

export const GET = withHandler(async () => {
  const rows = await prisma.appSetting.findMany()
  const settings: Record<string, string> = {}
  for (const r of rows) settings[r.key] = r.value
  return NextResponse.json(settings)
})

export const PUT = withHandler(async (request: Request) => {
  const body = await request.json() as Record<string, string>
  await prisma.$transaction(
    Object.entries(body).map(([key, value]) =>
      prisma.appSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    )
  )
  return NextResponse.json({ success: true })
})
