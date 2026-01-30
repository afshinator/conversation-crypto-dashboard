/**
 * Tests for api/auth: GET check, POST login (valid/invalid), 401 when no cookie.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET, POST } from '../../api/auth'

describe('api/auth', () => {
  beforeEach(() => {
    process.env.APP_PASSWORD = 'secret123'
  })
  afterEach(() => {
    delete process.env.APP_PASSWORD
  })

  it('GET returns 401 when no cookie', async () => {
    const request = new Request('http://localhost/api/auth', { method: 'GET' })
    const response = await GET(request)
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ error: 'Unauthorized' })
  })

  it('GET returns 500 when APP_PASSWORD not set', async () => {
    delete process.env.APP_PASSWORD
    const request = new Request('http://localhost/api/auth', { method: 'GET' })
    const response = await GET(request)
    expect(response.status).toBe(500)
    expect((await response.json()).error).toMatch(/APP_PASSWORD/i)
  })

  it('POST returns 400 when body is not JSON', async () => {
    const request = new Request('http://localhost/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('POST returns 400 when password is missing', async () => {
    const request = new Request('http://localhost/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
    expect((await response.json()).error).toMatch(/password/i)
  })

  it('POST returns 401 when password is wrong', async () => {
    const request = new Request('http://localhost/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrong' }),
    })
    const response = await POST(request)
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ error: 'Unauthorized' })
  })

  it('POST returns 200 and sets Set-Cookie when password is correct', async () => {
    const request = new Request('http://localhost/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'secret123' }),
    })
    const response = await POST(request)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true })
    const setCookie = response.headers.get('Set-Cookie')
    expect(setCookie).toBeTruthy()
    expect(setCookie).toMatch(/session=/)
    expect(setCookie).toMatch(/HttpOnly/)
  })
})
