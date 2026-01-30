/**
 * Tests for api/fetch.ts POST handler: method check, response shape, fetch usage, data in response.
 * We stub global fetch and mock @vercel/blob (put) so no real Blob calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockPut = vi.fn()
vi.mock('@vercel/blob', () => ({
  put: (...args: unknown[]) => mockPut(...args),
}))

import { POST } from '../../api/fetch'

const realFetch = globalThis.fetch

describe('api/fetch POST', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    mockPut.mockResolvedValue(undefined)
    process.env.PAUSE_MS_BETWEEN_SAME_VENDOR = '0'
    process.env.BLOB_READ_WRITE_TOKEN = 'test-token'
  })
  afterEach(() => {
    vi.stubGlobal('fetch', realFetch)
    mockPut.mockReset()
    delete process.env.PAUSE_MS_BETWEEN_SAME_VENDOR
    delete process.env.BLOB_READ_WRITE_TOKEN
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
      persistEnabled: true,
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
    expect(mockPut).toHaveBeenCalledTimes(4)
    expect(mockPut).toHaveBeenNthCalledWith(1, 'crypto/global.json', '{"foo":"bar"}', expect.any(Object))
    expect(mockPut).toHaveBeenNthCalledWith(2, 'crypto/topCoins.json', '{"foo":"bar"}', expect.any(Object))
    expect(mockPut).toHaveBeenNthCalledWith(3, 'crypto/bitcoinChart.json', '{"foo":"bar"}', expect.any(Object))
    const derivedCall = mockPut.mock.calls[3]
    const derived = JSON.parse(derivedCall[1])
    expect(derived).toMatchObject({
      fromGlobal: expect.any(Object),
      fromBitcoinChart: expect.any(Object),
      fromTopCoins: expect.any(Object),
      computedAt: expect.any(Number),
    })
  })

  it('skips persist and returns persistSkipped when BLOB_READ_WRITE_TOKEN is not set', async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN
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
      persistEnabled: true,
      persistSkipped: true,
      persistSkipReason: expect.stringContaining('BLOB_READ_WRITE_TOKEN'),
    })
    expect(mockPut).not.toHaveBeenCalled()
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
