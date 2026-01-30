import { describe, it, expect } from 'vitest'
import { HttpClient, HTTP_STATUS } from '../../lib/httpClient'

describe('httpClient', () => {
  it('exports HTTP_STATUS with expected codes', () => {
    expect(HTTP_STATUS['OK-200']).toBe(200)
    expect(HTTP_STATUS['RATE_LIMITED-429']).toBe(429)
    expect(HTTP_STATUS['NETWORK_OR_CORS-0']).toBe(0)
  })

  it('HttpClient.request is a function', () => {
    expect(typeof HttpClient.request).toBe('function')
  })

  it('returns a Promise that resolves to HttpResponse shape', async () => {
    const res = await HttpClient.request<unknown>(
      'https://invalid.example.nonexistent',
      { timeout: 500 }
    )
    expect(res).toHaveProperty('isOk')
    expect(res).toHaveProperty('status')
    expect(res).toHaveProperty('data')
    expect(res).toHaveProperty('headers')
    expect(res.isOk).toBe(false)
    expect(res.status).toBe(0)
  })
})
