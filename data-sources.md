# Data Sources and Derived Signals

We do not feed raw API JSON to the LLM. We derive a small set of metrics from each response and store them in a single `derived` object. The chat route’s `buildContext` turns that into a short, readable summary for the system prompt. This document describes each data source and the derived signals we compute.

---

## Why/how were these endpoints chosen?

The goal is to use a selection of endpoints that creates a tiered view of the market—moving from the "Big Picture" macro trends to high-frequency "Heartbeat" signals.

Also, I didnt want to have to use api-keys, free endpoints.   Except for OpenAI, who is taxing me.

1. The Macro Core (CoinGecko) - Macro core

    - global: Provides a high-level snapshot of total market cap, volume, and dominance; it sets the "market regime" (e.g., Risk-On vs. Risk-Off) that informs every other signal.

    - coins/markets: Delivers bulk data for the top 200 coins; this allows the LLM to calculate Market Breadth, identifying if a rally is widespread or just driven by a few "megacaps."

    - bitcoin/market_chart: Supplies 200 days of historical BTC price data; this is handpicked specifically to derive Moving Averages (50/200 MA), giving the LLM a technical "trend filter" to determine if Bitcoin is in a Golden or Death Cross.


2. The Discovery Layer (CoinGecko)

    - These endpoints add a "human" element to the data, capturing shifts in narrative and retail interest.

    - search/trending: Tracks the top 15 most-searched coins; it is used to detect "Retail Hype" and calculate if attention is shifting away from established blue chips toward speculative assets.

    - coins/categories: Aggregates data by sector (e.g., AI, Layer 1s, Memecoins); it complements the individual coin data by helping the LLM identify which market narratives are currently leading the cycle.

3. The Exchange Pulse (Coinbase, Kraken, Binance)

    -  "last-mile" verification tools, providing the highest fidelity for immediate price action.

    - coinbaseSpot (Coinbase): Provides a ultra-stable "Base" price for US retail; it acts as the primary spot reference to compare against global averages.

    - krakenTicker (Kraken): Offers direct exchange data including the most recent trade price; it is paired with Coinbase to calculate Price Disparity, a critical signal for market stress and volatility.

    - binancePrice (Binance): Delivers the global "High-Volume" perspective; it ensures that the LLM's snapshot isn't biased toward a single region, providing a liquidity check for the world's largest trading venue.



## CoinGecko: global

Whole-market snapshot (total cap, volume, dominance, 24h momentum).

| Signal | Logic | Why it matters for the LLM |
|--------|--------|----------------------------|
| **volumeRatio** | `total_volume_24h / total_market_cap` | Higher ratio suggests more turnover vs cap; useful for “how active is the market?” |
| **btcDominancePercent** / **ethDominancePercent** | From `market_cap_percentage` | Share of total market cap; answers “What’s BTC dominance?” and sector rotation. |
| **marketMomentum24hPercent** | `market_cap_change_percentage_24h_usd` | Aggregate 24h cap change; quick read on risk-on vs risk-off. |
| **updatedAt** | API `updated_at` | So the LLM can say “as of …” and avoid implying real-time data. |

---

## CoinGecko: bitcoinChart

BTC price history used for moving averages and trend.

| Signal | Logic | Why it matters for the LLM |
|--------|--------|----------------------------|
| **ma50** / **ma200** | 50- and 200-day simple moving averages on `prices` | Standard trend filters; the LLM can say “BTC is above/below its 200-day MA.” |
| **currentPrice** | Last point in `prices` | Reference level for “price vs MA” narrative. |
| **trend** | `ma50 > ma200` → `golden_cross`, `ma50 < ma200` → `death_cross`, else `neutral` | One-word regime: golden cross (bullish), death cross (bearish). Lets the LLM answer “Is Bitcoin in a golden cross?” from the snapshot. |

---

## CoinGecko: topCoins

Top coins by market cap (e.g. 200) with 24h change.

| Signal | Logic | Why it matters for the LLM |
|--------|--------|----------------------------|
| **marketBreadthAbove50Percent** | % of coins (with 24h data) that have positive 24h return | Breadth > 50% = broad participation; < 50% = narrow rally or sell-off. |
| **avgPriceChange24hTop10** | Mean 24h % change of top 10 coins | How megacaps are moving. |
| **avgPriceChange24hNext90** | Mean 24h % change of ranks 11–100 | Mid-cap segment; divergence vs top 10 (e.g. “alt season”) shows up here. |

Together, global + bitcoinChart + topCoins let the LLM answer dominance, trend, breadth, and “risk-on vs risk-off” from a single derived snapshot.

---

## CoinGecko: trending & categories (discovery)

**Trending:** top 15 trending coins. **Categories:** sectors with market cap / 24h change. We derive compact signals instead of passing raw JSON (thumb URLs, internal IDs).

| Signal | Logic | Why it matters for the LLM |
|--------|--------|----------------------------|
| **hypeVsMarketCapDivergence** | `topTrendingRank > 100` | “The market’s attention has shifted away from blue chips toward secondary assets.” |
| **retailMoonshotPresence** | `trendingCoins.some(rank > 500)` | “There is aggressive speculative activity in low-liquidity, high-risk assets.” |

By providing both, the LLM can distinguish **mid-caps (rank 100–300, catch-up trades)** from **micro-cap / retail moonshots (rank 500+, high-risk meme or pump cycles)**.

---

## Exchange pulse: Coinbase, Kraken, Binance

We fetch **BTC spot/ticker prices** from three exchanges: **Coinbase** (BTC-USD spot), **Kraken** (XBTUSD ticker), **Binance** (BTCUSDT price). These are direct exchange feeds, not aggregators. The LLM shifts from a “Market Historian” (CoinGecko-only) to a **“Live Floor Analyst.”**

**Analytical value:**

- **Real-time validation:** Coinbase and Kraken are the “source of truth” for US institutional and retail flows. If they disagree with CoinGecko, the market is moving too fast for the aggregator to keep up.
- **Arbitrage/volatility signal:** The gap between Coinbase and Kraken (e.g. ~$10) is a direct measure of market stress; in high volatility the gap widens and trading becomes “disjointed.”
- **Flash-move detection:** Direct exchange feeds reflect a flash crash or “god candle” seconds before CoinGecko does.

**Normalization:** We do not feed raw nested JSON (e.g. Kraken’s `result.XXBTZUSD.c[0]`) to the LLM. All exchange data is normalized before it hits the derived object and context:

| Step | What we do |
|------|------------|
| **Type casting** | All prices converted from strings (Kraken/Binance) to `Number`. |
| **Key mapping** | Map `data.amount` (Coinbase), `result.XXBTZUSD.c[0]` (Kraken), `price` (Binance) to uniform keys: `coinbasePrice`, `krakenPrice`, `binancePrice`. |
| **Filtering noise** | Discard currency codes and metadata timestamps not needed for price comparison. |

**Derived signals (from `deriveExchangePulse`):**

| Signal | Logic | Why it matters for the LLM |
|--------|--------|----------------------------|
| **coinbasePrice** / **krakenPrice** / **binancePrice** | Normalized numbers from each exchange | Lets the LLM compare “live” US and global prices. |
| **priceDisparity** | `|coinbasePrice − krakenPrice|` | Direct measure of US exchange stress; e.g. “~$10 gap” = disjointed trading. |
| **usExchangePremium** | `coinbasePrice − geckoBtcPrice` | Premium/discount of US retail vs. global aggregator. |
| **isVolatile** | `priceDisparity > 50` (configurable threshold) | Boolean “stress” signal: trading is disjointed. |

**Pause behavior:** These endpoints use different hostnames (Coinbase, Kraken, Binance). There is no pause between them or between them and CoinGecko; the rate-limit pause applies only when consecutive requests hit the *same* hostname (e.g. multiple CoinGecko calls).

**Note:** Binance may return **HTTP 451 (Unavailable For Legal Reasons)** for requests from restricted jurisdictions (e.g. US, UK). The Data page treats this as a partial failure: other sources and derived data (using Coinbase/Kraken) still succeed, and the UI shows “Data refreshed with 7/8 sources. Failed: binancePrice (451).”

---

## Implementation notes

- **Fetch:** The `api/fetch` route calls each source, persists raw responses, then runs inlined derivation logic (same shape as `lib/derived`) and persists the single `derived` object. The derived object includes `fromGlobal`, `fromBitcoinChart`, `fromTopCoins`, `fromDiscovery`, and `fromExchangePulse` (null if Coinbase/Kraken prices are missing).
- **Chat:** The chat route’s `buildContext` reads `derived` (and optionally raw global/topCoins) from Blob and injects a human-readable summary into the LLM system prompt. If this last-mile connection is missing, the LLM receives no derived signals.
