/**
 * Fetch route: runs through configured sources, optional pause between same vendor, optional persist.
 * Config at top; no magic numbers in logic. Self-contained (no imports from lib) so Vercel can run it.
 * Uses Vercel Web Handler (Request / Response).
 */
/// <reference types="node" />

// --- Fetch config (inlined so no module resolution in serverless) ---
/** Default pause in ms between same hostname. Set env PAUSE_MS_BETWEEN_SAME_VENDOR=0 in tests to skip. */
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

// --- HTTP client (inlined) ---
const HTTP_STATUS_OK = 200;
const HTTP_STATUS_SERVER_ERROR = 500;
const DEFAULT_TIMEOUT_MS = 30_000;

async function httpRequest<T>(
  url: string,
  options: { timeout?: number } = {}
): Promise<{ data: T | null; status: number; isOk: boolean; error?: string }> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
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
const PERSIST_FETCHED_DATA = false;
const INCLUDE_DATA_IN_RESPONSE = true;
const REQUEST_TIMEOUT_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
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
      if (PERSIST_FETCHED_DATA && response.isOk && response.data !== null) {
        // TODO: persist when storage is implemented
      }
    }

    const allOk = results.every((r) => r.isOk);
    const body = {
      ok: allOk,
      persistEnabled: PERSIST_FETCHED_DATA,
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
