/**
 * Tests for api/chat.ts: method check, validation, no-data response, success with mocked Blob + LLM.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockList = vi.fn()
vi.mock('@vercel/blob', () => ({
  list: (...args: unknown[]) => mockList(...args),
}))

const mockGenerateText = vi.fn()
vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}))
vi.mock('../../api/auth', () => ({
  isAuthenticated: () => true,
}))

import { POST } from '../../api/chat'

describe('api/chat POST', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key'
    mockGenerateText.mockResolvedValue({
      text: 'Mocked reply.',
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 120,
      },
    })
  })
  afterEach(() => {
    delete process.env.OPENAI_API_KEY
    mockList.mockReset()
    mockGenerateText.mockReset()
  })

  it('returns 405 for non-POST', async () => {
    const request = new Request('http://localhost/api/chat', { method: 'GET' })
    const response = await POST(request)
    expect(response.status).toBe(405)
    expect(await response.json()).toEqual({ error: 'Method not allowed' })
  })

  it('returns 400 for missing or empty message', async () => {
    const req1 = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const res1 = await POST(req1)
    expect(res1.status).toBe(400)
    expect((await res1.json()).error).toMatch(/message/i)

    const req2 = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '   ' }),
    })
    const res2 = await POST(req2)
    expect(res2.status).toBe(400)
  })

  it('returns 500 when OPENAI_API_KEY is not set', async () => {
    delete process.env.OPENAI_API_KEY
    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'What is BTC dominance?' }),
    })
    const response = await POST(request)
    expect(response.status).toBe(500)
    expect((await response.json()).error).toMatch(/OPENAI_API_KEY/i)
  })

  it('returns 200 with error message when no data in Blob', async () => {
    mockList.mockResolvedValue({ blobs: [] })
    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'What is BTC dominance?' }),
    })
    const response = await POST(request)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.text).toBeNull()
    expect(body.error).toMatch(/fetch data first/i)
  })

  it('returns 200 with text when Blob has data and LLM returns', async () => {
    mockList.mockResolvedValue({
      blobs: [
        { pathname: 'crypto/derived.json', url: 'https://blob.test/derived' },
        { pathname: 'crypto/global.json', url: 'https://blob.test/global' },
        { pathname: 'crypto/topCoins.json', url: 'https://blob.test/topCoins' },
      ],
    })
    const realFetch = globalThis.fetch
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('derived')) {
          return Promise.resolve({
            ok: true,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  fromGlobal: { btcDominancePercent: 52 },
                  fromBitcoinChart: {},
                  fromTopCoins: {},
                })
              ),
          } as Response)
        }
        if (url.includes('global')) {
          return Promise.resolve({ ok: true, text: () => Promise.resolve('{}') } as Response)
        }
        if (url.includes('topCoins')) {
          return Promise.resolve({ ok: true, text: () => Promise.resolve('[]') } as Response)
        }
        return Promise.resolve({ ok: false } as Response)
      })
    )
    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'What is BTC dominance?' }),
    })
    const response = await POST(request)
    vi.stubGlobal('fetch', realFetch)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.text).toBe('Mocked reply.')
    expect(body.usage).toEqual({ promptTokens: 100, completionTokens: 20, totalTokens: 120 })
    expect(mockGenerateText).toHaveBeenCalledTimes(1)
    expect(mockGenerateText.mock.calls[0][0].prompt).toBe('What is BTC dominance?')
    expect(mockGenerateText.mock.calls[0][0].system).toMatch(/crypto|data|analyst/i)
  })
})
