import { describe, expect, it, vi, afterEach } from 'vitest'
import { handler } from '../../../netlify/functions/claude-proxy'

describe('SEC-01: Claude proxy is disabled until secure implementation', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('rejects unauthenticated POST with 503 and does not call external API', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await handler({ httpMethod: 'POST' })
    expect(result.statusCode).toBe(503)
    expect(JSON.parse(result.body).code).toBe('AI_SUGGESTIONS_DISABLED')
    expect(result.headers['Cache-Control']).toBe('no-store')
    expect(result.headers).not.toHaveProperty('Access-Control-Allow-Origin')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects other HTTP methods and never enables permissive CORS', async () => {
    const result = await handler({ httpMethod: 'GET' })
    expect(result.statusCode).toBe(405)
    expect(result.headers).not.toHaveProperty('Access-Control-Allow-Origin')
  })

  it('preflight has no wildcard CORS and makes no network call', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const result = await handler({ httpMethod: 'OPTIONS' })
    expect(result.statusCode).toBe(204)
    expect(result.headers).not.toHaveProperty('Access-Control-Allow-Origin')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
