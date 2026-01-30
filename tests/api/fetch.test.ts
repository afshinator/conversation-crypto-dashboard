/**
 * Tests for api/fetch.ts POST handler: method check, response shape, fetch usage, data in response.
 * Handler is self-contained; we stub global fetch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from '../../api/fetch'

const realFetch = globalThis.fetch

describe('api/fetch POST', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    process.env.PAUSE_MS_BETWEEN_SAME_VENDOR = '0'
  })
  afterEach(() => {
    vi.stubGlobal('fetch', realFetch)
    delete process.env.PAUSE_MS_BETWEEN_SAME_VENDOR
  })

  it('returns 405 and Method not allowed for non-POST', async () => {
    const request = new Request('http://localhost/api/fetch', { method: 'GET' })
    const response = await POST(request)
    expect(response.status).toBe(405)
    expect(await response.json()).toEqual({ error: 'Method not allowed' })
  })

  it('returns 405 for PUT', async () => {
    const request = new Request('http://localhost/api/fetch', { method: 'PUT' })
    const response = await POST(request)
    expect(response.status).toBe(405)
  })

  it('calls fetch for each FETCH_SOURCES entry with correct url', async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    })
    const request = new Request('http://localhost/api/fetch', { method: 'POST' })
    await POST(request)
    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(mockFetch).toHaveBeenNthCalledWith(1, 'https://api.coingecko.com/api/v3/global', expect.any(Object))
    expect(mockFetch).toHaveBeenNthCalledWith(2, expect.stringContaining('coins/markets'), expect.any(Object))
    expect(mockFetch).toHaveBeenNthCalledWith(3, expect.stringContaining('bitcoin/market_chart'), expect.any(Object))
  })

  it('returns 200 with ok, persistEnabled, results and data when all requests succeed', async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ foo: 'bar' }),
    })
    const request = new Request('http://localhost/api/fetch', { method: 'POST' })
    const response = await POST(request)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      ok: true,
      persistEnabled: false,
      results: [
        { key: 'global', status: 200, isOk: true },
        { key: 'topCoins', status: 200, isOk: true },
        { key: 'bitcoinChart', status: 200, isOk: true },
      ],
      data: {
        global: { foo: 'bar' },
        topCoins: { foo: 'bar' },
        bitcoinChart: { foo: 'bar' },
      },
    })
  })

  it('returns 500 with ok false when at least one request fails', async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ a: 1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve(null),
      })
    const request = new Request('http://localhost/api/fetch', { method: 'POST' })
    const response = await POST(request)
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body).toMatchObject({
      ok: false,
      results: [
        { key: 'global', status: 200, isOk: true },
        { key: 'topCoins', status: 200, isOk: true },
        { key: 'bitcoinChart', status: 500, isOk: false },
      ],
    })
  })
})
