/**
 * Tests for api/fetch.ts POST handler: method check, response shape, fetch usage, data in response.
 * We stub global fetch and mock @vercel/blob (put) so no real Blob calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockPut = vi.fn()
vi.mock('@vercel/blob', () => ({
  put: (...args: unknown[]) => mockPut(...args),
}))
vi.mock('../../api/auth', () => ({
  isAuthenticated: () => true,
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
    expect(mockFetch).toHaveBeenCalledTimes(8)
    expect(mockFetch).toHaveBeenNthCalledWith(1, 'https://api.coingecko.com/api/v3/global', expect.any(Object))
    expect(mockFetch).toHaveBeenNthCalledWith(2, expect.stringContaining('coins/markets'), expect.any(Object))
    expect(mockFetch).toHaveBeenNthCalledWith(3, expect.stringContaining('bitcoin/market_chart'), expect.any(Object))
    expect(mockFetch).toHaveBeenNthCalledWith(4, 'https://api.coingecko.com/api/v3/search/trending', expect.any(Object))
    expect(mockFetch).toHaveBeenNthCalledWith(5, 'https://api.coingecko.com/api/v3/coins/categories', expect.any(Object))
    expect(mockFetch).toHaveBeenNthCalledWith(6, 'https://api.coinbase.com/v2/prices/BTC-USD/spot', expect.any(Object))
    expect(mockFetch).toHaveBeenNthCalledWith(7, 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD', expect.any(Object))
    expect(mockFetch).toHaveBeenNthCalledWith(8, 'https://api.binance-us.com/api/v3/ticker/price?symbol=BTCUSDT', expect.any(Object))
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
        { key: 'trending', status: 200, isOk: true },
        { key: 'categories', status: 200, isOk: true },
        { key: 'coinbaseSpot', status: 200, isOk: true },
        { key: 'krakenTicker', status: 200, isOk: true },
        { key: 'binancePrice', status: 200, isOk: true },
      ],
      data: {
        global: { foo: 'bar' },
        topCoins: { foo: 'bar' },
        bitcoinChart: { foo: 'bar' },
        trending: { foo: 'bar' },
        categories: { foo: 'bar' },
        coinbaseSpot: { foo: 'bar' },
        krakenTicker: { foo: 'bar' },
        binancePrice: { foo: 'bar' },
      },
    })
    expect(mockPut).toHaveBeenCalledTimes(9)
    expect(mockPut).toHaveBeenNthCalledWith(1, 'crypto/global.json', '{"foo":"bar"}', expect.any(Object))
    expect(mockPut).toHaveBeenNthCalledWith(2, 'crypto/topCoins.json', '{"foo":"bar"}', expect.any(Object))
    expect(mockPut).toHaveBeenNthCalledWith(3, 'crypto/bitcoinChart.json', '{"foo":"bar"}', expect.any(Object))
    expect(mockPut).toHaveBeenNthCalledWith(4, 'crypto/trending.json', '{"foo":"bar"}', expect.any(Object))
    expect(mockPut).toHaveBeenNthCalledWith(5, 'crypto/categories.json', '{"foo":"bar"}', expect.any(Object))
    expect(mockPut).toHaveBeenNthCalledWith(6, 'crypto/coinbaseSpot.json', '{"foo":"bar"}', expect.any(Object))
    expect(mockPut).toHaveBeenNthCalledWith(7, 'crypto/krakenTicker.json', '{"foo":"bar"}', expect.any(Object))
    expect(mockPut).toHaveBeenNthCalledWith(8, 'crypto/binancePrice.json', '{"foo":"bar"}', expect.any(Object))
    const derivedCall = mockPut.mock.calls[8]
    const derived = JSON.parse(derivedCall[1])
    expect(derived).toMatchObject({
      fromGlobal: expect.any(Object),
      fromBitcoinChart: expect.any(Object),
      fromTopCoins: expect.any(Object),
      fromDiscovery: expect.objectContaining({
        topTrendingCoins: expect.any(Array),
        topPerformingSectors: expect.any(Array),
        hypeVsMarketCapDivergence: expect.any(Boolean),
        retailMoonshotPresence: expect.any(Boolean),
      }),
      computedAt: expect.any(Number),
    })
    expect(derived).toHaveProperty('fromExchangePulse')
    expect(derived.fromExchangePulse).toBeNull()
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

  it('returns 200 with ok false when at least one request fails (partial failure)', async () => {
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
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({}) })
    const request = new Request('http://localhost/api/fetch', { method: 'POST' })
    const response = await POST(request)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(false)
    expect(body).toMatchObject({
      ok: false,
      results: [
        { key: 'global', status: 200, isOk: true },
        { key: 'topCoins', status: 200, isOk: true },
        { key: 'bitcoinChart', status: 500, isOk: false },
        { key: 'trending', status: 200, isOk: true },
        { key: 'categories', status: 200, isOk: true },
        { key: 'coinbaseSpot', status: 200, isOk: true },
        { key: 'krakenTicker', status: 200, isOk: true },
        { key: 'binancePrice', status: 200, isOk: true },
      ],
    })
  })

  it('step mode: POST with body { step: 1 } fetches one source and returns step response', async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: { total_market_cap: { usd: 1 } } }),
    })
    const request = new Request('http://localhost/api/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: 1 }),
    })
    const response = await POST(request)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      ok: true,
      step: 1,
      key: 'global',
      status: 200,
      isOk: true,
      done: false,
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith('https://api.coingecko.com/api/v3/global', expect.any(Object))
    expect(mockPut).toHaveBeenCalledTimes(1)
    expect(mockPut).toHaveBeenCalledWith('crypto/global.json', expect.any(String), expect.any(Object))
  })
})
