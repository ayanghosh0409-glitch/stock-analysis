#!/usr/bin/env python3
"""Daily sector-news refresh for data/news.json.

For every sector in data/stocks.json it runs a few Google News RSS searches (a sector-theme query
from data/news-queries.json plus one for the sector's largest companies), keeps the headlines from the
last few days, removes duplicates and writes the newest ones. Nothing here judges whether a headline is
good or bad news: the website only shows the headline, its source and date, and which of the sector's
stocks it names (matched with data/stock-aliases.json).

Standard library only, so the job needs no installs. If a sector's searches all fail, its previous
headlines are kept and marked "stale"; the job fails only if no sector could be fetched at all.

Usage: python scripts/refresh_news.py [--out data/news.json]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
FEED = "https://news.google.com/rss/search?"
USER_AGENT = "Mozilla/5.0 (compatible; stock-analysis-news/1.0; +https://github.com/ayanghosh0409-glitch/stock-analysis)"
IST = timezone(timedelta(hours=5, minutes=30))
MAX_PER_SECTOR = 10
COMPANIES_PER_QUERY = 6


def feed_url(query: str, window_days: int) -> str:
    q = f"{query} when:{window_days}d"
    return FEED + urllib.parse.urlencode({"q": q, "hl": "en-IN", "gl": "IN", "ceid": "IN:en"})


def fetch(url: str, retries: int = 2, timeout: int = 20) -> str:
    last: Exception | None = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8", errors="replace")
        except Exception as e:  # noqa: BLE001 - any network failure is handled the same way
            last = e
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"{type(last).__name__}: {last}")


def clean_title(title: str, source: str | None) -> str:
    """Google News appends ' - Source' to every headline; drop it."""
    t = " ".join(title.split())
    if source and t.endswith(" - " + source):
        return t[: -len(source) - 3].rstrip()
    if not source and " - " in t:
        return t.rsplit(" - ", 1)[0].rstrip()
    return t


def norm_key(title: str) -> str:
    """Letters and digits only, cut to the first 60 characters, so the same story syndicated with a different
    ending (for example 'deal- Moneycontrol' and 'deal') counts as one."""
    return re.sub(r"[^a-z0-9]+", " ", title.lower()).strip()[:60].strip()


def parse_feed(xml_text: str, now: datetime, window_days: int, exclude_sources: frozenset[str] = frozenset()) -> list[dict]:
    """Headlines from one RSS document that are recent, dated, and have a web link."""
    root = ET.fromstring(xml_text)
    oldest = now - timedelta(days=window_days)
    out: list[dict] = []
    for item in root.iter("item"):
        raw_title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        pub = (item.findtext("pubDate") or "").strip()
        src_el = item.find("source")
        source = (src_el.text or "").strip() if src_el is not None and src_el.text else ""
        if not raw_title or not link.lower().startswith(("http://", "https://")) or not pub:
            continue
        try:
            when = parsedate_to_datetime(pub)
        except (TypeError, ValueError):
            continue
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        when = when.astimezone(timezone.utc)
        if when < oldest or when > now + timedelta(days=1):
            continue
        title = clean_title(raw_title, source or None)
        if not title or source.lower() in exclude_sources:
            continue
        if not source and " - " in raw_title:
            source = raw_title.rsplit(" - ", 1)[1].strip()
        out.append(
            {
                "title": title,
                "url": link,
                "source": source or "Unknown source",
                "publishedAt": when.isoformat().replace("+00:00", "Z"),
                "date": when.astimezone(IST).strftime("%Y-%m-%d"),
            }
        )
    return out


def merge(items: list[dict], limit: int = MAX_PER_SECTOR) -> list[dict]:
    """Newest first, one entry per headline (the same story arrives from many outlets)."""
    seen: set[str] = set()
    out: list[dict] = []
    for it in sorted(items, key=lambda x: x["publishedAt"], reverse=True):
        key = norm_key(it["title"])
        if key in seen:
            continue
        seen.add(key)
        out.append(it)
        if len(out) >= limit:
            break
    return out


def company_query(sector: dict, aliases: dict[str, list[str]], top_n: int = COMPANIES_PER_QUERY) -> str:
    stocks = sorted(sector["stocks"], key=lambda s: s.get("marketCap") or 0, reverse=True)[:top_n]
    names = [aliases[s["symbol"]][0] for s in stocks if aliases.get(s["symbol"])]
    return "(" + " OR ".join(f'"{n}"' for n in names) + ")" if names else ""


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def refresh_sector(name: str, queries: list[str], window_days: int, now: datetime, fetcher=None, exclude_sources: frozenset[str] = frozenset()) -> tuple[list[dict], list[str]]:
    """Returns (headlines, errors). All queries failing is signalled by headlines being empty and errors being as long as queries."""
    fetcher = fetcher or fetch  # looked up at call time so tests can replace fetch
    items: list[dict] = []
    errors: list[str] = []
    for q in queries:
        try:
            items += parse_feed(fetcher(feed_url(q, window_days)), now, window_days, exclude_sources)
        except Exception as e:  # noqa: BLE001
            errors.append(f"{name}: {e}")
    return merge(items), errors


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(DATA / "news.json"))
    args = ap.parse_args(argv)
    out_path = Path(args.out)

    stocks = load_json(DATA / "stocks.json", {"sectors": []})
    aliases = load_json(DATA / "stock-aliases.json", {})
    cfg = load_json(DATA / "news-queries.json", {"windowDays": 7, "themes": {}})
    window = int(cfg.get("windowDays", 7))
    exclude = frozenset(str(x).lower() for x in cfg.get("excludeSources", []))
    previous = load_json(DATA / "news.json", {"sectors": {}}).get("sectors", {})
    now = datetime.now(timezone.utc)

    sectors: dict[str, dict] = {}
    report: list[str] = []
    fetched_any = False
    for sec in stocks["sectors"]:
        name = sec["name"]
        queries = [q for q in (cfg.get("themes", {}).get(name, ""), company_query(sec, aliases)) if q]
        items, errors = refresh_sector(name, queries, window, now, exclude_sources=exclude)
        if queries and len(errors) == len(queries):
            kept = [i for i in previous.get(name, {}).get("items", []) if i.get("publishedAt", "") >= (now - timedelta(days=window)).isoformat()]
            sectors[name] = {"status": "stale" if kept else "error", "items": kept}
            report.append(f"| {name} | {len(kept)} | {'stale' if kept else 'error'} | {errors[0][:90]} |")
        else:
            fetched_any = True
            sectors[name] = {"status": "ok", "items": items}
            note = f"{len(errors)} of {len(queries)} searches failed" if errors else ""
            report.append(f"| {name} | {len(items)} | ok | {note} |")

    result = {"fetchedAt": now.isoformat().replace("+00:00", "Z"), "windowDays": window, "sectors": sectors}
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")

    print("| Sector | Headlines | Status | Note |\n| --- | --- | --- | --- |")
    print("\n".join(report))
    for name, s in sectors.items():
        for it in s["items"][:3]:
            print(f"  [{name}] {it['date']} {it['source']}: {it['title'][:100]}")
    if not fetched_any:
        print("No sector could be fetched.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
