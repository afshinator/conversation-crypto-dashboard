/**
 * Tests for lib/storage.ts: write/read/deleteAll with mocked @vercel/blob.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockPut = vi.fn()
const mockList = vi.fn()
const mockDel = vi.fn()
vi.mock('@vercel/blob', () => ({
  put: (...args: unknown[]) => mockPut(...args),
  list: (...args: unknown[]) => mockList(...args),
  del: (...args: unknown[]) => mockDel(...args),
}))

import { write, read, deleteAll, STORAGE_KEYS } from '../../lib/storage'

describe('storage', () => {
  const realFetch = globalThis.fetch
  beforeEach(() => {
    mockPut.mockReset()
    mockList.mockReset()
    mockDel.mockReset()
  })
  afterEach(() => {
    vi.stubGlobal('fetch', realFetch)
  })

  it('exports STORAGE_KEYS with expected keys', () => {
    expect(STORAGE_KEYS).toContain('global')
    expect(STORAGE_KEYS).toContain('topCoins')
    expect(STORAGE_KEYS).toContain('bitcoinChart')
    expect(STORAGE_KEYS).toContain('derived')
    expect(STORAGE_KEYS).toHaveLength(4)
  })

  it('write calls put with pathname and JSON body', async () => {
    mockPut.mockResolvedValue(undefined)
    await write('global', { foo: 1 })
    expect(mockPut).toHaveBeenCalledTimes(1)
    expect(mockPut).toHaveBeenCalledWith(
      'crypto/global.json',
      '{"foo":1}',
      expect.objectContaining({
        access: 'public',
        allowOverwrite: true,
        contentType: 'application/json',
      })
    )
  })

  it('read returns null when list finds no blob', async () => {
    mockList.mockResolvedValue({ blobs: [] })
    const result = await read('global')
    expect(result).toBeNull()
    expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ prefix: 'crypto/' }))
  })

  it('read returns parsed JSON when blob exists', async () => {
    mockList.mockResolvedValue({
      blobs: [{ pathname: 'crypto/global.json', url: 'https://store.example/crypto/global.json' }],
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('{"total_market_cap_usd":1000000}'),
    }))
    const result = await read<{ total_market_cap_usd: number }>('global')
    expect(result).toEqual({ total_market_cap_usd: 1000000 })
  })

  it('deleteAll calls list then del with blob urls', async () => {
    mockList.mockResolvedValue({
      blobs: [
        { pathname: 'crypto/global.json', url: 'https://x.com/global.json' },
        { pathname: 'crypto/derived.json', url: 'https://x.com/derived.json' },
      ],
    })
    mockDel.mockResolvedValue(undefined)
    await deleteAll()
    expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ prefix: 'crypto/' }))
    expect(mockDel).toHaveBeenCalledWith(['https://x.com/global.json', 'https://x.com/derived.json'])
  })
})
