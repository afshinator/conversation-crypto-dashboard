/**
 * Unit tests for lib/derived.ts: pure functions with fixture JSON.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  computeDerived,
  deriveDiscovery,
  deriveExchangePulse,
  type GlobalRaw,
  type TopCoinsRaw,
  type BitcoinChartRaw,
  type TrendingRaw,
  type CategoriesRaw,
  type CoinbaseSpotRaw,
  type KrakenTickerRaw,
  type BinancePriceRaw,
} from '../../lib/derived'

describe('computeDerived', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns fromGlobal.volumeRatio from total_volume/total_market_cap', () => {
    const globalRaw: GlobalRaw = {
      data: {
        total_market_cap: { usd: 2_000_000_000_000 },
        total_volume: { usd: 100_000_000_000 },
        market_cap_percentage: { btc: 52, eth: 18 },
        market_cap_change_percentage_24h_usd: 1.5,
        updated_at: 1712512855,
      },
    }
    const out = computeDerived(globalRaw, null, null)
    expect(out.fromGlobal.volumeRatio).toBe(100_000_000_000 / 2_000_000_000_000)
    expect(out.fromGlobal.btcDominancePercent).toBe(52)
    expect(out.fromGlobal.ethDominancePercent).toBe(18)
    expect(out.fromGlobal.marketMomentum24hPercent).toBe(1.5)
    expect(out.fromGlobal.updatedAt).toBe(1712512855)
  })

  it('handles global without data wrapper (flat shape)', () => {
    const globalRaw: GlobalRaw = {
      total_market_cap: { usd: 1_000 },
      total_volume: { usd: 50 },
      market_cap_percentage: { btc: 48 },
      market_cap_change_percentage_24h_usd: -0.5,
      updated_at: 123,
    }
    const out = computeDerived(globalRaw, null, null)
    expect(out.fromGlobal.volumeRatio).toBe(50 / 1_000)
    expect(out.fromGlobal.btcDominancePercent).toBe(48)
    expect(out.fromGlobal.marketMomentum24hPercent).toBe(-0.5)
  })

  it('returns null volumeRatio when total_market_cap is 0 or missing', () => {
    expect(computeDerived({ data: { total_market_cap: { usd: 0 }, total_volume: { usd: 100 } } }, null, null).fromGlobal.volumeRatio).toBeNull()
    expect(computeDerived({ data: {} }, null, null).fromGlobal.volumeRatio).toBeNull()
  })

  it('computes 50/200 MA and golden_cross from bitcoinChart', () => {
    const prices: [number, number][] = []
    const baseTime = 1700000000000
    for (let i = 0; i < 200; i++) {
      const t = baseTime + i * 86400 * 1000
      const price = i < 100 ? 40_000 + i * 100 : 50_000 + (i - 100) * 50
      prices.push([t, price])
    }
    const bitcoinChart: BitcoinChartRaw = { prices }
    const out = computeDerived(null, null, bitcoinChart)
    expect(out.fromBitcoinChart.ma50).not.toBeNull()
    expect(out.fromBitcoinChart.ma200).not.toBeNull()
    expect(typeof out.fromBitcoinChart.currentPrice).toBe('number')
    expect(out.fromBitcoinChart.ma50!).toBeGreaterThan(out.fromBitcoinChart.ma200!)
    expect(out.fromBitcoinChart.trend).toBe('golden_cross')
  })

  it('computes death_cross when ma50 < ma200', () => {
    const prices: [number, number][] = []
    const baseTime = 1700000000000
    for (let i = 0; i < 200; i++) {
      const t = baseTime + i * 86400 * 1000
      const price = 60_000 - i * 80
      prices.push([t, price])
    }
    const bitcoinChart: BitcoinChartRaw = { prices }
    const out = computeDerived(null, null, bitcoinChart)
    expect(out.fromBitcoinChart.ma50!).toBeLessThan(out.fromBitcoinChart.ma200!)
    expect(out.fromBitcoinChart.trend).toBe('death_cross')
  })

  it('returns null MAs when prices length < 200', () => {
    const bitcoinChart: BitcoinChartRaw = {
      prices: [
        [1700000000000, 40000],
        [1700086400000, 41000],
      ],
    }
    const out = computeDerived(null, null, bitcoinChart)
    expect(out.fromBitcoinChart.ma50).toBeNull()
    expect(out.fromBitcoinChart.ma200).toBeNull()
    expect(out.fromBitcoinChart.trend).toBeNull()
  })

  it('computes fromTopCoins: market breadth and segment averages', () => {
    const topCoins: TopCoinsRaw = []
    for (let i = 0; i < 20; i++) {
      topCoins.push({
        id: `coin-${i}`,
        symbol: `c${i}`,
        price_change_percentage_24h: i % 2 === 0 ? 2 : -1,
      })
    }
    const out = computeDerived(null, topCoins, null)
    expect(out.fromTopCoins.marketBreadthAbove50Percent).toBe(50)
    expect(out.fromTopCoins.avgPriceChange24hTop10).not.toBeNull()
    expect(out.fromTopCoins.avgPriceChange24hNext90).not.toBeNull()
  })

  it('sets computedAt to current unix time', () => {
    const out = computeDerived(null, null, null)
    expect(out.computedAt).toBe(Math.floor(new Date('2025-01-15T12:00:00Z').getTime() / 1000))
  })

  it('handles all null inputs without throwing', () => {
    const out = computeDerived(null, null, null)
    expect(out.fromGlobal.volumeRatio).toBeNull()
    expect(out.fromBitcoinChart.ma50).toBeNull()
    expect(out.fromBitcoinChart.trend).toBeNull()
    expect(out.fromTopCoins.marketBreadthAbove50Percent).toBeNull()
    expect(out.fromDiscovery.topTrendingCoins).toEqual([])
    expect(out.fromDiscovery.topPerformingSectors).toEqual([])
    expect(out.fromDiscovery.hypeVsMarketCapDivergence).toBe(false)
    expect(out.fromDiscovery.retailMoonshotPresence).toBe(false)
    expect(out.fromExchangePulse).toBeNull()
  })
})

describe('deriveDiscovery / fromDiscovery', () => {
  it('sets hypeVsMarketCapDivergence true when top trending rank > 100', () => {
    const trendingRaw: TrendingRaw = {
      coins: [
        { item: { name: 'MidCap', symbol: 'MID', market_cap_rank: 150 } },
        { item: { name: 'Other', symbol: 'OTH', market_cap_rank: 200 } },
      ],
    }
    const out = deriveDiscovery(trendingRaw, null)
    expect(out.hypeVsMarketCapDivergence).toBe(true)
    expect(out.topTrendingCoins[0]).toBe('MidCap (MID)')
  })

  it('sets hypeVsMarketCapDivergence false when top trending rank <= 100', () => {
    const trendingRaw: TrendingRaw = {
      coins: [{ item: { name: 'Bitcoin', symbol: 'BTC', market_cap_rank: 1 } }],
    }
    const out = deriveDiscovery(trendingRaw, null)
    expect(out.hypeVsMarketCapDivergence).toBe(false)
  })

  it('sets retailMoonshotPresence true when any trending coin rank > 500', () => {
    const trendingRaw: TrendingRaw = {
      coins: [
        { item: { name: 'Bitcoin', symbol: 'BTC', market_cap_rank: 1 } },
        { item: { name: 'MemeCoin', symbol: 'MEME', market_cap_rank: 600 } },
      ],
    }
    const out = deriveDiscovery(trendingRaw, null)
    expect(out.retailMoonshotPresence).toBe(true)
  })

  it('sets retailMoonshotPresence false when no rank > 500', () => {
    const trendingRaw: TrendingRaw = {
      coins: [
        { item: { name: 'A', symbol: 'A', market_cap_rank: 100 } },
        { item: { name: 'B', symbol: 'B', market_cap_rank: 300 } },
      ],
    }
    const out = deriveDiscovery(trendingRaw, null)
    expect(out.retailMoonshotPresence).toBe(false)
  })

  it('builds topPerformingSectors from categories by 24h change', () => {
    const categoriesRaw: CategoriesRaw = [
      { name: 'DeFi', market_cap_change_24h: 5 },
      { name: 'Layer 1', market_cap_change_24h: -1 },
      { name: 'Meme', market_cap_change_24h: 10 },
    ]
    const out = deriveDiscovery(null, categoriesRaw)
    expect(out.topPerformingSectors).toHaveLength(3)
    expect(out.topPerformingSectors[0]).toEqual({ name: 'Meme', change24h: 10 })
    expect(out.topPerformingSectors[1]).toEqual({ name: 'DeFi', change24h: 5 })
    expect(out.topPerformingSectors[2]).toEqual({ name: 'Layer 1', change24h: -1 })
  })

  it('computeDerived includes fromDiscovery when trending and categories passed', () => {
    const trendingRaw: TrendingRaw = {
      coins: [
        { item: { name: 'Alpha', symbol: 'A', market_cap_rank: 150 } },
        { item: { name: 'Beta', symbol: 'B', market_cap_rank: 700 } },
      ],
    }
    const categoriesRaw: CategoriesRaw = [{ name: 'Sector1', market_cap_change_24h: 2 }]
    const out = computeDerived(null, null, null, trendingRaw, categoriesRaw)
    expect(out.fromDiscovery.hypeVsMarketCapDivergence).toBe(true)
    expect(out.fromDiscovery.retailMoonshotPresence).toBe(true)
    expect(out.fromDiscovery.topTrendingCoins).toContain('Alpha (A)')
    expect(out.fromDiscovery.topPerformingSectors).toEqual([{ name: 'Sector1', change24h: 2 }])
  })
})

describe('deriveExchangePulse / fromExchangePulse', () => {
  it('returns null when Coinbase or Kraken price is missing', () => {
    expect(deriveExchangePulse(null, null, null, 60000)).toBeNull()
    expect(
      deriveExchangePulse(
        { data: { amount: '60000' } } as CoinbaseSpotRaw,
        null,
        null,
        60000
      )
    ).toBeNull()
    expect(
      deriveExchangePulse(
        null,
        { result: { XXBTZUSD: { c: ['60010'] } } } as KrakenTickerRaw,
        null,
        60000
      )
    ).toBeNull()
  })

  it('returns normalized prices and disparity when Coinbase and Kraken valid', () => {
    const coinbase: CoinbaseSpotRaw = { data: { amount: '60100' } }
    const kraken: KrakenTickerRaw = { result: { XXBTZUSD: { c: ['60090'] } } }
    const out = deriveExchangePulse(coinbase, kraken, null, 60000)
    expect(out).not.toBeNull()
    expect(out!.coinbasePrice).toBe(60100)
    expect(out!.krakenPrice).toBe(60090)
    expect(out!.binancePrice).toBeNull()
    expect(out!.priceDisparity).toBe(10)
    expect(out!.usExchangePremium).toBe(100)
    expect(out!.isVolatile).toBe(false)
  })

  it('sets isVolatile true when disparity > 50', () => {
    const coinbase: CoinbaseSpotRaw = { data: { amount: '60100' } }
    const kraken: KrakenTickerRaw = { result: { XXBTZUSD: { c: ['60040'] } } }
    const out = deriveExchangePulse(coinbase, kraken, null, 60000)
    expect(out!.priceDisparity).toBe(60)
    expect(out!.isVolatile).toBe(true)
  })

  it('includes binancePrice when Binance raw provided', () => {
    const coinbase: CoinbaseSpotRaw = { data: { amount: '60050' } }
    const kraken: KrakenTickerRaw = { result: { XXBTZUSD: { c: ['60055'] } } }
    const binance: BinancePriceRaw = { symbol: 'BTCUSDT', price: '60052' }
    const out = deriveExchangePulse(coinbase, kraken, binance, 60000)
    expect(out!.binancePrice).toBe(60052)
  })

  it('computeDerived includes fromExchangePulse when exchange data passed', () => {
    const coinbase: CoinbaseSpotRaw = { data: { amount: '60100' } }
    const kraken: KrakenTickerRaw = { result: { XXBTZUSD: { c: ['60090'] } } }
    const bitcoinChart: BitcoinChartRaw = {
      prices: Array.from({ length: 200 }, (_, i) => [1700000000000 + i * 86400000, 60000]),
    }
    const out = computeDerived(null, null, bitcoinChart, undefined, undefined, coinbase, kraken, null)
    expect(out.fromExchangePulse).not.toBeNull()
    expect(out.fromExchangePulse!.coinbasePrice).toBe(60100)
    expect(out.fromExchangePulse!.krakenPrice).toBe(60090)
    expect(out.fromExchangePulse!.usExchangePremium).toBe(100)
  })
})
