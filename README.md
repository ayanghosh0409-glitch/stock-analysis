# Stock Analysis

A personal, sector-wise stock screener. It gives a first-pass view of whether a stock deserves a closer look.

**Rule:** a stock is *considered* when its ROE is greater than the industry ROE **and** above a 15% minimum ROE. The
industry ROE is the median of the *other* profitable stocks listed in its sector (the stock itself and loss-making
companies are left out), or your own override. It is rated **Strong** when ROCE also beats the industry ROCE,
**Moderate** when only ROE passes, and **Skip** otherwise. Comparison is strict, so a stock exactly at the cut-off fails.
A stock within 2 points of its ROE cut-off is marked **Near cut-off**, because a small data change could flip it.

Each sector also gets a **Peer set** grade (Solid, Caution or Weak) from how many profitable stocks it has, how many
loss-making ones were left out, and how widely ROE varies. The minimum ROE, the borderline band and the peer-set
thresholds are constants at the top of `src/lib/screen.ts`.

**Profit consistency** (five years of net profit) is a *separate flag* and never changes the verdict:
Consistent, Recovering, Mixed, Weak, or Insufficient data.

**Recent searches:** clicking the search box lists the searches you made in the last 7 days (up to 8, newest first);
choosing one runs it. A search is saved when you press Enter, pick it from the list or leave the box. They are kept only
in your browser (`localStorage`), never sent anywhere, and can be cleared from the list. The limits are constants in
`src/lib/recent.ts`.

**Overview:** each sector is a card. The top part is the sector benchmark (ROE cut-off, industry ROCE, peer-set grade);
below it are two stock-level breakdowns, labelled with how many stocks they cover: the screen result (Strong, Moderate, Skip
in a ring) and profit consistency (a segmented bar). A stat strip above the cards totals all sectors. The search and filters
sit with the stock table because they only filter that table. The counting logic is in `src/lib/overview.ts`.

**Sector tabs** use the same card look: headline numbers for the sector, the screen-result ring and consistency bar, the ROE vs
ROCE chart, and a collapsible panel with the benchmark workings and your overrides. The stock table sits below with its filters.

**Look and feel:** the colours and the Inter typeface follow a fintech reference design. All colours are CSS tokens at the
top of `src/app/globals.css` (light and dark), checked for WCAG AA contrast; the font is self-hosted through
`@fontsource-variable/inter`, so the page makes no font requests to other sites.

Screening aid only, not investment advice.

## Run locally

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
npm test         # unit tests for the screening logic
```

## Data

- `data/stocks.json` holds 62 stocks across IT, Auto, Auto Components, Auto Batteries, Pharma and FMCG, including notes on
  one-off items. Fundamentals come from public Screener.in pages (as of the `asOf` date in the file).
- Revenue and profit are trailing twelve months, in ₹ crore. ROE and ROCE are fractions.
- The industry benchmark is built from the stocks listed here, so it is only as good as the peer set. Check the Peer set
  grade for each sector (Auto Batteries is thin and has loss-making companies).

## Look up a company that is not on the list

Search for a name that matches none of the listed stocks and the page offers to look it up on Yahoo Finance (NSE and BSE). Pick the company and the page shows a **preview**: its ROE, ROCE, profit trend and the screen's verdict against a sector you choose (the one Yahoo's industry maps to is suggested). The preview never changes the list or any sector's benchmark (the only thing that can be saved is a missing figure, see below).

- Two small server routes do the work, `/api/lookup` (search) and `/api/stock` (figures), through the open-source `yahoo-finance2` package. They validate their input, are limited per caller and send cache headers, so repeated lookups do not hit Yahoo again.
- Yahoo does not publish ROCE, and its own ROE is a trailing figure, so both are worked out from its annual statements (`src/lib/yahoo.ts`). They can differ from Screener.in's by around 10%, and Yahoo returns four years of annual profit where the list holds five. The preview says so, and lists which of the needed figures Yahoo did and did not supply.
- Banks and lenders usually have no ROCE from Yahoo, so they get no verdict.
- The workflow **Live check: Yahoo lookup** runs the real fetch for a spread of companies and prints a report in its run summary. It is the only place the real Yahoo calls are exercised, because the build environment cannot reach Yahoo.

## Figures visitors enter (shared database)

When Yahoo Finance has no ROE or ROCE for a company (banks usually have no ROCE), the preview shows a box beside the missing figure. Whatever a visitor types is saved in a shared Postgres database and shown to everyone who previews that company, marked "entered by visitors" and unverified.

Rules that keep an open form safe (all in `src/lib/figures.ts`, covered by tests that run the real SQL on an in-process Postgres):

- Only ROE and ROCE can be entered, between -100% and 200%.
- An entered figure only fills a gap. If Yahoo has the figure, Yahoo's wins.
- The figure shown is the median of the last 5 entries, so one wrong or hostile value cannot decide it.
- Entries are only added, never overwritten, so a bad one can be found and deleted (`db/schema.sql`).
- One caller can add 20 entries an hour (counted in the database from a salted hash of the IP; the IP itself is not stored).

**Setup.** The site works without a database: until one is connected, the box simply does not appear. To switch it on, add a Postgres database to the Vercel project (Storage tab, Neon or Supabase, connect it to all environments). The integration sets `DATABASE_URL` or `POSTGRES_URL` (a prefix such as `STORAGE_POSTGRES_URL` is fine too), which is all the site needs; the table is created on first use. Optionally set `FIGURES_SALT` to any random string so the stored hashes cannot be matched to an IP by guessing.

## Sector news

Each sector tab shows a **Latest news** panel: headlines from the last 7 days, each tagged with the sector's stocks it names
(click a tag to open the stock). `.github/workflows/refresh-news.yml` runs every morning (IST), runs
`scripts/refresh_news.py` (standard library only), and commits `data/news.json`; a push redeploys the site. The website only
reads that file, so a failed fetch never breaks the page: the previous headlines stay, marked as earlier.

- Source: Google News RSS searches. The search terms per sector are in `data/news-queries.json` (edit freely); the job also
  searches the six largest companies of each sector.
- Tagging uses the names in `data/stock-aliases.json` (whole-word, case-insensitive). Add an entry there when you add a stock;
  a test fails if one is missing or if two stocks share a name.
- It shows headlines only. A tag means the company is named, not that the news is good or bad for it. The headlines are collected
  automatically and not reviewed.
- Run the job's tests with `python -m unittest discover -s scripts -p "test_*.py"`.

## Weekly refresh

`.github/workflows/refresh-market-data.yml` runs every Monday at 07:00 IST (and on demand from the Actions tab). It runs
`scripts/refresh_market_data.py`, which uses `yfinance` to update price and 52-week high/low, rescales market cap and P/E by
the price change, writes `data/refresh-report.md`, and commits. A push redeploys the site.

If a ticker fails, its previous values are kept and listed in the report. `yfinance` is unofficial and can break;
the job fails only if nothing could be refreshed.

Fundamentals are **not** refreshed by this job. Update them after results (Aug, Nov, Feb, May quarterly; May–June annual).

## Deploy

Import the repo in Vercel (free tier). No environment variables are needed.
