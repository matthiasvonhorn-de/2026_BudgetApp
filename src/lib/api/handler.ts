import { ZodError } from 'zod'
import { NextResponse } from 'next/server'
import { DomainError } from './errors'

// ctx typed as unknown — Next.js App Router passes { params: Promise<...> } which
// each handler resolves itself. Using unknown here avoids any without lying about the type.
type RouteHandler = (req: Request, ctx: unknown) => Promise<NextResponse>

export function withHandler(fn: RouteHandler): RouteHandler {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx)
    } catch (e) {
      if (e instanceof ZodError)
        return NextResponse.json({ error: e.issues }, { status: 400 })
      if (e instanceof DomainError)
        return NextResponse.json({ error: e.message }, { status: e.status })
      console.error(e)
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
  }
}
