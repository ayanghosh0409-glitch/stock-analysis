#!/usr/bin/env python3
"""Spike: can yfinance supply the fundamentals the screen needs?

Fetches a handful of stocks that are already in data/stocks.json and lines Yahoo's figures up
against the ones the site shows today (ROE, ROCE, market cap, trailing profit, annual profit
history, sector). It never writes to data/stocks.json. The output is a report for a person to read
and judge, so every figure is printed next to its source and nothing is averaged away.

Yahoo does not publish ROCE, so it is derived from the statements two ways (year-end capital
employed and average capital employed). ROE is shown as Yahoo's own figure and derived from the
statements on average equity, because a mismatch with Screener may come from the definition and not
from the data.

Usage: python scripts/spike_yfinance_fundamentals.py [--symbols TCS M&M ...] [--out report.md]
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import pandas as pd
import yfinance as yf

sys.path.insert(0, str(Path(__file__).resolve().parent))
from refresh_market_data import candidates  # noqa: E402  (same Yahoo ticker rules as the weekly price job)

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "stocks.json"
CRORE = 1e7
DEFAULT_SYMBOLS = ["TCS", "M&M", "SUNPHARMA", "HINDUNILVR", "504093"]  # a large cap in four sectors + a small BSE-coded one
CLOSE = 0.10  # within 10% counts as close

NET_INCOME = ("Net Income Common Stockholders", "Net Income")
EBIT = ("EBIT", "Operating Income")
EQUITY = ("Stockholders Equity", "Common Stock Equity", "Total Equity Gross Minority Interest")
ASSETS = ("Total Assets",)
CUR_LIABS = ("Current Liabilities", "Total Current Liabilities")


def annual_series(df: pd.DataFrame | None, names: tuple[str, ...]) -> list[float]:
    """Values for the first matching statement row, oldest year first, with missing years dropped."""
    if df is None or getattr(df, "empty", True):
        return []
    for n in names:
        if n in df.index:
            row = df.loc[n]
            pairs = [(c, v) for c, v in row.items() if v is not None and not pd.isna(v)]
            return [float(v) for _, v in sorted(pairs, key=lambda p: p[0])]
    return []


def _ratio(num: float | None, den: float | None) -> float | None:
    if num is None or den is None or den <= 0:
        return None
    return num / den


def _avg_last_two(xs: list[float]) -> float | None:
    return (xs[-1] + xs[-2]) / 2 if len(xs) >= 2 else None


def derive(info: dict, income: pd.DataFrame | None, balance: pd.DataFrame | None) -> dict:
    """The figures the site needs, in the site's units (rupees crore, ratios as fractions). Anything Yahoo
    does not supply stays None; nothing is guessed."""
    profit = annual_series(income, NET_INCOME)
    ebit = annual_series(income, EBIT)
    equity = annual_series(balance, EQUITY)
    assets = annual_series(balance, ASSETS)
    cur = annual_series(balance, CUR_LIABS)
    n = min(len(assets), len(cur))
    capital = [a - c for a, c in zip(assets[-n:], cur[-n:])] if n else []

    def crore(v):
        return round(v / CRORE, 1) if isinstance(v, (int, float)) and not math.isnan(v) else None

    ttm = info.get("netIncomeToCommon")
    return {
        "marketCap": crore(info.get("marketCap")),
        "profitTTM": crore(ttm),
        "profitHistory": [crore(v) for v in profit],
        "roeYahoo": info.get("returnOnEquity"),
        "roeFyAvgEquity": _ratio(profit[-1] if profit else None, _avg_last_two(equity)),
        "roceFyEnd": _ratio(ebit[-1] if ebit else None, capital[-1] if capital else None),
        "roceFyAvg": _ratio(ebit[-1] if ebit else None, _avg_last_two(capital)),
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "years": len(profit),
    }


def rel_diff(ours: float | None, theirs: float | None) -> float | None:
    """(theirs - ours) / |ours|, or None when either side is missing or ours is zero."""
    if ours is None or theirs is None or ours == 0:
        return None
    return (theirs - ours) / abs(ours)


def verdict(diff: float | None) -> str:
    if diff is None:
        return "missing"
    return "close" if abs(diff) <= CLOSE else "differs"


def compare(stock: dict, got: dict) -> list[dict]:
    """One row per figure: ours, Yahoo's, the gap and whether it is close."""
    rows = []

    def add(label, ours, theirs, pct=False):
        d = rel_diff(ours, theirs)
        rows.append({"metric": label, "ours": ours, "yahoo": theirs, "diff": d, "verdict": verdict(d), "pct": pct})

    add("Market cap (cr)", stock.get("marketCap"), got["marketCap"])
    add("Profit, trailing (cr)", stock.get("profit"), got["profitTTM"])
    add("ROE: Yahoo figure", stock.get("roe"), got["roeYahoo"], True)
    add("ROE: latest year / avg equity", stock.get("roe"), got["roeFyAvgEquity"], True)
    last_roce = (stock.get("roceHistory") or [stock.get("roce")])[-1]
    add("ROCE: year-end capital", last_roce, got["roceFyEnd"], True)
    add("ROCE: average capital", last_roce, got["roceFyAvg"], True)
    # Yahoo gives about four annual statements, the site holds five years: line up the latest years only.
    ours_hist, y_hist = stock.get("profitHistory") or [], got["profitHistory"]
    k = min(len(ours_hist), len(y_hist), 4)
    for i in range(k, 0, -1):
        add(f"Annual profit, {'latest' if i == 1 else f'{i - 1} yr earlier'} (cr)", ours_hist[-i], y_hist[-i])
    return rows


def fetch_one(symbol: str) -> tuple[str | None, dict | None, str]:
    """(yahoo ticker used, derived figures, error). Tries each candidate ticker until one returns statements."""
    last = "no data returned"
    for t in candidates(symbol):
        try:
            tk = yf.Ticker(t)
            info = tk.info or {}
            income, balance = tk.income_stmt, tk.balance_sheet
            if annual_series(income, NET_INCOME) or info.get("marketCap"):
                return t, derive(info, income, balance), ""
            last = f"{t}: empty response"
        except Exception as e:  # noqa: BLE001 - one bad ticker must not stop the others
            last = f"{t}: {type(e).__name__}: {e}"
    return None, None, last


def fmt(v, pct: bool = False) -> str:
    if v is None:
        return "-"
    return f"{v * 100:.1f}%" if pct else f"{v:,.1f}"


def render(results: list[dict]) -> str:
    out = ["# yfinance fundamentals vs the figures on the site", ""]
    totals = {"close": 0, "differs": 0, "missing": 0}
    for r in results:
        out.append(f"## {r['symbol']} ({r['name']}, {r['sector']})")
        if r["error"]:
            out += [f"Could not fetch: {r['error']}", ""]
            continue
        g = r["got"]
        out.append(f"Yahoo ticker `{r['ticker']}`; sector per Yahoo: {g['sector'] or '-'} / {g['industry'] or '-'}; annual statements returned: {g['years']}")
        out += ["", "| Figure | Site today | Yahoo | Gap | |", "| --- | --- | --- | --- | --- |"]
        for row in r["rows"]:
            totals[row["verdict"]] += 1
            gap = "-" if row["diff"] is None else f"{row['diff'] * 100:+.0f}%"
            out.append(f"| {row['metric']} | {fmt(row['ours'], row['pct'])} | {fmt(row['yahoo'], row['pct'])} | {gap} | {row['verdict']} |")
        out.append("")
    out.append(f"**Overall:** {totals['close']} close (within {int(CLOSE * 100)}%), {totals['differs']} differ, {totals['missing']} missing.")
    return "\n".join(out)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbols", nargs="+", default=DEFAULT_SYMBOLS)
    ap.add_argument("--out", default="")
    args = ap.parse_args(argv)

    data = json.loads(DATA.read_text(encoding="utf-8"))
    by_symbol = {s["symbol"]: (s, sec["name"]) for sec in data["sectors"] for s in sec["stocks"]}
    results = []
    for sym in args.symbols:
        if sym not in by_symbol:
            results.append({"symbol": sym, "name": "?", "sector": "?", "error": "not in data/stocks.json"})
            continue
        stock, sector = by_symbol[sym]
        ticker, got, err = fetch_one(sym)
        results.append({"symbol": sym, "name": stock["name"], "sector": sector, "ticker": ticker, "got": got, "error": err,
                        "rows": compare(stock, got) if got else []})
    report = render(results)
    print(report)
    if args.out:
        Path(args.out).write_text(report + "\n", encoding="utf-8")
    return 0 if any(r.get("got") for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
