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

  it('malicious POSTs (arbitrary model/messages, forged auth, bad JSON, huge body) never reach Anthropic or leak the key', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('CLAUDE_API_KEY', 'sk-ant-TEST-SHOULD-NEVER-LEAK')
    try {
      const cuerpos = [
        JSON.stringify({ model: 'claude-opus-4-5', max_tokens: 100000, messages: [{ role: 'user', content: 'x' }] }),
        '{not json',
        'x'.repeat(2_000_000),
        undefined,
      ]
      for (const body of cuerpos) {
        const result = await handler({
          httpMethod: 'POST',
          body,
          headers: { origin: 'https://evil.example', authorization: 'Bearer forged' },
        } as never)
        expect(result.statusCode).toBe(503)
        expect(result.body).not.toContain('sk-ant')
        expect(JSON.stringify(result.headers)).not.toContain('sk-ant')
        expect(result.headers).not.toHaveProperty('Access-Control-Allow-Origin')
      }
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each(['GET', 'PUT', 'PATCH', 'DELETE', 'HEAD', undefined])('method %s → 405 without network call', async (httpMethod) => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const result = await handler({ httpMethod })
    expect(result.statusCode).toBe(405)
    expect(result.headers).not.toHaveProperty('Access-Control-Allow-Origin')
    expect(fetchMock).not.toHaveBeenCalled()
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
