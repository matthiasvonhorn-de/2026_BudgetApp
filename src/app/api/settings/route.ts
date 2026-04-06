import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { withHandler } from '@/lib/api/handler'

const ALLOWED_KEYS = ['currency', 'locale'] as const

const UpdateSettingsSchema = z.record(
  z.enum(ALLOWED_KEYS),
  z.string().max(32),
)

export const GET = withHandler(async () => {
  const rows = await prisma.appSetting.findMany()
  const settings: Record<string, string> = {}
  for (const r of rows) settings[r.key] = r.value
  return NextResponse.json(settings)
})

export const PUT = withHandler(async (request: Request) => {
  const body = await request.json()
  const data = UpdateSettingsSchema.parse(body)
  await prisma.$transaction(
    Object.entries(data).map(([key, value]) =>
      prisma.appSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    )
  )
  return NextResponse.json({ success: true })
})
