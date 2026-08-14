# Portfolio Dashboard

A multi-market portfolio tracker built with Next.js (App Router), React, TypeScript and Tailwind,
backed by Neon Postgres. Public visitors get a live market overview; signed-in users get their own
**transaction ledger** with FIFO cost basis, realized/unrealized P&L, a watchlist, a screener, and
live futures & options chains.

Covers **US (NASDAQ/NYSE)** and **India (NSE/BSE)**. Prices come from Yahoo Finance; P/E and latest
earnings are scraped from Google Finance.

## Routes

| Route | Access | What it is |
|---|---|---|
| `/` | public | Market overview — indices, top gainers/losers per market, crypto, commodities |
| `/derivatives` | public | Futures watchlist + live option chains ("F&O") |
| `/portfolio` | signed in | Your holdings dashboard, realized P&L, and the trade ledger |
| `/watchlist` | signed in | Tracked symbols with sortable columns, plus the stock screener |
| `/stock/[symbol]` | signed in | One stock: scrubale price chart, your position, stats, company background |
| `/login` | public | Google sign-in |

## Setup

```bash
npm install
cp .env.example .env.local         # then fill in the values below
npm run dev                        # http://localhost:3000
```

Requires **Node ≥ 22** (`yahoo-finance2` refuses to run below it; see `.nvmrc`).

Unlike the original version of this app, environment variables **are** required now that there's a
database and sign-in:

| Variable | Where it comes from |
|---|---|
| `DATABASE_URL` | Neon connection string (pooled) |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google Cloud Console OAuth 2.0 client |

The Google OAuth client needs `http://localhost:3000/api/auth/callback/google` registered as an
authorized redirect URI, or sign-in fails with `redirect_uri_mismatch`.

Apply the schema with `npx drizzle-kit push` (the project has always used `push` rather than a
generated migration history — see [Migrations](#migrations)).

---

## The elephant in the room: neither API officially exists

Neither Yahoo Finance nor Google Finance offers a public official API. That is the single most
important design constraint in this project.

**Yahoo Finance** retired its public quote API years ago. What remains are the undocumented JSON
endpoints the Yahoo web app itself calls, which require a cookie/crumb handshake.
[`yahoo-finance2`](https://github.com/gadicc/node-yahoo-finance2) wraps them and handles that auth
dance. It is the most reliable option available, but it is unofficial: Yahoo can change or gate
these endpoints at any time. **In practice it already rate-limits** — bare probes return HTTP 429,
and connect timeouts to `query1.finance.yahoo.com` happen under load.

**Google Finance** shut down its API in 2012 and never replaced it, so P/E and earnings can only
come from scraping the public quote page. Google's CSS class names are minified and rotate without
warning — a scraper pinned to `.KxsRFb`/`.SwQK7` works right up until the morning it silently
returns nothing for every stock.

**What this app does about it:**

| Risk | Mitigation |
|---|---|
| Google's minified classes change | The parser has two layers: a fast path on the current classes, and a **class-independent fallback** that finds the leaf element whose *text* is `"P/E ratio"` and reads its sibling. Visible labels change far less often than class hashes. |
| Rate limiting / IP blocks | Aggressive caching (below), **batched** Yahoo calls, a **concurrency cap of 4** on the scraper, polling that **pauses when the tab is hidden**, and **market-hours-aware TTLs** that stop refetching when the relevant market is shut. |
| A provider fails mid-session | Stale-while-error: the last good value is served and flagged, rather than blanking the cell. |
| The two sources disagree | They genuinely do — Yahoo reported P/E 18.26 for HDFCBANK while Google reported 16.59, because they use different earnings bases. The UI carries a disclaimer rather than claiming a precision it doesn't have. |

Data accuracy is **not guaranteed**; this is a demonstration, not investment advice. For anything
public-facing, both the reliability and the terms-of-service picture argue for a licensed feed.

---

## Architecture

```
Browser (client)                Node backend (Route Handlers)          Data
────────────────                ─────────────────────────────          ────
usePortfolio (15s poll) ─GET▶  /api/portfolio ── verifySession        Neon Postgres
  ├ pauses when hidden            └ portfolio-service                   ├ transaction (ledger)
  ├ skips ticks when the             ├ holdings-repo ─ matchFifo ───────┤ portfolio_snapshot
  │   market is closed              ├ cache (TTL + stale-while-error)   ├ watchlist
  └ keeps last-good data            ├ merge + derive                    └ Auth.js tables
                                    └ group by market → sector
useWatchlist / useMarketOverview                                      Yahoo  (batched)
useFuturesWatchlist / useOptionChain                                  Google (max 4 at once)
```

**The browser never talks to a financial provider.** Everything — the Yahoo client, the scraper,
its User-Agent, the request cadence, the cache — lives behind Node route handlers. That keeps
scraping behaviour off the client (where CORS would block it anyway) and means the client only ever
receives finished JSON.

**All derived values are computed server-side** (investment, present value, gain/loss, portfolio %,
sector subtotals, realized P&L). The React components only render. Recomputing money in the view
layer is how a UI and its API quietly drift apart.

### Auth

Auth.js (NextAuth v5) with the Google provider and the Drizzle adapter. The session strategy is
**JWT, not database** — deliberately. `SiteHeader` calls `auth()` in the root layout, so a database
session meant a live Neon round-trip (measured 300ms–1.2s here) on *every single navigation*.
The JWT carries `user.id` and the adapter is still used at sign-in to create the user/account rows.

Access control lives in the **data access layer** (`src/lib/dal.ts`), not in middleware:
`verifySession()` is called by every protected page, route handler and server action. Gating close
to the data means a new endpoint can't accidentally be public.

### Money is never blended across currencies

US positions are USD, Indian positions are INR, and there is **no combined grand total anywhere** —
a single number mixing the two would be meaningless without an FX rate the app doesn't have.
Holdings are bucketed by market, and every weight and subtotal is computed against that market's
own investment total. Sector grouping happens *within* a market.

---

## The transaction ledger

The portfolio is an **append-only ledger of trades**, not a list of positions. Each row is one BUY
or SELL (quantity always positive; `side` carries the direction). A *position* is the FIFO-matched
result of its trades — computed at read time, never stored — so quantity, average cost and realized
gains always reflect the current ledger.

### FIFO cost basis

`src/lib/fifo.ts` is pure and I/O-free, and that's the point: **the same function decides what a
position is when rendering and whether a trade is legal when writing.** Two implementations of that
rule would eventually disagree, and the ledger would accept a trade it then couldn't display
correctly.

FIFO specifically because Indian equity taxation mandates it, and it's the default nearly
everywhere else — one method serves both markets.

It handles partial lot consumption, a sale spanning several lots, same-day buy-then-sell, full
closes, and overselling (flagged, never silently negative). Fees follow the shares they were paid
for, so a partial sale carries only its proportional slice.

```
BUY 10 @ 10 ─┐
BUY 10 @ 20 ─┼─ SELL 25  →  cost basis 450 (10×10 + 10×20 + 5×30), 5 shares left @ 30
BUY 10 @ 30 ─┘              …not 25 × the 20 average.
```

Two consequences worth knowing:

- **Average cost is of the shares *still held*.** Once anything is sold, FIFO has consumed the
  oldest lots; averaging every lot ever bought would misstate what remains.
- **Fully-sold positions leave the holdings table** and appear under closed positions. A
  zero-quantity row would otherwise linger in the table, in the quote cache key, and in symbol
  resolution on the detail page.

### Realized vs unrealized

Realized results hang *alongside* the open-position totals rather than inside them. `Totals` is
extended by sector groups and consumed by the summary cards, sector charts and holdings table —
none of which mean anything for a position that no longer exists. Widening it would have forced a
change in all of them and muddied a type that means "open positions".

The UI shows a **Realized Gain / Loss** card only once something has been sold (an always-present
"Realized: 0" would take a fifth of the row to say nothing), and a collapsible panel breaks it down
per closed position with a **short/long-term split** at the 365-day line — the number that decides
the tax bill, and invisible in a plain total.

Markets you've fully exited still render, seeded from their closed positions: selling your last
Indian holding shouldn't erase the record of how it went.

### Guards

Both write-path guards run `matchFifo` over the *prospective* ledger and reject if it oversells:

- adding a SELL larger than the holding as of its trade date;
- deleting a BUY that a later SELL already consumed.

### Snapshots

`portfolio_snapshot` records investment, present value and cumulative realized gain — one row per
user per market per day, upserted on portfolio load.

This exists because portfolio history **cannot be reconstructed after the fact**: deriving it would
need historical prices for every held symbol on every past day, which the free data source won't
provide at reasonable cost. Recording forward is the only cheap option, which is why the table
ships *before* the chart that will use it.

Honest limitation: upserting on read needs no cron, but only records on days you open the app.
Gaps are real and a chart must handle them. A scheduled job can replace it without touching the
table.

### Migrations

There is no generated migration history — the schema has always been applied with
`drizzle-kit push`. The one data migration that needed care (buy-only `holding_lot` →
buy/sell `transaction`) is a hand-written, idempotent script:

```bash
npx tsx --env-file=.env.local scripts/migrate-transactions.ts
```

It renames in place (metadata-only in Postgres, so instant), backfills every existing row as a
`BUY`, adds `side`/`fees`, and asserts the row count is unchanged before finishing. Generating a
Drizzle baseline instead would have emitted `CREATE TABLE` for tables that already existed.

---

## Caching — the core rate-limit defence

Poll interval and upstream request rate are deliberately decoupled. TTLs vary by **how fast the
data actually changes** and by **whether the market is even open**:

| Feed | Open | Closed | Why |
|---|---|---|---|
| **Quotes** (Yahoo) | 15s | 30 min | The point of the dashboard. One *batched* call covers every holding, so cadence is independent of portfolio size. |
| **Fundamentals** (Google) | 30 min | 30 min | P/E and EPS change when a company *reports*, not tick-by-tick. Scraping every 15s would be N page-fetches per cycle for data identical 99.9% of the time — the fastest route to an IP ban. |
| **Market overview** | 60s | 30 min | Per market, so a closed NSE doesn't stop US refreshes. |
| **Screener** | 60s | 30 min | |
| **Option chains** | 60s | 30 min | US equity options trade exactly the equity session. |
| **Futures** | 60s | 30 min | Uses a **separate futures calendar**, not the equity one — see below. |

`src/lib/market-hours.ts` resolves this with `Intl.DateTimeFormat` and explicit IANA zones, no date
library. Holidays aren't modelled: a trading holiday falls back to the closed TTL slightly early,
which is the safe direction to be wrong in.

**Futures need their own calendar.** CME futures trade roughly Sunday 18:00 → Friday 17:00 ET with
an hour's break each evening, so reusing the equity session would have frozen the cache through
most of the hours futures actually trade. `isFuturesMarketOpen()` models that instead, which
recovers the ~49-hour weekend halt — thousands of upstream calls a week that provably cannot return
new data.

The cache also does **dogpile prevention** (concurrent requests for one key share a single
in-flight fetch, so ten open tabs cost one upstream call) and **stale-while-error** (a failed
refresh serves the last good value, flagged `stale`, instead of throwing). It is process-local by
design; Redis would drop in behind the same `cached()` interface for a multi-instance deployment.

Measured: **6.9s cold → 7ms warm.**

### Error handling

Failures are degraded, never fatal. The two providers are fetched independently, so if Google is
down you still get live prices, with the P/E column showing an explicit `N/A` and the reason on
hover — not a blank, and never a `0`. In a financial table an empty cell reads as "nothing" and `0`
reads as a real value; both are lies when the truth is "the scrape failed". A failed *refresh*
keeps the last good data on screen under a warning banner rather than emptying the table.

One caveat: stale-while-error can only help if something was cached. A cold start plus a throttled
upstream still surfaces an error.

---

## Futures & options

`/derivatives` is public — market data, not personal holdings.

**Futures** is a curated card grid (index futures and commodities), each card carrying price,
change, a plain-language note on what the contract actually tracks (`ES=F` teaches a newcomer
nothing on its own), and a 52-week range bar. A "near 52-week high/low" badge appears only when
it's true — signal when there's signal, silence otherwise.

**Options** is a real calls/puts chain for a chosen underlying, with an expiration picker and an
**OI/volume heatmap** shading each strike by concentration, so the strikes the market is positioned
around are visible at a glance. It defaults to a *Simple* view (ATM ±8 strikes, no volume column)
with a *Full* view one click away, plus a collapsed glossary.

**Two limitations, discovered by testing rather than assumed:**

- **Options are US-only.** Yahoo returns zero expirations for NSE/BSE symbols and for raw indices
  (`^NSEI`, `^GSPC`) — index exposure needs a proxy ETF like SPY. This is enforced in the data
  layer, so an Indian ticker gets an accurate "this source carries no Indian derivatives" message
  instead of a misleading "this stock has no options" after a wasted round-trip.
- **Futures have no expiry chain.** Only continuous/front-month contracts are available, so
  "pick a future" means picking an instrument, not an expiry month. The UI is built as a watchlist
  rather than pretending to be a chain.

---

## The stock detail page

The reading order is deliberate: **what is it worth now** (header) → **what did it do** (chart) →
**what do I hold** (position) → **fundamentals** → **what is the company**. The position card sits
*above* generic fundamentals because this is a dashboard about your holdings, not a quote page.

- **The chart is an instrument, not a picture.** Scrubbing moves a crosshair and the big header
  price *follows the cursor*, showing the price at that moment and its change from the window's
  baseline. That's what makes "what happened on the 30th?" answerable.
- **The line is `linear`, never `monotone`.** Spline smoothing invents a curve between closes —
  implying prices that never traded and rounding off exactly the spikes you opened the chart to
  see. On financial data that isn't a style choice, it's a misrepresentation.
- **The y-axis is not zero-based.** A price chart anchored at zero flattens every real move into a
  line near the top. This is the one legitimate exception to "start at zero", and it applies only
  because it's a line, not a bar.
- **Each range picks its own candle interval** (5m for 1D → 1wk for 5Y), so every window lands at
  ~50–400 points. A 5-year window at daily granularity would be more points than pixels.
- **Baseline reference line** marks the window's starting price (previous close for 1D), solid
  rather than dashed — a dashed rule reads as "projection" when it's neither.
- Switching range **dims only the chart**; header, position and stats stay put.

Opening a detail page for a stock already on the dashboard costs **zero extra Google requests** —
it shares the same 30-minute fundamentals cache entry.

---

## UI/UX decisions worth calling out

- **Green/red is never the only signal.** Every gain/loss figure also carries an arrow (↗/↘) and an
  explicit `+`/`−`, so the table survives red-green colour blindness.
- **Chart colours were validated, not eyeballed.** Sector identity uses a categorical palette
  checked with a CVD/contrast validator against this app's actual light and dark surfaces (worst
  adjacent ΔE 47.2 light / 41.3 dark). Green and red are deliberately *excluded* — here they mean
  gain/loss, and a status colour must never double as a series identity.
- **The right chart for the job.** Allocation is part-to-whole → a stacked bar, not a donut
  (comparing similar *angles* is exactly what a pie is worst at). Gain/loss is polarity → a
  diverging bar anchored to a zero line.
- **The live update is made visible.** A price change flashes the cell green or red for ~1s, and a
  countdown shows the next refresh. An auto-refreshing number you can't see change is
  indistinguishable from a frozen one.
- **No fake countdown after hours.** When the market is closed the live indicator says so instead
  of ticking toward a refresh that won't fetch anything.
- **Market state is shown.** A "live" price at 2am is yesterday's close; labelling it `Post-market`
  stops the user thinking the feed is broken.
- **No skeleton flash on refetch.** The previous render is held at reduced opacity, so numbers never
  jump or vanish mid-read. The skeleton is for the first load only.
- **Sell can only sell what you hold.** In the trade form, choosing *Sell* replaces the symbol
  search with a picker of open positions and locks the identity fields — you can't sell a company
  you don't own, and retyping its details would only invite a typo that silently creates a second
  position.
- Sticky stock-name column, sortable headers, collapsible sectors, search, active-page nav
  highlighting, and full light/dark and `prefers-reduced-motion` support.

---

## Tech

Next.js 16 · React 19 · TypeScript · Tailwind v4 · Neon Postgres · Drizzle ORM ·
Auth.js (NextAuth v5) · TanStack Table v8 · Recharts · `yahoo-finance2` · Cheerio · Zod.

The backend is Next.js **Route Handlers** pinned to the Node runtime — one deployable instead of a
separate Express process, which is precisely what Route Handlers exist for.

`src/instrumentation.ts` disables Node's IPv6 connection racing (`setDefaultAutoSelectFamily(false)`
+ `ipv4first`). Without it, connections to Neon intermittently pick a blackholed IPv6 route and
`fetch` simply fails. Standalone scripts need the same treatment.

## Project layout

```
src/
  app/
    page.tsx                     # public market overview
    portfolio/  watchlist/  derivatives/  login/  stock/[symbol]/
    actions/                     # server actions (trades, watchlist)
    api/
      portfolio/  watchlist/  stock/[symbol]/  symbol-search/  screener/
      market/  derivatives/{futures,options}/  auth/[...nextauth]/
  components/
    PortfolioDashboard  PortfolioTable  SummaryCards  SectorCharts  SectorSection
    portfolio/   # AddTradeForm, TransactionsList, RealizedPanel, ManageHoldingsSection
    watchlist/   # WatchlistDashboard, WatchlistTable/Grid, StockScreener
    derivatives/ # DerivativesDashboard, FuturesWatcher, OptionChain
    market/  landing/  stock/  ui/
  db/
    schema.ts                    # transaction, portfolio_snapshot, watchlist, Auth.js tables
    index.ts                     # Drizzle + Neon client
  hooks/                         # polling hooks: portfolio, watchlist, market, screener, F&O
  lib/
    fifo.ts                      # FIFO matching — pure, the one piece of real domain logic
    holdings-repo.ts             # ledger reads/writes; positions via matchFifo
    snapshots-repo.ts            # daily portfolio marks
    portfolio-service.ts         # fetch → merge → derive → group by market/sector
    stock-service.ts  watchlist-service.ts  market-service.ts
    screener-service.ts  derivatives-service.ts
    market-hours.ts              # session calendars incl. a separate futures calendar
    cache.ts                     # TTL + dogpile prevention + stale-while-error
    limit.ts  dal.ts  api.ts  cadence.ts  format.ts  types.ts
    providers/yahoo.ts           # quotes, history, movers, search, screener, futures, options
    providers/google.ts          # P/E, EPS (scraped, with resilient fallback)
scripts/
  fifo-check.ts                  # 30 assertions over the FIFO engine
  migrate-transactions.ts        # holding_lot → transaction, idempotent
```

## Verified behaviour

Checked against real data, not assumed:

- **FIFO: 30 assertions pass** (`npx tsx scripts/fifo-check.ts`) — FIFO beating average cost, a sale
  spanning three lots, proportional fee apportionment, the 364/365/366-day term boundary,
  same-day buy-then-sell, oversell flagged, and reopening after a full close.
- **Realized P&L against a real ledger row** (500 @ ₹50): a 200 @ ₹70 partial sale leaves 300 open
  at ₹50 average and books ₹4,000; selling the remaining 300 @ ₹80 closes the position and totals
  ₹13,000. Overselling is refused.
- Migration preserved its row count exactly; the ledger restored cleanly afterwards.
- Auto-refresh holds a ~15s cadence (measured 15.5s and 15.7s); polling stops while the tab is
  backgrounded and resumes on return; background ticks are skipped when markets are closed.
- A simulated provider outage (HTTP 502) keeps every row on screen under a warning banner.
- Cold request 6.9s → warm 7ms; five concurrent requests share one upstream fetch.
- Live option chains return real data (AAPL: 42 calls / 40 puts across 21 expirations); a
  non-optionable symbol 404s gracefully rather than crashing.
- All six chart ranges return sane data (1D trims to one session; 5D to five; 22–262 points each);
  an unknown ticker 404s; an invalid `?range=` falls back to 1M without reaching a provider.
- Protected routes redirect and their APIs 401 when signed out.
- No console errors; renders correctly in light, dark, and at 390px.

## Possible next steps

Roughly in order of value:

- **XIRR and benchmark comparison** — absolute gain/loss is misleading with staggered purchases.
  Money-weighted return plus "did I beat the Nifty/S&P" is the question investors actually ask.
  The transaction ledger is the foundation this needed.
- **The portfolio growth chart**, from the snapshots now accruing.
- **Dividends** and **corporate actions** (splits/bonuses) — today a 1:10 split silently corrupts
  cost basis with no error.
- **Broker CSV import** (Zerodha, Groww, Fidelity) — nobody hand-types 200 trades.
- **Tax reports** — India STCG/LTCG with the ₹1.25L exemption; US short/long term. The
  short/long-term split already computed is the groundwork.
- **FX attribution** for cross-market holdings — separating "the stock went up" from "the rupee
  fell" is genuinely rare and exactly what an Indian investor holding US equities wants to know.
- **A licensed data feed**, if this ever goes public. See the rate-limiting note above.
- **Redis** behind the same `cached()` interface for a multi-instance deployment.
- **Fixture tests for the Google parser** — saved HTML snapshots are the only way to catch a DOM
  change without hitting the network, and that scraper *will* break eventually.
