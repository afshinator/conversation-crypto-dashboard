/**
 * Chat route: load persisted crypto data from Blob, build context, call OpenAI, return text.
 * Self-contained (no lib/ imports). Uses @vercel/blob and ai + @ai-sdk/openai.
 */
/// <reference types="node" />

import { list } from '@vercel/blob';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { isAuthenticated } from './auth/index.js';

const STORAGE_PREFIX = 'crypto';

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

/* -- How the Data becomes "Context"

The most critical part of this file is the buildContext function. This is what connects the raw data to the AI:

  Loading: The script uses blobRead to pull three JSON files from Vercel Blob storage: derived, global, and topCoins.
  Formatting: buildContext iterates through that data and turns it into a human-readable string (e.g., "- BTC 50-day MA: 62000.50").
  Grounding: This string is injected into the systemPrompt. This ensures that when the user asks a question, the AI looks at the snapshot of data provided rather than just guessing based on its training.

*/

function buildContext(derived: Record<string, unknown> | null, globalRaw: unknown, topCoinsRaw: unknown): string {
  const parts: string[] = [];
  if (derived && typeof derived === 'object') {
    parts.push('Derived metrics (from latest fetch):');
    const fromGlobal = derived.fromGlobal as Record<string, unknown> | undefined;
    if (fromGlobal) {
      if (fromGlobal.volumeRatio != null) parts.push(`- Volume ratio (24h vol / market cap): ${Number(fromGlobal.volumeRatio).toFixed(6)}`);
      if (fromGlobal.btcDominancePercent != null) parts.push(`- BTC dominance: ${Number(fromGlobal.btcDominancePercent).toFixed(2)}%`);
      if (fromGlobal.ethDominancePercent != null) parts.push(`- ETH dominance: ${Number(fromGlobal.ethDominancePercent).toFixed(2)}%`);
      if (fromGlobal.marketMomentum24hPercent != null) parts.push(`- Market momentum (24h cap change): ${Number(fromGlobal.marketMomentum24hPercent).toFixed(2)}%`);
    }
    const fromChart = derived.fromBitcoinChart as Record<string, unknown> | undefined;
    if (fromChart) {
      if (fromChart.ma50 != null) parts.push(`- BTC 50-day MA: ${Number(fromChart.ma50).toFixed(2)}`);
      if (fromChart.ma200 != null) parts.push(`- BTC 200-day MA: ${Number(fromChart.ma200).toFixed(2)}`);
      if (fromChart.trend != null) parts.push(`- BTC trend: ${String(fromChart.trend)}`);
    }
    const fromTop = derived.fromTopCoins as Record<string, unknown> | undefined;
    if (fromTop) {
      if (fromTop.marketBreadthAbove50Percent != null) parts.push(`- Market breadth (% coins with positive 24h): ${Number(fromTop.marketBreadthAbove50Percent).toFixed(1)}%`);
    }
    const fromDiscovery = derived.fromDiscovery as
      | { topTrendingCoins?: string[]; topPerformingSectors?: { name: string; change24h: number }[]; hypeVsMarketCapDivergence?: boolean; retailMoonshotPresence?: boolean }
      | undefined;
    if (fromDiscovery) {
      if (Array.isArray(fromDiscovery.topTrendingCoins) && fromDiscovery.topTrendingCoins.length > 0) {
        parts.push(`- Top trending coins: ${fromDiscovery.topTrendingCoins.join(', ')}`);
      }
      if (Array.isArray(fromDiscovery.topPerformingSectors) && fromDiscovery.topPerformingSectors.length > 0) {
        parts.push(
          `- Top performing sectors (24h): ${fromDiscovery.topPerformingSectors.map((s) => `${s.name} (${s.change24h.toFixed(2)}%)`).join(', ')}`
        );
      }
      if (typeof fromDiscovery.hypeVsMarketCapDivergence === 'boolean') {
        parts.push(`- Hype vs market cap divergence (top trend rank > 100): ${fromDiscovery.hypeVsMarketCapDivergence}`);
      }
      if (typeof fromDiscovery.retailMoonshotPresence === 'boolean') {
        parts.push(`- Retail moonshot presence (any trending coin rank > 500): ${fromDiscovery.retailMoonshotPresence}`);
      }
    }
    const fromExchangePulse = derived.fromExchangePulse as
      | {
          coinbasePrice?: number;
          krakenPrice?: number;
          binancePrice?: number | null;
          priceDisparity?: number;
          usExchangePremium?: number;
          isVolatile?: boolean;
        }
      | null
      | undefined;
    if (fromExchangePulse && typeof fromExchangePulse === 'object') {
      parts.push(
        `- Exchange pulse (BTC): Coinbase ${Number(fromExchangePulse.coinbasePrice ?? 0).toFixed(2)} USD, Kraken ${Number(fromExchangePulse.krakenPrice ?? 0).toFixed(2)} USD` +
          (fromExchangePulse.binancePrice != null ? `, Binance ${Number(fromExchangePulse.binancePrice).toFixed(2)} USDT` : '')
      );
      if (typeof fromExchangePulse.priceDisparity === 'number') {
        parts.push(`- Coinbase–Kraken price disparity: ${fromExchangePulse.priceDisparity.toFixed(2)} USD`);
      }
      if (typeof fromExchangePulse.usExchangePremium === 'number') {
        parts.push(`- US exchange premium vs aggregator (Coinbase − Gecko): ${fromExchangePulse.usExchangePremium.toFixed(2)} USD`);
      }
      if (typeof fromExchangePulse.isVolatile === 'boolean') {
        parts.push(`- Exchange stress (disparity > 50 USD): ${fromExchangePulse.isVolatile}`);
      }
    }
  }
  if (globalRaw && typeof globalRaw === 'object') {
    const root = (globalRaw as { data?: Record<string, unknown> }).data ?? (globalRaw as Record<string, unknown>);
    const cap = (root.total_market_cap as { usd?: number } | undefined)?.usd;
    const vol = (root.total_volume as { usd?: number } | undefined)?.usd;
    if (cap != null) parts.push(`Total market cap (USD): ${cap}`);
    if (vol != null) parts.push(`Total 24h volume (USD): ${vol}`);
  }
  if (Array.isArray(topCoinsRaw) && topCoinsRaw.length > 0) {
    parts.push(`Top coins: ${topCoinsRaw.length} coins (e.g. by market cap). Each has id, symbol, current_price, market_cap, total_volume, price_change_percentage_24h, etc.`);
  }
  return parts.length > 0 ? parts.join('\n') : 'No structured data available.';
}

export async function POST(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }
  if (!isAuthenticated(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      { error: 'OPENAI_API_KEY not configured. Add it in Vercel or .env.local.' },
      { status: 500 }
    );
  }

  let message: string;
  try {
    const body = await request.json() as { message?: string };
    message = typeof body?.message === 'string' ? body.message.trim() : '';
  } catch {
    return Response.json({ error: 'Invalid JSON body. Expected { message: string }.' }, { status: 400 });
  }

  if (!message) {
    return Response.json({ error: 'Missing or empty message.' }, { status: 400 });
  }

  const [derived, globalRaw, topCoinsRaw] = await Promise.all([
    blobRead('derived'),
    blobRead('global'),
    blobRead('topCoins'),
  ]);

  const hasData = derived != null || globalRaw != null || (Array.isArray(topCoinsRaw) && topCoinsRaw.length > 0);
  if (!hasData) {
    return Response.json(
      { error: 'No data yet. Please fetch data first from the Data page (/cryptochat/data).', text: null },
      { status: 200 }
    );
  }

  const context = buildContext(derived as Record<string, unknown> | null, globalRaw, topCoinsRaw);
  const systemPrompt = `You are a crypto market analyst. Use ONLY the following persisted data to answer. Do not use live data or external knowledge beyond this snapshot. If the data does not contain what the user asks for, say so briefly.

${context}`;

  try {
    const result = await generateText({
      model: openai('gpt-4o-mini'),
      system: systemPrompt,
      prompt: message,
    });
    const { text, usage } = result;
    const usagePayload =
      usage != null
        ? {
            promptTokens: usage.inputTokens ?? 0,
            completionTokens: usage.outputTokens ?? 0,
            totalTokens: usage.totalTokens ?? 0,
          }
        : null;
    return Response.json({ text, usage: usagePayload });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: 'LLM call failed', message: errorMessage, text: null },
      { status: 500 }
    );
  }
}
