/**
 * Unit tests for lib/derived.ts: pure functions with fixture JSON.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  computeDerived,
  type GlobalRaw,
  type TopCoinsRaw,
  type BitcoinChartRaw,
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
  })
})
