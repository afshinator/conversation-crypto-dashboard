/**
 * Fetch route: runs through configured sources, optional pause between same vendor, optional persist.
 * Config at top; no magic numbers in logic.
 * Uses Vercel Web Handler (Request / Response). Shared logic in root lib/ (see vercel.json includeFiles).
 */
/// <reference types="node" />

import {
  FETCH_SOURCES,
  PAUSE_MS_BETWEEN_SAME_VENDOR,
  getHostnameFromUrl,
} from '../lib/fetchConfig';
import { HttpClient, HTTP_STATUS } from '../lib/httpClient';

// --- Route config (change here or via env) ---
/** When false, fetched payloads are not written to storage; runner still runs. */
const PERSIST_FETCHED_DATA = false;
/** When true, include fetched payloads in the API response so the data page can display them. */
const INCLUDE_DATA_IN_RESPONSE = true;
/** Timeout in ms for each outbound request. */
const REQUEST_TIMEOUT_MS = 30_000;

/** Set env PAUSE_MS_BETWEEN_SAME_VENDOR=0 in tests to skip pause. */
function getPauseMs(): number {
  return process.env.PAUSE_MS_BETWEEN_SAME_VENDOR !== undefined
    ? Number(process.env.PAUSE_MS_BETWEEN_SAME_VENDOR)
    : PAUSE_MS_BETWEEN_SAME_VENDOR;
}

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

      const response = await HttpClient.request<unknown>(source.url, {
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
      status: allOk ? HTTP_STATUS['OK-200'] : HTTP_STATUS['SERVER_ERROR-500'],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: 'FUNCTION_INVOCATION_FAILED', message }, { status: 500 });
  }
}
