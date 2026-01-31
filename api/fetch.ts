/**
 * Fetch route: runs through configured sources, optional pause, persist raw + derived.
 * Self-contained: no lib/ imports (Vercel cannot resolve them). Storage + derived inlined.
 */
/// <reference types="node" />

import { put, list } from '@vercel/blob';
import { isAuthenticated } from './auth/index.js';

// --- Fetch config ---
const DEFAULT_PAUSE_MS_BETWEEN_SAME_VENDOR = 6000;  // have to also change pages/FetchDataPage
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
  { key: 'trending', url: 'https://api.coingecko.com/api/v3/search/trending' },
  { key: 'categories', url: 'https://api.coingecko.com/api/v3/coins/categories' },
  { key: 'coinbaseSpot', url: 'https://api.coinbase.com/v2/prices/BTC-USD/spot' },
  { key: 'krakenTicker', url: 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD' },
  { key: 'binancePrice', url: 'https://api.binance-us.com/api/v3/ticker/price?symbol=BTCUSDT' },
];
function getHostnameFromUrl(url: string): string {
  return new URL(url).hostname;
}

// --- HTTP client (inlined for Vercel function boundary) ---
const HTTP_STATUS_OK = 200;
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
  bitcoinChartRaw: Record<string, unknown> | null | undefined,
  trendingRaw?: Record<string, unknown> | null,
  categoriesRaw?: unknown,
  coinbaseSpotRaw?: Record<string, unknown> | null,
  krakenTickerRaw?: Record<string, unknown> | null,
  binancePriceRaw?: Record<string, unknown> | null
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

  const fromDiscovery = deriveDiscoveryInline(trendingRaw, categoriesRaw);
  const fromExchangePulse = deriveExchangePulseInline(
    coinbaseSpotRaw,
    krakenTickerRaw,
    binancePriceRaw,
    currentPrice ?? 0
  );

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
    fromDiscovery,
    fromExchangePulse,
    computedAt: Math.floor(Date.now() / 1000),
  };
}

const EXCHANGE_PULSE_STRESS_THRESHOLD_USD = 50;

function deriveExchangePulseInline(
  coinbaseRaw: Record<string, unknown> | null | undefined,
  krakenRaw: Record<string, unknown> | null | undefined,
  binanceRaw: Record<string, unknown> | null | undefined,
  geckoBtcPrice: number
): {
  coinbasePrice: number;
  krakenPrice: number;
  binancePrice: number | null;
  priceDisparity: number;
  usExchangePremium: number;
  isVolatile: boolean;
} | null {
  const data = coinbaseRaw?.data as { amount?: string } | undefined;
  const cbPrice = Number(data?.amount ?? 0);
  const result = krakenRaw?.result as { XXBTZUSD?: { c?: string[] } } | undefined;
  const krPrice = Number(result?.XXBTZUSD?.c?.[0] ?? 0);
  if (cbPrice === 0 || krPrice === 0) return null;

  const bnPriceStr = binanceRaw?.price as string | undefined;
  const bnPrice = bnPriceStr != null && bnPriceStr !== '' ? Number(bnPriceStr) : null;

  return {
    coinbasePrice: cbPrice,
    krakenPrice: krPrice,
    binancePrice: bnPrice,
    priceDisparity: Math.abs(cbPrice - krPrice),
    usExchangePremium: cbPrice - geckoBtcPrice,
    isVolatile: Math.abs(cbPrice - krPrice) > EXCHANGE_PULSE_STRESS_THRESHOLD_USD,
  };
}

function deriveDiscoveryInline(
  trendingRaw: Record<string, unknown> | unknown[] | null | undefined,
  categoriesRaw: unknown
): { topTrendingCoins: string[]; topPerformingSectors: { name: string; change24h: number }[]; hypeVsMarketCapDivergence: boolean; retailMoonshotPresence: boolean } {
  const trendingCoins = Array.isArray((trendingRaw as { coins?: unknown[] })?.coins)
    ? (trendingRaw as { coins: Array<{ item?: { name?: string; symbol?: string; market_cap_rank?: number } }> }).coins
    : [];
  const ranks = trendingCoins.map((c) => c.item?.market_cap_rank ?? 0);
  const topTrendingRank = ranks[0] ?? 0;
  const topTrendingCoins = trendingCoins
    .slice(0, 5)
    .map((c) => `${c.item?.name ?? 'Unknown'} (${c.item?.symbol ?? '?'})`);
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];
  const topPerformingSectors = (categories as { name?: string; market_cap_change_24h?: number }[])
    .filter((cat) => cat.market_cap_change_24h != null)
    .sort((a, b) => (b.market_cap_change_24h ?? 0) - (a.market_cap_change_24h ?? 0))
    .slice(0, 3)
    .map((cat) => ({ name: cat.name ?? 'Unknown', change24h: cat.market_cap_change_24h ?? 0 }));
  return {
    topTrendingCoins,
    topPerformingSectors,
    hypeVsMarketCapDivergence: topTrendingRank > 100,
    retailMoonshotPresence: ranks.some((r) => r > 500),
  };
}

const TOTAL_STEPS = FETCH_SOURCES.length + 1; // 8 sources + 1 derive step

export async function POST(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }
  if (!isAuthenticated(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const hasBlobToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
    let parsedBody: { step?: number };
    try {
      parsedBody = (await request.json()) as { step?: number };
    } catch {
      parsedBody = {};
    }
    const step = typeof parsedBody.step === 'number' && parsedBody.step >= 1 && parsedBody.step <= TOTAL_STEPS ? parsedBody.step : null;

    // Chunked mode: single step (no pause; client handles pacing)
    if (step !== null) {
      if (step >= 1 && step <= FETCH_SOURCES.length) {
        const source = FETCH_SOURCES[step - 1];
        const response = await httpRequest<unknown>(source.url, { timeout: REQUEST_TIMEOUT_MS });
        if (hasBlobToken && response.isOk && response.data !== null) {
          await blobWrite(source.key, response.data);
        }
        return Response.json(
          {
            ok: response.isOk,
            step,
            key: source.key,
            status: response.status,
            isOk: response.isOk,
            ...(response.error && { error: response.error }),
            done: false,
          },
          { status: HTTP_STATUS_OK }
        );
      }
      // step === TOTAL_STEPS (9): read from Blob, compute derived, persist
      const [globalRaw, topCoinsRaw, bitcoinChartRaw, trendingRaw, categoriesRaw, coinbaseSpotRaw, krakenTickerRaw, binancePriceRaw] = await Promise.all([
        blobRead('global'),
        blobRead('topCoins'),
        blobRead('bitcoinChart'),
        blobRead('trending'),
        blobRead('categories'),
        blobRead('coinbaseSpot'),
        blobRead('krakenTicker'),
        blobRead('binancePrice'),
      ]);
      if (globalRaw != null && topCoinsRaw != null && bitcoinChartRaw != null && hasBlobToken) {
        const derived = computeDerived(
          globalRaw as Record<string, unknown>,
          topCoinsRaw,
          bitcoinChartRaw as Record<string, unknown>,
          (trendingRaw as Record<string, unknown>) ?? null,
          categoriesRaw,
          (coinbaseSpotRaw as Record<string, unknown>) ?? null,
          (krakenTickerRaw as Record<string, unknown>) ?? null,
          (binancePriceRaw as Record<string, unknown>) ?? null
        );
        await blobWrite('derived', derived);
      }
      return Response.json({ ok: true, step: TOTAL_STEPS, done: true }, { status: HTTP_STATUS_OK });
    }

    // Full run (all sources in one invocation; with pause between same-host)
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
        data.bitcoinChart as Record<string, unknown>,
        (data.trending as Record<string, unknown>) ?? null,
        data.categories,
        (data.coinbaseSpot as Record<string, unknown>) ?? null,
        (data.krakenTicker as Record<string, unknown>) ?? null,
        (data.binancePrice as Record<string, unknown>) ?? null
      );
      if (hasBlobToken) {
        await blobWrite('derived', derived);
      }
    }

    const allOk = results.every((r) => r.isOk);
    const responseBody = {
      ok: allOk,
      persistEnabled: PERSIST_FETCHED_DATA,
      ...(PERSIST_FETCHED_DATA && !hasBlobToken && {
        persistSkipped: true,
        persistSkipReason: 'BLOB_READ_WRITE_TOKEN not set. Add it in Vercel (Storage → Blob) or in .env.local for local dev.',
      }),
      results,
      ...(INCLUDE_DATA_IN_RESPONSE && Object.keys(data).length > 0 && { data }),
    };
    // Always return 200 when we completed the loop (no throw). Let clients use body.ok and results to detect partial failure.
    return Response.json(responseBody, { status: HTTP_STATUS_OK });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: 'FUNCTION_INVOCATION_FAILED', message }, { status: 500 });
  }
}
