# Portfolio Dashboard

A live portfolio dashboard built with Next.js (App Router), React, TypeScript and Tailwind.
It shows 20 holdings across 5 sectors, with **real-time prices from Yahoo Finance** and
**P/E ratio + latest earnings scraped from Google Finance**, refreshing every 15 seconds.

Two pages:

- **`/`** — the portfolio: all holdings, grouped by sector with subtotals, live gain/loss.
- **`/stock/[symbol]`** — click any row to drill into one stock: an interactive price chart
  (1D → 5Y) you can scrub, your position in it, key statistics and company background.

```bash
npm install
npm run dev     # http://localhost:3000
```

No API keys or environment variables are needed — both data sources are public.

---

## The elephant in the room: neither API officially exists

The brief asks for Yahoo Finance and Google Finance data and notes that neither offers a
public official API. That is correct, and it is the single most important design constraint in
this project. Here is what is actually true of each, and what this app does about it.

**Yahoo Finance** retired its public quote API years ago. What remains are the undocumented
JSON endpoints the Yahoo web app itself calls, which require a cookie/crumb handshake.
[`yahoo-finance2`](https://github.com/gadicc/node-yahoo-finance2) wraps them and handles that
auth dance. It is the most reliable option available, but it is unofficial: Yahoo can change
or gate these endpoints at any time.

**Google Finance** shut down its API in 2012 and never replaced it, so P/E and earnings can
only come from scraping the public quote page. Google's CSS class names are minified and
rotate without warning — a scraper pinned to `.KxsRFb`/`.SwQK7` works right up until the
morning it silently returns nothing for every stock.

**What this app does about it:**

| Risk | Mitigation |
|---|---|
| Google's minified classes change | The parser has two layers: a fast path on the current classes, and a **class-independent fallback** that finds the leaf element whose *text* is `"P/E ratio"` and reads its sibling. Visible labels change far less often than class hashes. |
| Rate limiting / IP blocks | Aggressive caching (below), a **batched** Yahoo call, a **concurrency cap of 4** on the scraper, and polling that **pauses when the tab is hidden**. |
| A provider fails mid-session | Stale-while-error: the last good value is served and flagged, rather than blanking the cell. |
| The two sources disagree | They genuinely do — Yahoo reported P/E 18.26 for HDFCBANK while Google reported 16.59, because they use different earnings bases. The UI carries a disclaimer rather than claiming a precision it doesn't have. |

Data accuracy is **not guaranteed**; this is a demonstration, not investment advice.

---

## Architecture

```
Browser (client)                   Node backend (Route Handler)        Providers
────────────────                   ────────────────────────────        ─────────
usePortfolio (15s poll)  ─ GET ▶   /api/portfolio                      Yahoo  (1 batched call)
  ├ pauses when hidden               └ portfolio-service               Google (N pages, max 4 at once)
  └ keeps last-good data                 ├ cache (TTL + stale-while-error)
                                         ├ merge + derive
                                         └ group by sector + subtotals
```

**The browser never talks to a financial provider.** Everything — the Yahoo client, the
scraper, its User-Agent, the request cadence, the cache — lives behind the Node route handler.
That keeps scraping behaviour off the client (where it would be blocked by CORS anyway) and
means the client only ever receives finished JSON.

**All derived values are computed server-side** (`Investment`, `Present Value`, `Gain/Loss`,
`Portfolio %`, sector subtotals). The React components only render. Recomputing money in the
view layer is how a UI and its API quietly drift apart.

### Caching — the core rate-limit defence

Poll interval and upstream request rate are deliberately decoupled, with two TTLs, because the
two feeds change at very different speeds:

| Feed | TTL | Why |
|---|---|---|
| **Quotes** (Yahoo) | **15s** | The point of the dashboard. One *batched* call covers all 20 holdings, so a 15s poll is ~4 upstream requests/minute regardless of portfolio size. |
| **Fundamentals** (Google) | **30 min** | P/E and EPS change when a company *reports*, not tick-by-tick. Scraping them every 15s would be 20 page-fetches per cycle for data that is identical 99.9% of the time — the fastest possible route to an IP ban. At 30 min it's ~40 fetches/hour instead of ~4,800. |

The cache also does **dogpile prevention** (concurrent requests for the same key share one
in-flight fetch, so ten open tabs still cost one upstream call) and **stale-while-error** (a
failed refresh serves the last good value, flagged `stale`, instead of throwing).

Measured: **6.9s cold → 7ms warm.**

### Error handling

Failures are degraded, never fatal. The two providers are fetched independently, so if Google
is down you still get live prices, with the P/E column showing an explicit `N/A` and the reason
on hover — not a blank, and never a `0`. In a financial table an empty cell reads as "nothing"
and `0` reads as a real value; both are lies when the truth is "the scrape failed". A failed
*refresh* keeps the last good data on screen under a warning banner rather than emptying the
table.

---

## The stock detail page

Clicking a row opens `/stock/[symbol]`. The reading order is deliberate: **what is it worth
now** (header) → **what did it do** (chart) → **what do I hold** (position) → **fundamentals**
(stats) → **what is the company**. The position card sits *above* the generic fundamentals
because this is a dashboard about your holdings, not a generic quote page.

- **The chart is an instrument, not a picture.** Scrubbing it moves a crosshair and the big
  header price *follows the cursor*, showing the price at that moment and its change from the
  window's baseline. That's the behaviour that makes "what happened on the 30th?" answerable.
- **The line is `linear`, never `monotone`.** Spline smoothing invents a curve between closes —
  implying prices that never traded and rounding off exactly the spikes you opened the chart to
  see. On financial data that isn't a style choice, it's a misrepresentation.
- **The y-axis is not zero-based.** A price chart anchored at zero flattens every real move into
  a line near the top. This is the one legitimate exception to "start at zero", and it applies
  only because it's a line, not a bar.
- **Each range picks its own candle interval** (5m for 1D → 1wk for 5Y), so every window lands
  at ~50–400 points. A 5-year window at daily granularity would be more points than pixels —
  invisible detail that only costs payload.
- **Baseline reference line** marks the window's starting price (previous close for 1D), solid
  rather than dashed — a dashed rule reads as "projection" when it's neither.
- Switching range **dims only the chart**; the header, position and stats stay put, because they
  don't depend on the range.

Opening a detail page for a stock already on the dashboard costs **zero extra Google requests** —
it shares the same 30-minute fundamentals cache entry.

---

## UI/UX decisions worth calling out

- **Green/red is never the only signal.** Every gain/loss figure also carries an arrow (↗/↘)
  and an explicit `+`/`−`, so the table survives red-green colour blindness — which affects a
  meaningful share of any finance audience.
- **Chart colours were validated, not eyeballed.** Sector identity uses a categorical palette
  checked with a CVD/contrast validator against this app's actual light and dark surfaces
  (worst adjacent ΔE 47.2 light / 41.3 dark). Green and red are deliberately *excluded* from
  it — here they mean gain/loss, and a status colour must never double as a series identity.
- **The right chart for the job.** Allocation is part-to-whole → a stacked bar, not a donut
  (the sector weights are 29/26/20/14/12%, and comparing similar *angles* is exactly what a pie
  is worst at). Gain/loss is polarity → a diverging bar anchored to a zero line.
- **The live update is made visible.** A price change flashes the cell green or red for ~1s, and
  a countdown ring shows the next refresh coming. An auto-refreshing number you can't see change
  is indistinguishable from a frozen one.
- **Market state is shown.** A "live" price at 2am is yesterday's close; labelling it
  `Post-market` stops the user thinking the feed is broken.
- **No skeleton flash on refetch.** The previous render is held at reduced opacity, so numbers
  never jump or vanish mid-read. The skeleton is for the first load only.
- Sticky stock-name column, sortable headers, collapsible sectors, search, and full light/dark
  and `prefers-reduced-motion` support.

---

## Tech

Next.js 16 · React 19 · TypeScript · Tailwind v4 · TanStack Table v8 · Recharts ·
`yahoo-finance2` · Cheerio.

The Node backend is a Next.js **Route Handler** (`src/app/api/portfolio/route.ts`) pinned to the
Node runtime — one deployable instead of a separate Express process, which is precisely what
Route Handlers exist for.

## Project layout

```
src/
  app/
    api/portfolio/route.ts     # the dashboard endpoint
    api/stock/[symbol]/route.ts # the detail endpoint
    stock/[symbol]/page.tsx    # the detail page
    page.tsx  layout.tsx  globals.css
  components/                # dashboard, table, sector sections, charts, summary cards
    stock/                   # detail page: price chart + key stats + position
  data/holdings.ts           # the portfolio (swap this for the real sheet)
  hooks/usePortfolio.ts      # 15s polling, pause-on-hidden, keep-last-good
  hooks/useStockDetail.ts    # same, plus range switching
  lib/
    portfolio-service.ts     # fetch → merge → derive → group
    stock-service.ts         # one stock: quote + history + fundamentals + profile
    cache.ts                 # TTL + dogpile prevention + stale-while-error
    limit.ts                 # concurrency cap for the scraper
    providers/yahoo.ts       # CMP (batched) + history + profile
    providers/google.ts      # P/E, EPS, dividends (scraped, with resilient fallback)
    chart-colors.ts  ranges.ts  format.ts  types.ts
```

**To use a different portfolio,** replace `src/data/holdings.ts`. Sectors, weights and subtotals
are all derived from it — nothing else needs to change. Tickers must match what the providers
use (Pidilite is `PIDILITIND`, not `PIDILITE`); an unrecognised symbol degrades to `N/A` on that
row rather than breaking the table.

## Verified behaviour

Checked end-to-end in a real browser, not just assumed:

- Auto-refresh holds a ~15s cadence (measured 15.5s and 15.7s between polls).
- Polling stops entirely while the tab is backgrounded, and resumes immediately on return.
- A simulated provider outage (HTTP 502) keeps all 20 rows on screen under a warning banner.
- Cold request 6.9s → warm 7ms; five concurrent requests share a single upstream fetch.
- Clicking a row navigates to its detail page; the chart crosshair updates the header price.
- All six ranges return sane data (1D trims to one session; 5D to five; 22–262 points each).
- An unknown ticker 404s; an invalid `?range=` falls back to 1M rather than reaching a provider.
- No console errors; both pages render correctly in light, dark, and at 390px mobile.

## Possible next steps

- **WebSockets / SSE** instead of polling, to push only the prices that actually changed.
- **Redis** behind the same `cached()` interface, for a multi-instance deployment (the current
  cache is process-local by design).
- **Fixture tests for the Google parser** — saved HTML snapshots are the only way to catch a DOM
  change without hitting the network, and that scraper *will* break eventually.
