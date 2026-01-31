# 🚀 Conversational Crypto Dashboard (POC)

### A proof-of-concept demonstrating how to build an LLM-powered assistant informed by real-time cryptocurrency market data.

<p align="center"><img src="src/assets/screenshot.png" alt="Screenshot" /></p>

## What This POC Demonstrates

This application shows a simple architecture for building AI assistants that work with external data sources. Instead of letting the LLM make live API calls or hallucinate information, we:

1. **Fetch data on-demand** - A single button retrieves comprehensive market data. 

      - Currently from CoinGecko (global metrics, top 200 coins, Bitcoin historical prices)

2. **Compute derived insights** - A calculation layer transforms raw data into actionable metrics (moving averages, golden/death cross signals, market breadth, dominance ratios)
3. **Persist everything** - Both raw and derived data are stored, creating a consistent snapshot
4. **Inform the LLM** - The chat interface loads this persisted data and injects it as context. We want to  ensure every answer is grounded in actual market data

**The result: An AI crypto analyst that answers questions like "Is Bitcoin in a golden cross?" or "What's the current BTC dominance?" based on real data, not training knowledge.**


## Summary of the Workflow

   - User Action: Sends a message (e.g., "What is the BTC trend?").
   - App Action: Fetches the latest crypto stats from your storage.
   - Formatting: Turns those numbers into a list of sentences.
   - AI Call: Sends the list + the user's question to OpenAI.
   - Response: OpenAI returns a text answer based only on that data.



## Key Architecture Decisions

**Two Separate Flows:**
- **Fetch flow** - Button triggers data collection, calculation, and persistence (no LLM involved)
- **Chat flow** - Loads persisted data, passes it as context to the LLM, returns text responses

**Storage-First Design:**
The LLM never calls external APIs. All responses come from a single data snapshot stored in Vercel Blob/KV. This makes the system predictable, testable, and cost-effective.

**POC Scope:**
Text-only responses for initial launch. The architecture supports future enhancements (tables, charts, structured data) without requiring a rebuild.

## What You Can Ask

- Whatever you want; but the LLM is fed information that will give it particular insight into:
- Market overview questions ("What's the total crypto market cap?")
- Bitcoin-specific analysis ("Is BTC in a golden cross right now?")
- Comparative insights ("How are the top 10 coins performing vs the market?")
- Trend analysis ("What's the 24-hour volume ratio?")

All answers are based on the most recently fetched data snapshot.

## Role of the `systemPrompt`

In the context of an LLM, the systemPrompt is the operating system of the conversation.  It is extremely important — not just for the "vibe" of the AI, but for the accuracy of the data it provides.

1. The "Grounded" Constraint

   In the code currently:

    **"Use ONLY the following persisted data to answer. Do not use live data or external knowledge beyond this snapshot."**

   This is a **guardrail**. Without this exact phrasing, if a user asks "What is the price of Bitcoin?", GPT might use its training data from six months ago or try to guess. By being strict, we force the AI to behave like a UI component that only reads the provided JSON.

2. Preventing "Hallucinations"

   Phrasing like **"If the data does not contain what the user asks for, say so briefly"** is a **safety switch**.

    Bad Phrasing: "Answer the user's questions about crypto." (The AI might make up a price if it's missing from your blob).

    Your Phrasing: **Forces the AI to admit ignorance rather than lying**, which is vital when dealing with financial data.

3. Formatting and Token Efficiency

   The way we've built the context string (using bullet points and clear labels) makes it easier for the model to "parse" the data.

    LLMs find structured lists (like the ones generated in the buildContext function) much easier to navigate than a raw, messy JSON dump.

    Clear phrasing helps the model distinguish between derived metrics (like the Moving Average) and raw metrics (like total market cap).



## TODO, Notes, and Fiddling around...

👉🏽 Take a look at [data-sources.md](./data-sources.md) for details on which endpoints are fetched, and why.

**Data page (chunked refresh):** The Data page runs refresh in **chunked steps** (one source per request, 9 steps total) so each serverless call stays under Vercel’s timeout. The UI shows progress (“Fetching 1/9 (global)…”) and waits 15s between CoinGecko steps to avoid rate limits. After step 9 it loads the current snapshot via `GET /api/data` for the accordion.


#### If the AI is still "wandering" or giving too much advice, we can tighten the phrasing further:

      Current phrasing: "You are a crypto market analyst."

      - Change to: "You are a data retrieval assistant." (If you want it to be less 'chatty' and more factual).

      Current phrasing: "answer... briefly"

      - Change to: "Answer in 2 sentences max." (To save on OpenAI costs and keep the UI clean).

      Can also add:  "Always start your answer with the timestamp of the data provided." (To ensure the user knows the data might be stale)


### Notes on model choice and amount of context provided

    Theoretical Limit: gpt-4o-mini has a context window of 128,000 tokens (roughly 90,000+ words). The 3 fetches likely total less than 2,000 tokens. We could technically increase data load by 50x before the API would even throw an error.

    Practical Limit (The "U-Shaped" Curve): Research shows that **LLMs suffer from "Lost in the Middle."** As the context grows, they become very good at remembering the very beginning and very end of your prompt, but they start to overlook details buried in the middle. 
    
    **Performance usually starts to degrade noticeably after 32,000 to 64,000 tokens.**


### How to Monitor "Token Pressure"

```
const { text, usage } = await generateText({   // add the usage prop
  model: openai('gpt-4o-mini'),
  system: systemPrompt,
  prompt: message,
});

// Usage is returned from generateText and sent to the UI:
// { text, usage: { promptTokens, completionTokens, totalTokens } }
```

The chat UI includes a **Token Counter** that shows per-response and session totals (prompt, completion, total) and the prompt’s share of the 128k context. Per-response usage appears under each assistant reply.

**If we ever overload the context:** the standard solution is RAG (Retrieval-Augmented Generation)—e.g. a search tool that feeds only the data for the coins the user mentioned.

Data sources (CoinGecko global, bitcoinChart, topCoins, trending, categories; Coinbase, Kraken, Binance for BTC spot/ticker) and the derived signals we compute from each are documented in **[data-sources.md](./data-sources.md)**.


## Misc

   - Add a markdown interpreter for the Assistant output.

## Tech Stack

- **Frontend:** React + Vite boilerplate, deployed on Vercel
- **Backend:** Vercel serverless functions (Node.js)
- **Data:** CoinGecko API (free layer); Coinbase, Kraken, Binance (BTC spot/ticker for live floor)
- **LLM:** OpenAI (via AI SDK -  not free!)
- **Storage:** Vercel Blob;  maybe switch to KV later.
- **Testing:** Vitest

## Getting Started

1. Set environment variables: `OPENAI_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `APP_PASSWORD` (see Local development below). The dashboard at `/cryptochat` is protected by the password gate.
2. Run `npx vercel dev`, then open the app (e.g. http://localhost:3000).
3. Go to **Data** (`/cryptochat/data`) and click **Refresh data** to load and persist market data.
4. Go to **Chat** (`/cryptochat`) and ask questions (e.g. “What’s BTC dominance?”, “Is Bitcoin in a golden cross?”).



## Local development

You can run the app locally in two ways: frontend only (Vite) or frontend + API (Vercel dev).

### 1. Frontend only

From the project root:

```shell
npm run dev
```

Vite starts a dev server at **http://localhost:5173** (or the next free port). You get the React app with HMR. No API routes run because there is no `api/` folder yet. Use this when you only need the UI and no backend.

### 2. Frontend + API (full local)

To run the app like Vercel locally (Vite app + serverless API routes in `api/`), use the [Vercel CLI](https://vercel.com/download): `vercel dev` (or `npx vercel dev`). That starts a local server that serves the frontend and runs the API routes locally.

1. **Install the Vercel CLI** (project or global):

   ```shell
   npm i -D vercel
   ```

   Optionally add a script to `package.json`:

   ```json
   "dev:full": "vercel dev"
   ```

2. **Run local dev**:

   ```shell
   npx vercel dev
   ```

   Or, if you added the script:

   ```shell
   npm run dev:full
   ```

   This serves the Vite app and runs your `api/*` handlers. The URL is usually **http://localhost:3000** (Vercel dev default).

3. **Env vars** (for `OPENAI_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `APP_PASSWORD`, etc.):

   **Vercel dev injects env from your Vercel project, not only from `.env.local`.** So:

   1. In the [Vercel Dashboard](https://vercel.com/dashboard), open your project → **Settings** → **Environment Variables**.
   2. Add each variable (e.g. `APP_PASSWORD`, `OPENAI_API_KEY`, `BLOB_READ_WRITE_TOKEN`) and scope it to **Development** (and Production if you deploy).
   3. Locally, run:
      ```shell
      npx vercel env pull .env.local
      ```
      That syncs the project’s env into `.env.local`. Add `.env.local` to `.gitignore` if it is not already there.
   4. Restart `vercel dev` (Ctrl+C, then `npx vercel dev` again).

   **If you only add a variable to `.env.local` by hand** (without adding it in the Vercel project and running `vercel env pull`), the API routes may still see it as unset, because `vercel dev` can inject env from the project rather than re-reading `.env.local` for the serverless process.

   **"APP_PASSWORD not configured" / "OPENAI_API_KEY not configured" / "BLOB_READ_WRITE_TOKEN not set":** (1) Add the variable in Vercel Dashboard (Development). (2) Run `npx vercel env pull .env.local`. (3) Restart `npx vercel dev`. (4) Use `npx vercel dev` (not `npm run dev`) so the API runs.

### Storage (Vercel Blob)

Crypto data (raw + derived) is stored in Vercel Blob. Create a Blob store in the Vercel project (Storage tab → Connect → Blob); that sets `BLOB_READ_WRITE_TOKEN`. Use `vercel env pull .env.local` so the API can read/write. The helper lives in `lib/storage.ts` (`write`, `read`, `deleteAll` for keys `global`, `topCoins`, `bitcoinChart`, `derived`).

Summary

Only React (current setup): npm run dev → http://localhost:5173
React + API (after adding api/): npx vercel dev (and optionally vercel env pull .env.local) → http://localhost:3000
