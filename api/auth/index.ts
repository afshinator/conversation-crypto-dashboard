/**
 * Password gate: POST login with { password }, GET check session.
 * Uses HTTP-only signed cookie. APP_PASSWORD env required.
 */
/// <reference types="node" />

import { createHmac, timingSafeEqual } from 'node:crypto';

const SESSION_COOKIE_NAME = 'session';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getSecret(): string {
  const secret = process.env.APP_PASSWORD;
  if (!secret) return '';
  return secret;
}

function base64urlEncode(buf: Buffer): string {
  return buf.toString('base64url');
}

function base64urlDecode(str: string): Buffer | null {
  try {
    return Buffer.from(str, 'base64url');
  } catch {
    return null;
  }
}

function signPayload(payload: { t: number; exp: number }): string {
  const secret = getSecret();
  const payloadStr = JSON.stringify(payload);
  const payloadB64 = base64urlEncode(Buffer.from(payloadStr, 'utf8'));
  const sig = createHmac('sha256', secret).update(payloadB64).digest();
  return `${payloadB64}.${base64urlEncode(sig)}`;
}

function verifyToken(token: string): boolean {
  const secret = getSecret();
  if (!secret) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;
  const sig = base64urlDecode(sigB64);
  if (!sig) return false;
  const expected = createHmac('sha256', secret).update(payloadB64).digest();
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return false;
  const payloadBuf = base64urlDecode(payloadB64);
  if (!payloadBuf) return false;
  let data: { t?: number; exp?: number };
  try {
    data = JSON.parse(payloadBuf.toString('utf8')) as { t?: number; exp?: number };
  } catch {
    return false;
  }
  const now = Date.now();
  return typeof data.exp === 'number' && data.exp > now;
}

function getSessionCookie(request: Request): string | null {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;)\\s*${SESSION_COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1].trim()) : null;
}

/**
 * Returns true if the request has a valid session cookie. Use from api/fetch and api/chat.
 */
export function isAuthenticated(request: Request): boolean {
  const token = getSessionCookie(request);
  return token !== null && verifyToken(token);
}

function setSessionCookie(response: Response, token: string): Response {
  const isProd = process.env.NODE_ENV === 'production';
  const maxAge = Math.floor(SESSION_MAX_AGE_MS / 1000);
  const cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isProd ? '; Secure' : ''}`;
  const newHeaders = new Headers(response.headers);
  newHeaders.append('Set-Cookie', cookie);
  return new Response(response.body, { status: response.status, headers: newHeaders });
}

export async function GET(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }
  if (!getSecret()) {
    return Response.json({ error: 'APP_PASSWORD not configured' }, { status: 500 });
  }
  if (isAuthenticated(request)) {
    return Response.json({ ok: true });
  }
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function POST(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }
  const secret = getSecret();
  if (!secret) {
    return Response.json({ error: 'APP_PASSWORD not configured' }, { status: 500 });
  }
  let body: { password?: string };
  try {
    body = (await request.json()) as { password?: string };
  } catch {
    return Response.json({ error: 'Invalid JSON. Expected { password: string }.' }, { status: 400 });
  }
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!password) {
    return Response.json({ error: 'Missing password.' }, { status: 400 });
  }
  // Constant-time compare to avoid timing leaks
  const secretBuf = Buffer.from(secret, 'utf8');
  const passwordBuf = Buffer.from(password, 'utf8');
  if (secretBuf.length !== passwordBuf.length || !timingSafeEqual(secretBuf, passwordBuf)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const now = Date.now();
  const token = signPayload({ t: now, exp: now + SESSION_MAX_AGE_MS });
  const res = Response.json({ ok: true });
  return setSessionCookie(res, token);
}
