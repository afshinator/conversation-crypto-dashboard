/**
 * Fetch config: URL list and behavior constants.
 * Pure data only; no I/O. Used by api/ handlers (api/_lib so Vercel nft traces it).
 */

/** Pause in ms between requests to the same hostname (vendor). Use 0 for no pause. */
export const PAUSE_MS_BETWEEN_SAME_VENDOR = 15000;

export interface FetchSource {
  key: string;
  url: string;
}

/** Ordered list of endpoints to fetch. First entry is hit first; processing is sequential. */
export const FETCH_SOURCES: FetchSource[] = [
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

/** Derive hostname from URL (for same-vendor pause). Pure; no I/O. */
export function getHostnameFromUrl(url: string): string {
  return new URL(url).hostname;
}
