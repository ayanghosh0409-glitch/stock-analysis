# Stock Analysis

A personal, sector-wise stock screener. It gives a first-pass view of whether a stock deserves a closer look.

**Rule:** a stock is *considered* when its ROE is greater than the industry ROE (the median of the stocks listed in its
sector, or your own override). It is rated **Strong** when ROCE also passes, **Moderate** when only ROE passes, and
**Skip** otherwise. A "Below" mode flips the direction. Comparison is strict, so a stock exactly at the benchmark fails.

**Profit consistency** (five years of net profit) is a *separate flag* and never changes the verdict:
Consistent, Recovering, Mixed, Weak, or Insufficient data.

Screening aid only, not investment advice.

## Run locally

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
```

## Data

- `data/stocks.json` holds 62 stocks across IT, Auto, Auto Components, Auto Batteries, Pharma and FMCG, including notes on
  one-off items. Fundamentals come from public Screener.in pages (as of the `asOf` date in the file).
- Revenue and profit are trailing twelve months, in ₹ crore. ROE and ROCE are fractions.
- The industry benchmark is the median over the stocks listed here, so it is only as good as the peer set
  (Auto Batteries is thin).

## Weekly refresh

`.github/workflows/refresh-market-data.yml` runs every Monday at 07:00 IST (and on demand from the Actions tab). It runs
`scripts/refresh_market_data.py`, which uses `yfinance` to update price and 52-week high/low, rescales market cap and P/E by
the price change, writes `data/refresh-report.md`, and commits. A push redeploys the site.

If a ticker fails, its previous values are kept and listed in the report. `yfinance` is unofficial and can break;
the job fails only if nothing could be refreshed.

Fundamentals are **not** refreshed by this job. Update them after results (Aug, Nov, Feb, May quarterly; May–June annual).

## Deploy

Import the repo in Vercel (free tier). No environment variables are needed.
