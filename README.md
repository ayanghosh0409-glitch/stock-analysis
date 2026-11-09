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

## Weekly refresh

`.github/workflows/refresh-market-data.yml` runs every Monday at 07:00 IST (and on demand from the Actions tab). It runs
`scripts/refresh_market_data.py`, which uses `yfinance` to update price and 52-week high/low, rescales market cap and P/E by
the price change, writes `data/refresh-report.md`, and commits. A push redeploys the site.

If a ticker fails, its previous values are kept and listed in the report. `yfinance` is unofficial and can break;
the job fails only if nothing could be refreshed.

Fundamentals are **not** refreshed by this job. Update them after results (Aug, Nov, Feb, May quarterly; May–June annual).

## Deploy

Import the repo in Vercel (free tier). No environment variables are needed.
