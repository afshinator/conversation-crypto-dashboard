/**
 * Tests for api/data: GET returns current Blob data, DELETE removes all. Auth required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockList = vi.fn()
const mockDel = vi.fn()
vi.mock('@vercel/blob', () => ({
  list: (...args: unknown[]) => mockList(...args),
  del: (...args: unknown[]) => mockDel(...args),
}))
vi.mock('../../api/auth/index.js', () => ({
  isAuthenticated: () => true,
}))

import { GET, DELETE } from '../../api/data'

describe('api/data', () => {
  beforeEach(() => {
    mockList.mockReset()
    mockDel.mockReset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('GET returns 405 for non-GET', async () => {
    const request = new Request('http://localhost/api/data', { method: 'POST' })
    const response = await GET(request)
    expect(response.status).toBe(405)
  })

  it('GET returns 200 with data object when authenticated and blobs exist', async () => {
    mockList.mockResolvedValue({
      blobs: [
        { pathname: 'crypto/global.json', url: 'https://blob.test/global' },
        { pathname: 'crypto/derived.json', url: 'https://blob.test/derived' },
      ],
    })
    const realFetch = globalThis.fetch
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('global')) return Promise.resolve({ ok: true, text: () => Promise.resolve('{"foo":1}') } as Response)
        if (url.includes('derived')) return Promise.resolve({ ok: true, text: () => Promise.resolve('{"computedAt":123}') } as Response)
        return Promise.resolve({ ok: false } as Response)
      })
    )
    const request = new Request('http://localhost/api/data', { method: 'GET' })
    const response = await GET(request)
    vi.stubGlobal('fetch', realFetch)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toHaveProperty('data')
    expect(typeof body.data).toBe('object')
  })

  it('DELETE returns 405 for non-DELETE', async () => {
    const request = new Request('http://localhost/api/data', { method: 'GET' })
    const response = await DELETE(request)
    expect(response.status).toBe(405)
  })

  it('DELETE returns 200 and calls del when authenticated', async () => {
    mockList.mockResolvedValue({
      blobs: [
        { pathname: 'crypto/global.json', url: 'https://blob.test/global' },
      ],
    })
    mockDel.mockResolvedValue(undefined)
    const request = new Request('http://localhost/api/data', { method: 'DELETE' })
    const response = await DELETE(request)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ ok: true, deleted: 1 })
    expect(mockDel).toHaveBeenCalledWith(['https://blob.test/global'])
  })
})
