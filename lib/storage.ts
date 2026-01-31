/**
 * Storage helper for crypto fetch/chat data. Uses Vercel Blob.
 * Env: BLOB_READ_WRITE_TOKEN (set when Blob store is linked to the Vercel project).
 */

import { put, list, del } from '@vercel/blob';

const STORAGE_PREFIX = 'crypto';

export type StorageKey =
  | 'global'
  | 'topCoins'
  | 'bitcoinChart'
  | 'trending'
  | 'categories'
  | 'coinbaseSpot'
  | 'krakenTicker'
  | 'binancePrice'
  | 'derived';

const STORAGE_KEYS: StorageKey[] = [
  'global',
  'topCoins',
  'bitcoinChart',
  'trending',
  'categories',
  'coinbaseSpot',
  'krakenTicker',
  'binancePrice',
  'derived',
];

function pathname(key: StorageKey): string {
  return `${STORAGE_PREFIX}/${key}.json`;
}

/**
 * Write JSON-serializable data under key. Overwrites if present.
 */
export async function write(key: StorageKey, data: unknown): Promise<void> {
  const body = JSON.stringify(data);
  await put(pathname(key), body, {
    access: 'public',
    allowOverwrite: true,
    contentType: 'application/json',
  });
}

/**
 * Read data for key. Returns null if not found or on error.
 */
export async function read<T = unknown>(key: StorageKey): Promise<T | null> {
  try {
    const { blobs } = await list({ prefix: `${STORAGE_PREFIX}/`, limit: 20 });
    const target = pathname(key);
    const blob = blobs.find((b) => b.pathname === target);
    if (!blob?.url) return null;
    const res = await fetch(blob.url);
    if (!res.ok) return null;
    const text = await res.text();
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * Delete all stored crypto data (all raw keys + derived). No-op if blob store is empty or missing.
 */
export async function deleteAll(): Promise<void> {
  try {
    const { blobs } = await list({ prefix: `${STORAGE_PREFIX}/`, limit: 30 });
    const urls = blobs.map((b) => b.url).filter(Boolean);
    if (urls.length > 0) await del(urls);
  } catch {
    // no-op
  }
}

export { STORAGE_KEYS };
