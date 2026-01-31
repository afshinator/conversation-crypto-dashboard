/**
 * Data route: GET returns current Blob data (for accordion); DELETE removes all.
 */
/// <reference types="node" />

import { list, del } from '@vercel/blob';
import { isAuthenticated } from '../auth/index.js';

const STORAGE_PREFIX = 'crypto';
const DATA_KEYS = [
  'global',
  'topCoins',
  'bitcoinChart',
  'trending',
  'categories',
  'coinbaseSpot',
  'krakenTicker',
  'binancePrice',
  'derived',
] as const;

async function blobRead(key: string): Promise<unknown> {
  try {
    const { blobs } = await list({ prefix: `${STORAGE_PREFIX}/`, limit: 20 });
    const target = `${STORAGE_PREFIX}/${key}.json`;
    const blob = blobs.find((b) => b.pathname === target);
    if (!blob?.url) return null;
    const res = await fetch(blob.url);
    if (!res.ok) return null;
    const text = await res.text();
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }
  if (!isAuthenticated(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const entries = await Promise.all(
      DATA_KEYS.map(async (key) => {
        const value = await blobRead(key);
        return [key, value] as const;
      })
    );
    const data: Record<string, unknown> = {};
    for (const [key, value] of entries) {
      if (value != null) data[key] = value;
    }
    return Response.json({ data }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: 'FAILED_TO_READ', message }, { status: 500 });
  }
}

export async function DELETE(request: Request): Promise<Response> {
  if (request.method !== 'DELETE') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }
  if (!isAuthenticated(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { blobs } = await list({ prefix: `${STORAGE_PREFIX}/`, limit: 30 });
    const urls = blobs.map((b) => b.url).filter(Boolean);
    if (urls.length > 0) await del(urls);
    return Response.json({ ok: true, deleted: urls.length }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: 'FAILED_TO_DELETE', message }, { status: 500 });
  }
}
