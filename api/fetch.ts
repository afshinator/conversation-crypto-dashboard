/**
 * Fetch route: runs through configured sources, optional pause, persist raw + derived.
 * Self-contained: no lib/ imports (Vercel cannot resolve them). Storage + derived inlined.
 */
/// <reference types="node" />

import { put } from '@vercel/blob';
import { isAuthenticated } from './auth/index.js';

// --- Fetch config ---
const DEFAULT_PAUSE_MS_BETWEEN_SAME_VENDOR = 15000;
function getPauseMs(): number {
  return process.env.PAUSE_MS_BETWEEN_SAME_VENDOR !== undefined
    ? Number(process.env.PAUSE_MS_BETWEEN_SAME_VENDOR)
    : DEFAULT_PAUSE_MS_BETWEEN_SAME_VENDOR;
}
const FETCH_SOURCES: { key: string; url: string }[] = [
  { key: 'global', url: 'https://api.coingecko.com/api/v3/global' },
  {
    key: 'topCoins',
    url: 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=200&page=1&sparkline=false&price_change_percentage=24h,7d,30d',
  },
  {
    key: 'bitcoinChart',
    url: 'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=200',
  },
];
function getHostnameFromUrl(url: string): string {
  return new URL(url).hostname;
}

// --- HTTP client (inlined for Vercel function boundary) ---
const HTTP_STATUS_OK = 200;
const HTTP_STATUS_SERVER_ERROR = 500;
const REQUEST_TIMEOUT_MS = 30_000;

async function httpRequest<T>(
  url: string,
  options: { timeout?: number } = {}
): Promise<{ data: T | null; status: number; isOk: boolean; error?: string }> {
  const timeout = options.timeout ?? REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    return {
      data: data as T,
      status: response.status,
      isOk: response.ok,
      error: !response.ok ? `HTTP ${response.status}: ${response.statusText || 'Request failed'}` : undefined,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const message = err instanceof Error ? err.message : String(err);
    return {
      data: null,
      status: 0,
      isOk: false,
      error: message,
    };
  }
}

// --- Route config ---
const PERSIST_FETCHED_DATA = true;
const INCLUDE_DATA_IN_RESPONSE = true;
const STORAGE_PREFIX = 'crypto';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function blobWrite(key: string, data: unknown): Promise<void> {
  await put(`${STORAGE_PREFIX}/${key}.json`, JSON.stringify(data), {
    access: 'public',
    allowOverwrite: true,
    contentType: 'application/json',
  });
}

// --- Derived (inlined from lib/derived; same shape for storage/chat) ---
function movingAverage(prices: [number, number][], days: number): number | null {
  if (!Array.isArray(prices) || prices.length < days) return null;
  const values = prices.map((p) => p[1]);
  const slice = values.slice(-days);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function computeDerived(
  globalRaw: Record<string, unknown> | null | undefined,
  topCoinsRaw: unknown,
  bitcoinChartRaw: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const root = (globalRaw?.data ?? globalRaw) as Record<string, unknown> | undefined;
  const cap = (root?.total_market_cap as { usd?: number } | undefined)?.usd ?? null;
  const vol = (root?.total_volume as { usd?: number } | undefined)?.usd ?? null;
  const btc = (root?.market_cap_percentage as { btc?: number } | undefined)?.btc ?? null;
  const eth = (root?.market_cap_percentage as { eth?: number } | undefined)?.eth ?? null;
  const momentum = (root?.market_cap_change_percentage_24h_usd as number | undefined) ?? null;
  const updatedAt = (root?.updated_at as number | undefined) ?? null;
  const volumeRatio =
    cap != null && vol != null && cap > 0 ? vol / cap : null;

  const prices = bitcoinChartRaw?.prices as [number, number][] | undefined;
  let ma50: number | null = null;
  let ma200: number | null = null;
  let currentPrice: number | null = null;
  let trend: 'golden_cross' | 'death_cross' | 'neutral' | null = null;
  if (Array.isArray(prices) && prices.length >= 200) {
    ma50 = movingAverage(prices, 50);
    ma200 = movingAverage(prices, 200);
    const last = prices[prices.length - 1];
    currentPrice = last != null ? last[1] : null;
    if (ma50 != null && ma200 != null) {
      if (ma50 > ma200) trend = 'golden_cross';
      else if (ma50 < ma200) trend = 'death_cross';
      else trend = 'neutral';
    }
  }

  const coins = Array.isArray(topCoinsRaw) ? topCoinsRaw : [];
  const with24h = coins.filter((c: { price_change_percentage_24h?: number }) => c.price_change_percentage_24h != null);
  const aboveZero = with24h.filter((c: { price_change_percentage_24h?: number }) => (c.price_change_percentage_24h ?? 0) > 0);
  const marketBreadthAbove50Percent =
    with24h.length > 0 ? (aboveZero.length / with24h.length) * 100 : null;
  const avg = (arr: { price_change_percentage_24h?: number }[]) => {
    const vals = arr.map((c) => c.price_change_percentage_24h).filter((v): v is number => typeof v === 'number');
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const top10 = coins.slice(0, 10);
  const next90 = coins.slice(10, 100);

  return {
    fromGlobal: {
      volumeRatio,
      btcDominancePercent: btc,
      ethDominancePercent: eth,
      marketMomentum24hPercent: momentum,
      updatedAt,
    },
    fromBitcoinChart: { ma50, ma200, currentPrice, trend },
    fromTopCoins: {
      marketBreadthAbove50Percent,
      avgPriceChange24hTop10: avg(top10),
      avgPriceChange24hNext90: avg(next90),
    },
    computedAt: Math.floor(Date.now() / 1000),
  };
}

export async function POST(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }
  if (!isAuthenticated(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const hasBlobToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
    const results: { key: string; status: number; isOk: boolean; error?: string }[] = [];
    const data: Record<string, unknown> = {};
    let lastHostname: string | null = null;

    for (let i = 0; i < FETCH_SOURCES.length; i++) {
      const source = FETCH_SOURCES[i];
      const hostname = getHostnameFromUrl(source.url);

      const pauseMs = getPauseMs();
      if (i > 0 && lastHostname !== null && hostname === lastHostname && pauseMs > 0) {
        await sleep(pauseMs);
      }
      lastHostname = hostname;

      const response = await httpRequest<unknown>(source.url, {
        timeout: REQUEST_TIMEOUT_MS,
      });

      results.push({
        key: source.key,
        status: response.status,
        isOk: response.isOk,
        ...(response.error && { error: response.error }),
      });

      if (response.isOk && response.data !== null && INCLUDE_DATA_IN_RESPONSE) {
        data[source.key] = response.data;
      }
      if (PERSIST_FETCHED_DATA && hasBlobToken && response.isOk && response.data !== null) {
        await blobWrite(source.key, response.data);
      }
    }

    if (PERSIST_FETCHED_DATA && data.global != null && data.topCoins != null && data.bitcoinChart != null) {
      const derived = computeDerived(
        data.global as Record<string, unknown>,
        data.topCoins,
        data.bitcoinChart as Record<string, unknown>
      );
      if (hasBlobToken) {
        await blobWrite('derived', derived);
      }
    }

    const allOk = results.every((r) => r.isOk);
    const body = {
      ok: allOk,
      persistEnabled: PERSIST_FETCHED_DATA,
      ...(PERSIST_FETCHED_DATA && !hasBlobToken && {
        persistSkipped: true,
        persistSkipReason: 'BLOB_READ_WRITE_TOKEN not set. Add it in Vercel (Storage → Blob) or in .env.local for local dev.',
      }),
      results,
      ...(INCLUDE_DATA_IN_RESPONSE && Object.keys(data).length > 0 && { data }),
    };
    return Response.json(body, {
      status: allOk ? HTTP_STATUS_OK : HTTP_STATUS_SERVER_ERROR,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: 'FUNCTION_INVOCATION_FAILED', message }, { status: 500 });
  }
}
