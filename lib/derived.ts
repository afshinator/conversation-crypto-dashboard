/**
 * Calculation layer: pure functions from raw CoinGecko payloads to derived metrics.
 * Input: raw global, topCoins, bitcoinChart (same shapes as API responses).
 * Output: single derived object for storage and LLM context.
 * No I/O; easy to unit test with fixture JSON.
 */

// --- Input types (permissive for API response shapes) ---

export interface GlobalRaw {
  data?: {
    total_market_cap?: { usd?: number };
    total_volume?: { usd?: number };
    market_cap_percentage?: { btc?: number; eth?: number };
    market_cap_change_percentage_24h_usd?: number;
    updated_at?: number;
  };
  total_market_cap?: { usd?: number };
  total_volume?: { usd?: number };
  market_cap_percentage?: { btc?: number; eth?: number };
  market_cap_change_percentage_24h_usd?: number;
  updated_at?: number;
}

export interface CoinMarketItem {
  id?: string;
  symbol?: string;
  current_price?: number;
  market_cap?: number;
  total_volume?: number;
  price_change_percentage_24h?: number;
  price_change_percentage_7d_in_currency?: number;
  price_change_percentage_30d_in_currency?: number;
  [key: string]: unknown;
}

export type TopCoinsRaw = CoinMarketItem[];

export interface BitcoinChartRaw {
  prices?: [number, number][];
  market_caps?: [number, number][];
  total_volumes?: [number, number][];
}

// --- Output type ---

export interface DerivedMetrics {
  fromGlobal: {
    volumeRatio: number | null;
    btcDominancePercent: number | null;
    ethDominancePercent: number | null;
    marketMomentum24hPercent: number | null;
    updatedAt: number | null;
  };
  fromBitcoinChart: {
    ma50: number | null;
    ma200: number | null;
    currentPrice: number | null;
    trend: 'golden_cross' | 'death_cross' | 'neutral' | null;
  };
  fromTopCoins: {
    marketBreadthAbove50Percent: number | null;
    avgPriceChange24hTop10: number | null;
    avgPriceChange24hNext90: number | null;
  };
  computedAt: number;
}

function pickGlobal(data: GlobalRaw): {
  totalMarketCapUsd: number | null;
  totalVolumeUsd: number | null;
  btcPercent: number | null;
  ethPercent: number | null;
  momentum24h: number | null;
  updatedAt: number | null;
} {
  const root = data.data ?? data;
  const cap = root.total_market_cap?.usd ?? null;
  const vol = root.total_volume?.usd ?? null;
  const btc = root.market_cap_percentage?.btc ?? null;
  const eth = root.market_cap_percentage?.eth ?? null;
  const momentum = root.market_cap_change_percentage_24h_usd ?? null;
  const updated = root.updated_at ?? null;
  return {
    totalMarketCapUsd: cap != null ? Number(cap) : null,
    totalVolumeUsd: vol != null ? Number(vol) : null,
    btcPercent: btc != null ? Number(btc) : null,
    ethPercent: eth != null ? Number(eth) : null,
    momentum24h: momentum != null ? Number(momentum) : null,
    updatedAt: updated != null ? Number(updated) : null,
  };
}

function movingAverage(prices: [number, number][], days: number): number | null {
  if (!Array.isArray(prices) || prices.length < days) return null;
  const values = prices.map((p) => p[1]);
  const slice = values.slice(-days);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / slice.length;
}

function deriveFromBitcoinChart(raw: BitcoinChartRaw | null | undefined): DerivedMetrics['fromBitcoinChart'] {
  if (!raw?.prices?.length) {
    return { ma50: null, ma200: null, currentPrice: null, trend: null };
  }
  const prices = raw.prices as [number, number][];
  const ma50 = movingAverage(prices, 50);
  const ma200 = movingAverage(prices, 200);
  const last = prices[prices.length - 1];
  const currentPrice = last != null ? last[1] : null;
  let trend: DerivedMetrics['fromBitcoinChart']['trend'] = null;
  if (ma50 != null && ma200 != null) {
    if (ma50 > ma200) trend = 'golden_cross';
    else if (ma50 < ma200) trend = 'death_cross';
    else trend = 'neutral';
  }
  return { ma50, ma200, currentPrice, trend };
}

function deriveFromTopCoins(raw: TopCoinsRaw | null | undefined): DerivedMetrics['fromTopCoins'] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return {
      marketBreadthAbove50Percent: null,
      avgPriceChange24hTop10: null,
      avgPriceChange24hNext90: null,
    };
  }
  const with24h = raw.filter((c) => c.price_change_percentage_24h != null);
  const aboveZero = with24h.filter((c) => (c.price_change_percentage_24h ?? 0) > 0);
  const marketBreadthAbove50Percent =
    with24h.length > 0 ? (aboveZero.length / with24h.length) * 100 : null;

  const top10 = raw.slice(0, 10);
  const next90 = raw.slice(10, 100);
  const avg = (arr: CoinMarketItem[]) => {
    const vals = arr
      .map((c) => c.price_change_percentage_24h)
      .filter((v): v is number => typeof v === 'number');
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  return {
    marketBreadthAbove50Percent,
    avgPriceChange24hTop10: avg(top10),
    avgPriceChange24hNext90: avg(next90),
  };
}

/**
 * Compute all derived metrics from raw API payloads.
 * Pure; no I/O. Pass null/undefined for any missing payload.
 */
export function computeDerived(
  globalRaw: GlobalRaw | null | undefined,
  topCoinsRaw: TopCoinsRaw | null | undefined,
  bitcoinChartRaw: BitcoinChartRaw | null | undefined
): DerivedMetrics {
  const g = pickGlobal(globalRaw ?? {});
  const volumeRatio =
    g.totalMarketCapUsd != null && g.totalVolumeUsd != null && g.totalMarketCapUsd > 0
      ? g.totalVolumeUsd / g.totalMarketCapUsd
      : null;

  return {
    fromGlobal: {
      volumeRatio,
      btcDominancePercent: g.btcPercent,
      ethDominancePercent: g.ethPercent,
      marketMomentum24hPercent: g.momentum24h,
      updatedAt: g.updatedAt,
    },
    fromBitcoinChart: deriveFromBitcoinChart(bitcoinChartRaw),
    fromTopCoins: deriveFromTopCoins(topCoinsRaw),
    computedAt: Math.floor(Date.now() / 1000),
  };
}
