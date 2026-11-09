#!/usr/bin/env python3
"""Weekly market-data refresh for data/stocks.json.

Updates only what moves daily: price, 52-week high/low, market cap and P/E.
Fundamentals (revenue, profit, ROE, ROCE, 5-year history) are NOT touched here;
they change when companies report results and are refreshed separately.

Market cap and P/E are rescaled by the price change (shares and earnings are
unchanged until the next results), so they stay on the same basis as the
fundamentals already in the file. Every symbol is handled on its own: if
anything fails, the old values are kept and the failure is listed in the report.
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "stocks.json"
REPORT = ROOT / "data" / "refresh-report.md"

# Yahoo tickers to try, in order, where the default (<SYMBOL>.NS, or .BO for BSE codes) is wrong.
OVERRIDES: dict[str, list[str]] = {
    "LTM": ["LTM.NS", "LTIM.NS"],
}
MOVE_FLAG = 0.25  # flag weekly price moves bigger than this
STALE_DAYS = 7  # skip a ticker whose last price is older than this


def candidates(symbol: str) -> list[str]:
    if symbol in OVERRIDES:
        return OVERRIDES[symbol]
    return [f"{symbol}.BO"] if symbol.isdigit() else [f"{symbol}.NS"]


def fetch(tickers: list[str]) -> dict[str, pd.DataFrame]:
    raw = yf.download(
        tickers, period="1y", interval="1d", auto_adjust=False,
        group_by="ticker", threads=True, progress=False,
    )
    out: dict[str, pd.DataFrame] = {}
    for t in tickers:
        try:
            df = raw[t] if len(tickers) > 1 else raw
            df = df.dropna(subset=["Close"])
            if len(df):
                out[t] = df
        except (KeyError, TypeError):
            pass
    return out


def main() -> int:
    data = json.loads(DATA.read_text(encoding="utf-8"))
    stocks = [s for sec in data["sectors"] for s in sec["stocks"]]
    wanted = sorted({t for s in stocks for t in candidates(s["symbol"])})
    frames = fetch(wanted)

    today = dt.date.today()
    updated, failed, flagged = [], [], []
    for s in stocks:
        sym = s["symbol"]
        df = next((frames[t] for t in candidates(sym) if t in frames), None)
        if df is None:
            failed.append((sym, "no data returned"))
            continue
        last_day = df.index[-1].date()
        if (today - last_day).days > STALE_DAYS:
            failed.append((sym, f"last price is from {last_day}"))
            continue
        price = round(float(df["Close"].iloc[-1]), 2)
        hi, lo = round(float(df["High"].max()), 2), round(float(df["Low"].min()), 2)
        if not (price > 0 and hi >= price * 0.999 and lo <= price * 1.001):
            failed.append((sym, f"implausible values price={price} hi={hi} lo={lo}"))
            continue
        old = float(s["price"])
        ratio = price / old if old else 1.0
        if abs(ratio - 1) > MOVE_FLAG:
            flagged.append((sym, old, price))
        s["price"], s["high52"], s["low52"] = price, hi, lo
        s["marketCap"] = round(s["marketCap"] * ratio)
        if s.get("pe") is not None:
            s["pe"] = round(s["pe"] * ratio, 1)
        updated.append(sym)

    if updated:
        data["asOf"] = today.isoformat()
        DATA.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")

    lines = [f"# Market data refresh {today}", "",
             f"Updated {len(updated)} of {len(stocks)} stocks.", ""]
    if failed:
        lines += ["## Kept previous values (failed)", ""] + [f"- {a}: {b}" for a, b in failed] + [""]
    if flagged:
        lines += [f"## Moved more than {int(MOVE_FLAG*100)}% since last refresh (check)", ""]
        lines += [f"- {a}: {o} -> {n}" for a, o, n in flagged] + [""]
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines))
    # Fail the job only if nothing at all could be refreshed (e.g. Yahoo changed its API).
    return 0 if updated else 1


if __name__ == "__main__":
    sys.exit(main())
