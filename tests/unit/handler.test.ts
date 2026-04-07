import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DomainError } from '@/lib/api/errors'

// Mock NextResponse before importing handler
vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => {
      return {
        status: init?.status ?? 200,
        json: async () => body,
      }
    },
  },
}))

// Import after mock is defined
import { withHandler } from '@/lib/api/handler'

// We need ZodError — import from zod
import { z } from 'zod'

describe('DomainError', () => {
  it('creates error with message and status 400', () => {
    const err = new DomainError('Bad request', 400)
    expect(err.message).toBe('Bad request')
    expect(err.status).toBe(400)
    expect(err.name).toBe('DomainError')
  })

  it('creates error with status 404', () => {
    const err = new DomainError('Not found', 404)
    expect(err.status).toBe(404)
  })

  it('creates error with status 409', () => {
    const err = new DomainError('Conflict', 409)
    expect(err.status).toBe(409)
  })

  it('creates error with status 422', () => {
    const err = new DomainError('Unprocessable', 422)
    expect(err.status).toBe(422)
  })

  it('is an instance of Error', () => {
    const err = new DomainError('Test', 400)
    expect(err).toBeInstanceOf(Error)
  })
})

describe('withHandler', () => {
  const mockRequest = new Request('http://test/api/test')

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the handler result on success', async () => {
    const handler = withHandler(async () => {
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ data: 'ok' })
    })

    const res = await handler(mockRequest, {})
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ data: 'ok' })
  })

  it('catches ZodError and returns 400 with issues', async () => {
    const schema = z.object({
      name: z.string().min(1),
      age: z.number(),
    })

    const handler = withHandler(async () => {
      schema.parse({ name: '', age: 'not-a-number' }) // Will throw ZodError
      throw new Error('Should not reach here')
    })

    const res = await handler(mockRequest, {})
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toBeInstanceOf(Array)
    expect(body.error.length).toBeGreaterThan(0)
    // Each issue should have path and message
    for (const issue of body.error) {
      expect(issue).toHaveProperty('path')
      expect(issue).toHaveProperty('message')
    }
  })

  it('catches DomainError and returns correct status', async () => {
    const handler = withHandler(async () => {
      throw new DomainError('Account not found', 404)
    })

    const res = await handler(mockRequest, {})
    const body = await res.json()
    expect(res.status).toBe(404)
    expect(body.error).toBe('Account not found')
  })

  it('catches DomainError with 409 status', async () => {
    const handler = withHandler(async () => {
      throw new DomainError('Duplicate entry', 409)
    })

    const res = await handler(mockRequest, {})
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.error).toBe('Duplicate entry')
  })

  it('catches unknown errors and returns 500', async () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const handler = withHandler(async () => {
      throw new Error('Unexpected database error')
    })

    const res = await handler(mockRequest, {})
    const body = await res.json()
    expect(res.status).toBe(500)
    expect(body.error).toBe('Internal Server Error')
    expect(consoleSpy).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('catches non-Error throws and returns 500', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const handler = withHandler(async () => {
      throw 'string error'
    })

    const res = await handler(mockRequest, {})
    const body = await res.json()
    expect(res.status).toBe(500)
    expect(body.error).toBe('Internal Server Error')

    consoleSpy.mockRestore()
  })

  it('passes request and context to the wrapped handler', async () => {
    const spy = vi.fn(async () => {
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ ok: true })
    })

    const handler = withHandler(spy)
    const ctx = { params: Promise.resolve({ id: '123' }) }
    await handler(mockRequest, ctx)

    expect(spy).toHaveBeenCalledWith(mockRequest, ctx)
  })
})
