# Stock Analysis

A personal, sector-wise stock screener. It gives a first-pass view of whether a stock deserves a closer look.

**Rule:** a stock is *considered* when its ROE is greater than the industry ROE **and** above a 15% minimum ROE. The
industry ROE is the median of the *other* profitable stocks listed in its sector (the stock itself and loss-making
companies are left out), or your own override. It is rated **Strong** when ROCE also beats the industry ROCE,
**Moderate** when only ROE passes, and **Skip** otherwise. Comparison is strict, so a stock exactly at the cut-off fails.
A stock within 2 points of its ROE cut-off is marked **Near cut-off**, because a small data change could flip it.

Each sector also gets a **Peer set** grade (Good, Fair or Weak) from how many profitable stocks it has, how many
loss-making ones were left out, and how widely ROE varies. The minimum ROE, the borderline band and the peer-set
thresholds are constants at the top of `src/lib/screen.ts`.

**Profit consistency** (the last four years of annual net profit, as Yahoo supplies them) is a *separate flag* and never
changes the verdict: Consistent (profit grew in at least 2 of 3 year-on-year steps, no loss year), Recovering, Mixed, Weak,
or Insufficient data.

**Recent searches:** clicking the search box lists the searches you made in the last 7 days (up to 8, newest first);
choosing one runs it. A search is saved when you press Enter, pick it from the list or leave the box. They are kept only
in your browser (`localStorage`), never sent anywhere, and can be cleared from the list. The limits are constants in
`src/lib/recent.ts`.

**Navigation:** a sidebar down the left (a slide-in menu on phones) lists the **Overview**, **All stocks** (every stock in one
table, a company in two sectors once) and **Sectors**, each with a count. Under them are the sectors you pinned (three at most;
until you pin one, the three listed sectors with the most stocks), the three most recently built from Yahoo, and an "All sectors"
link, so the sidebar is the same length however many sectors are built. Its filter box looks through every sector. Pins are kept
in your browser only (`src/lib/pins.ts`). Each page has its own address after a `#` (`#/`, `#/all`, `#/sectors`,
`#/sector/IT`), so a page can be linked to and the back button works; the address logic is in `src/lib/route.ts`. A link to a
sector a visitor built for their visit only stops working after they leave, and says so.

**Sectors page:** the one page that lists every sector. Each row shows the stock count, a bar of how many stocks are Strong,
Moderate, Near cut-off (a Skip that missed the ROE cut-off by 2 points or less) and Skip, the median ROE, the share that pass
(Strong plus Moderate) and the peer-set grade; a row opens that sector and a pin button puts it in the sidebar. A search box,
Listed / Built from Yahoo chips, a peer-set filter and a sort narrow the table, and it pages 10, 25 or 50 rows at a time. The
bar is told apart by fill and hatching as well as colour, and has a text alternative. The search, filters and paging logic is in
`src/lib/sectorsPage.ts`.

**Search:** the box at the top of every page (press `/` to jump to it) finds sectors and stocks on the site by name or ticker as
you type, and opening a result goes to that sector or stock. It matches spelling, not meaning, and covers only what is on the
page. When no stock fits, it offers a Yahoo Finance lookup. The matching is in `src/lib/siteSearch.ts`. The separate search
with recent searches above the stock table only filters that table.

**Overview:** a stat strip totals all sectors, then the sector builder, then every sector as a collapsible row: closed it shows
the sector's name and stock count; open it shows the sector benchmark (ROE cut-off, industry ROCE, peer-set grade), the screen
result (Strong, Moderate, Skip in a ring) and profit consistency (a segmented bar). The counting logic is in
`src/lib/overview.ts`.

**Sector pages** show headline numbers for the sector, the screen-result ring and consistency bar, the ROE vs ROCE chart, and a
collapsible panel with the benchmark workings and your overrides. The stock table sits below with its filters.

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

- `data/stocks.json` holds 62 stocks across IT, Auto, Auto Components, Auto Batteries, Pharma and FMCG. **The source is Yahoo
  Finance**, the same as the company lookup, and ROE, ROCE and profit are worked out by the same code (`src/lib/yahoo.ts`).
  Two stocks are still on their earlier Screener.in figures, and say so in their data notes: Nestlé India (Yahoo has no ROCE and
  only three years of profit for it) and Gold Star Power (held back on purpose, see below).
- Revenue and profit are trailing twelve months, in ₹ crore. ROE and ROCE are fractions, worked out from the latest annual
  statements, so they can differ from Screener's by around 10%. Yahoo gives four annual years where Screener gave five.
- The industry benchmark is built from the stocks listed here, so it is only as good as the peer set. Check the Peer set
  grade for each sector (Auto Batteries is thin and has loss-making companies).

**Re-sourcing from Yahoo.** The workflow **Re-source stocks from Yahoo** (`.github/workflows/resource-yahoo.yml`, script
`scripts/resource-yahoo.ts`) fetches every listed stock for real and prints a before/after report in its run summary: ROE and ROCE
old and new, which verdicts change, which figures moved by more than 5 points, and which hand-written notes need a look. Run
by hand with **apply** ticked, it also writes the new figures into `data/stocks.json`. A stock keeps its old figures, and is
listed in the report, when Yahoo lacks a figure the screen needs, or when it is in `HOLD_BACK` in `src/lib/resource.ts` (remove
the entry to let Yahoo's figures in on the next run). Notes that only described the old Screener page were removed; the rest
are kept. `scripts/refresh_market_data.py` still refreshes price, 52-week range, market cap and P/E weekly.

## Look up a company that is not on the list

Search for a name that matches none of the listed stocks and the page offers to look it up on Yahoo Finance (NSE and BSE). Pick the company and the page shows a **preview**: its ROE, ROCE, profit trend and the screen's verdict against a sector you choose (the one Yahoo's industry maps to is suggested). The preview never changes the list or any sector's benchmark (the only thing that can be saved is a missing figure, see below).

- Two small server routes do the work, `/api/lookup` (search) and `/api/stock` (figures), through the open-source `yahoo-finance2` package. They validate their input, are limited per caller and send cache headers, so repeated lookups do not hit Yahoo again.
- Yahoo does not publish ROCE, and its own ROE is a trailing figure, so both are worked out from its annual statements (`src/lib/yahoo.ts`). They can differ from Screener.in's by around 10%, and Yahoo returns four years of annual profit where the list holds five. The preview says so, and lists which of the needed figures Yahoo did and did not supply.
- Banks and lenders usually have no ROCE from Yahoo, so they get no verdict.
- The workflow **Live check: Yahoo lookup** runs the real fetch for a spread of companies and prints a report in its run summary. It is the only place the real Yahoo calls are exercised, because the build environment cannot reach Yahoo.

## Build a sector from Yahoo Finance

Type a sector or industry (banks, pharma, real estate) into the box at the top of the page. The site checks the name against
Yahoo's own list, offers a choice if several match or the nearest names if none does, then fetches the ten largest NSE
companies in it by market cap and screens them with the same rules as the listed sectors. The new sector appears as a tab, and
is then kept for every visitor (see below). If it could not be kept, it stays for that visit only and "Remove this sector" takes it away.

- **No Yahoo call to find a sector.** `data/yahoo-taxonomy.json` holds Yahoo's 11 sectors and 145 industries, spelled exactly as
  Yahoo's screener expects (with a long dash: `Banks—Regional`). Yahoo answers an unknown name with zero stocks, not an error, so
  the check cannot be left to Yahoo. `src/lib/sectorMatch.ts` does the matching.
- **Top ten lists** live in `data/sector-lists.json`, written by the "Refresh sector lists" workflow every Monday
  (`scripts/refresh-sector-lists.ts`). Sectors and industries with no NSE stocks are left out, and 60-odd industries hold fewer
  than ten stocks because Yahoo has fewer. Run the workflow by hand with "apply" ticked to refresh it on demand.
- **Each company's figures** come from `/api/stock`, the same route the company lookup uses. With a database set up, what Yahoo
  returned is kept in the `preview_cache` table for a week and served from there, so a second visitor costs Yahoo nothing.
- **Banks, lenders and insurers** are judged on ROE alone (ROCE means little for them), so their best result is Moderate.
- **Shared with everyone.** Once a visitor's build finishes, the browser asks `POST /api/sectors` with only the Yahoo name. The
  server builds its own copy from the Yahoo cache (and from Yahoo for anything missing), never from figures a browser sent, and keeps
  it in the `shared_sectors` table. Every visitor's page loads those sectors from `GET /api/sectors`. Rules: the name must be one of
  the stored lists; at most 40 shared sectors; 6 saves a minute per caller; nothing is saved if Yahoo did not answer for some
  companies (a company Yahoo can never give, such as a dollar reporter, is just left out); a copy older than a week is rebuilt when
  someone builds it again. Without a database the sector stays for that visit only. To take one off the site, delete its row.

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
