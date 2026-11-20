"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Dataset, Sector } from "@/lib/types";
import {
  BORDERLINE_BAND,
  ROE_FLOOR,
  benchmarkFor,
  benchmarks,
  isBorderline,
  peerHealth,
  profitTrend,
  roeMargin,
  verdict,
  type Override,
  type Verdict,
} from "@/lib/screen";
import StockTable, { sortValue, type Row, type SortKey } from "./StockTable";
import StockDetail from "./StockDetail";
import RecentSearch from "./RecentSearch";
import SectorView from "./SectorView";
import NewsPanel from "./NewsPanel";
import type { NewsFile } from "@/lib/news";
import SectorCards, { OverviewStats, type SectorSummary } from "./SectorCards";
import LookupPanel from "./LookupPanel";
import SectorBuilder from "./SectorBuilder";
import BuiltBanner from "./BuiltBanner";
import { firstPerSymbol, tally } from "@/lib/overview";
import { isFresh } from "@/lib/sharedSectors";
import { fmtPct } from "./format";
import Sidebar from "./Sidebar";
import GlobalSearch from "./GlobalSearch";
import NotificationCenter, { type WatchInfo } from "./NotificationCenter";
import { useWatchNotify } from "./useWatchNotify";
import { isFull } from "@/lib/watchlist";
import SectorsPage from "./SectorsPage";
import { ALL_STOCKS, OVERVIEW, SECTORS, tabFromHash, hashForTab } from "@/lib/route";
import type { SiteSector, SiteStock } from "@/lib/siteSearch";
import { PINS_KEY, defaultPins, effectivePins, parsePins, recentlyBuilt, togglePin, MAX_PINS } from "@/lib/pins";
import { buildSectorRows } from "@/lib/sectorsPage";

const STORE = "stock-analysis:v1";

// `floor` is optional because overrides saved before the ROE floor existed do not have it.
type Overrides = Record<string, { roe: string; roce: string; floor?: string }>;

const toFraction = (s: string | undefined): number | null => {
  if (!s || !s.trim()) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n / 100 : null;
};

const toOverride = (o: Overrides[string] | undefined): Override | undefined =>
  o ? { roe: toFraction(o.roe), roce: toFraction(o.roce), floor: toFraction(o.floor) } : undefined;

export default function Dashboard({ data, news }: { data: Dataset; news: NewsFile }) {
  // The page showing: Overview, All stocks, or a sector's name. It follows the address bar (see lib/route).
  const [tab, setTab] = useState(OVERVIEW);
  const [menuOpen, setMenuOpen] = useState(false);
  const pendingPick = useRef<string | null>(null);
  // The stocks this visitor watches and the notifications about them, kept in this browser.
  const { watch, notices, now, toggle: toggleWatch, unwatch, dismiss, clearNotices } = useWatchNotify();
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [verdictFilter, setVerdictFilter] = useState<"all" | "consider" | "strong">("all");
  const [trendFilter, setTrendFilter] = useState<"all" | "good">("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "verdict", asc: true });
  const [selected, setSelected] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Sectors built from Yahoo. `shared` are kept by the server and shown to every visitor; `built` are this visitor's own
  // builds, shown until the server has kept them (or for good if it could not). Both sit beside the listed sectors but are
  // kept out of the overview totals.
  const [shared, setShared] = useState<Sector[]>([]);
  const [built, setBuilt] = useState<Sector[]>([]);
  const [shareState, setShareState] = useState<Record<string, string>>({}); // by Yahoo name: "saving", or why it was not kept
  const [sharedLoaded, setSharedLoaded] = useState(false); // false until the server has answered, so a linked sector is not called missing too early
  // The sectors this visitor pinned to the sidebar, kept in this browser. Null until they pin or unpin one, so the defaults show.
  const [pinsStored, setPinsStored] = useState<string[] | null>(null);
  const sectors = useMemo(() => {
    const mine = new Set(built.map((b) => b.built?.yahooName));
    return [...data.sectors, ...shared.filter((s) => !mine.has(s.built?.yahooName)), ...built];
  }, [data, shared, built]);
  const listedList = useMemo(() => data.sectors.map((s) => s.name), [data]);
  // Opens a page, and a stock on it when `pick` is given. The address changes, and the page follows it.
  const go = (t: string, pick: string | null = null) => {
    if (tabFromHash(window.location.hash) === t) {
      setTab(t);
      setSelected(pick);
      return;
    }
    pendingPick.current = pick;
    window.location.hash = hashForTab(t);
  };
  const upsert = (list: Sector[], sec: Sector) => [...list.filter((x) => x.built?.yahooName !== sec.built?.yahooName), sec];
  const setShare = (yahooName: string, v: string | null) =>
    setShareState((m) => {
      const next = { ...m };
      if (v === null) delete next[yahooName];
      else next[yahooName] = v;
      return next;
    });

  // Offers this visitor's build to the server, which builds and keeps its own copy for everyone (the browser's figures are not sent).
  const share = async (sec: Sector) => {
    const y = sec.built!.yahooName;
    setShare(y, "saving");
    try {
      const res = await fetch("/api/sectors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: y }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.sector) {
        setShare(y, typeof body?.error === "string" ? body.error : "it could not be saved.");
        return;
      }
      setShared((l) => upsert(l, body.sector as Sector));
      setBuilt((b) => b.filter((x) => x.built?.yahooName !== y));
      setShare(y, null);
    } catch {
      setShare(y, "the server could not be reached.");
    }
  };
  const onBuilt = (sec: Sector) => {
    setBuilt((b) => upsert(b, sec));
    setQuery("");
    go(sec.name);
    void share(sec);
  };
  // A sector that is already shared and fresh needs no new build: just show it.
  const onExisting = (yahooName: string) => {
    const have = shared.find((x) => x.built?.yahooName === yahooName);
    if (!have || !isFresh(have.built?.builtAt) || built.some((b) => b.built?.yahooName === yahooName)) return false;
    setQuery("");
    go(have.name);
    return true;
  };
  const removeBuilt = (name: string) => {
    setBuilt((b) => b.filter((x) => x.name !== name));
    setShareState({});
    go(OVERVIEW);
  };

  // Per-viewer conveniences only; the page works without storage. Read once after
  // mount so server and client render the same first paint.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORE);
      if (raw) {
        const v = JSON.parse(raw);
        if (v.overrides && typeof v.overrides === "object") setOverrides(v.overrides);
      }
    } catch {}
    try {
      setPinsStored(parsePins(window.localStorage.getItem(PINS_KEY)));
    } catch {}
    setLoaded(true);
    // Open the page the address names, and follow it when the address changes (a link, or the back button).
    setTab(tabFromHash(window.location.hash));
    const onHash = () => {
      setTab(tabFromHash(window.location.hash));
      setSelected(pendingPick.current);
      pendingPick.current = null;
      setMenuOpen(false);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  // The sectors other visitors have built and the server keeps. If this fails the page is just the listed sectors.
  useEffect(() => {
    const ctl = new AbortController();
    fetch("/api/sectors", { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (b && Array.isArray(b.sectors)) setShared(b.sectors as Sector[]);
      })
      .catch(() => {})
      .finally(() => {
        if (!ctl.signal.aborted) setSharedLoaded(true);
      });
    return () => ctl.abort();
  }, []);
  // The phone menu: Escape closes it, and focus goes in when it opens and back to its button when it closes.
  useEffect(() => {
    if (!menuOpen) return;
    const btn = menuButton.current;
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      btn?.focus();
    };
  }, [menuOpen]);
  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(STORE, JSON.stringify({ overrides }));
    } catch {}
  }, [overrides, loaded]);
  useEffect(() => {
    if (!loaded || pinsStored === null) return;
    try {
      window.localStorage.setItem(PINS_KEY, JSON.stringify(pinsStored));
    } catch {}
  }, [pinsStored, loaded]);

  // Each stock is judged against its sector peers without itself (benchmarkFor), while the
  // sector-wide figures below are the reference shown in summaries and on the chart.
  const allRows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const sec of sectors) {
      const ov = toOverride(overrides[sec.name]);
      for (const stock of sec.stocks) {
        const bench = benchmarkFor(stock, sec.stocks, ov);
        const t = profitTrend(stock);
        out.push({
          stock,
          sector: sec.name,
          verdict: verdict(stock, bench),
          consistency: t.consistency,
          cagr: t.cagr,
          bench,
          margin: roeMargin(stock, bench),
          borderline: isBorderline(stock, bench),
        });
      }
    }
    return out;
  }, [sectors, overrides]);

  const sectorInfo = useMemo(
    () =>
      Object.fromEntries(
        sectors.map((sec) => [sec.name, { bench: benchmarks(sec.stocks, toOverride(overrides[sec.name])), health: peerHealth(sec.stocks) }]),
      ),
    [sectors, overrides],
  );

  // The overview covers every sector on the page, listed or built, with each company counted once.
  const overviewRows = useMemo(() => firstPerSymbol(allRows), [allRows]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (tab === ALL_STOCKS ? overviewRows : allRows.filter((r) => r.sector === tab)).filter((r) => {
      if (q && !(r.stock.name.toLowerCase().includes(q) || r.stock.symbol.toLowerCase().includes(q))) return false;
      if (verdictFilter === "consider" && !r.verdict.startsWith("CONSIDER")) return false;
      if (verdictFilter === "strong" && r.verdict !== "CONSIDER – Strong") return false;
      if (trendFilter === "good" && r.consistency !== "Consistent" && r.consistency !== "Recovering") return false;
      return true;
    });
    const dirn = sort.asc ? 1 : -1;
    return [...list].sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      const c = typeof x === "string" ? x.localeCompare(String(y)) : (x as number) - (y as number);
      return c * dirn || a.stock.name.localeCompare(b.stock.name);
    });
  }, [allRows, overviewRows, tab, query, verdictFilter, trendFilter, sort]);

  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, asc: !s.asc } : { key, asc: key === "name" || key === "verdict" || key === "consistency" }));

  // A company can be in a listed sector and a built one, so the row in front of the person wins.
  const selectedRow = selected ? (tab === ALL_STOCKS ? overviewRows : allRows.filter((r) => r.sector === tab)).find((r) => r.stock.symbol === selected) ?? null : null;
  const sector = sectors.find((s) => s.name === tab);
  const sectorRows = sector ? allRows.filter((r) => r.sector === sector.name) : [];
  const o = sector ? overrides[sector.name] ?? { roe: "", roce: "", floor: "" } : null;
  const info = sector ? sectorInfo[sector.name] : null;

  // Stock-level counts are tallied per sector for the cards; the sector-level benchmark comes from sectorInfo.
  const summary: SectorSummary[] = sectors.map((sec) => ({
    name: sec.name,
    built: !!sec.built,
    bench: sectorInfo[sec.name].bench,
    health: sectorInfo[sec.name].health,
    t: tally(allRows.filter((r) => r.sector === sec.name)),
  }));
  const total = useMemo(() => tally(overviewRows), [overviewRows]);
  const nearCount = overviewRows.filter((r) => r.borderline).length;

  // A search that matches no stock anywhere on the list (not merely none under the current tab or filters) offers a Yahoo lookup.
  const q = query.trim();
  const inList = allRows.some((r) => r.stock.name.toLowerCase().includes(q.toLowerCase()) || r.stock.symbol.toLowerCase().includes(q.toLowerCase()));
  const showLookup = q.length >= 2 && !inList;
  const knownSymbols = useMemo(() => new Set(allRows.map((r) => r.stock.symbol)), [allRows]);

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs ${active ? "border-primary bg-primary text-on-primary font-semibold" : "border-line bg-surface hover:bg-surface2"}`;

  // What the sidebar and the search box list: every sector, and every stock once (a company in two sectors belongs to the first).
  const siteSectors: SiteSector[] = sectors.map((sec) => ({ name: sec.name, n: sec.stocks.length, built: !!sec.built }));
  const siteStocks: SiteStock[] = useMemo(() => {
    const builtNames = new Set(sectors.filter((s) => s.built).map((s) => s.name));
    return allRows.map((r) => ({ name: r.stock.name, symbol: r.stock.symbol, sector: r.sector, built: builtNames.has(r.sector) }));
  }, [allRows, sectors]);

  // The sidebar stays short: the sectors pinned (or, until something is pinned, the biggest listed ones) and the newest builds.
  const sectorNames = useMemo(() => new Set(sectors.map((s) => s.name)), [sectors]);
  const pins = effectivePins(pinsStored, defaultPins(siteSectors), sectorNames);
  const sizeOf = (name: string) => ({ name, n: sectors.find((s) => s.name === name)?.stocks.length ?? 0 });
  const pinnedItems = pins.map(sizeOf);
  const recentItems = recentlyBuilt(sectors.map((s) => ({ name: s.name, built: !!s.built, builtAt: s.built?.builtAt ?? null }))).map(sizeOf);
  const onTogglePin = (name: string) => {
    const next = togglePin(pinsStored ?? defaultPins(siteSectors), name, sectorNames, sharedLoaded);
    if (next) setPinsStored(next);
  };
  const sectorTable = useMemo(() => buildSectorRows(sectors, allRows, sectorInfo), [sectors, allRows, sectorInfo]);

  // What the bell and the star need: who is watched, what the page knows about each, and how to open one.
  const watchedSet = useMemo(() => new Set(watch.map((w) => w.symbol)), [watch]);
  const watchFull = isFull(watch);
  const watchInfo: WatchInfo = useMemo(
    () => Object.fromEntries(overviewRows.map((r) => [r.stock.symbol, { name: r.stock.name, sector: r.sector, verdict: r.verdict }])),
    [overviewRows],
  );
  const openWatched = (symbol: string) => {
    const r = overviewRows.find((x) => x.stock.symbol === symbol);
    if (r) go(r.sector, symbol);
  };
  const bell = (
    <NotificationCenter
      notices={notices}
      now={now}
      watch={watch}
      info={watchInfo}
      onOpenNotice={(n) => {
        dismiss(n.id);
        openWatched(n.symbol);
      }}
      onDismiss={dismiss}
      onOpenStock={openWatched}
      onClear={clearNotices}
      onUnwatch={unwatch}
    />
  );

  const sidebar = (label: string, onNavigate?: () => void) => (
    <Sidebar label={label} active={tab} total={overviewRows.length} all={siteSectors} pinned={pinnedItems} recent={recentItems} onNavigate={onNavigate} />
  );

  // The controls and the table of stocks, shared by the All stocks page and every sector page.
  const stockList = (
    <>
      <section aria-label="Controls" className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-line bg-surface shadow-sm p-3">
        <RecentSearch value={query} onChange={setQuery} />
        <div className="flex items-center gap-1.5 text-sm" role="group" aria-label="Verdict filter">
          <span className="text-muted">Verdict</span>
          {([["all", "All"], ["consider", "Consider"], ["strong", "Strong only"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setVerdictFilter(k)} aria-pressed={verdictFilter === k} className={chip(verdictFilter === k)}>{l}</button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-sm" role="group" aria-label="Profit trend filter">
          <span className="text-muted">Profit trend</span>
          {([["all", "Any"], ["good", "Consistent or recovering"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTrendFilter(k)} aria-pressed={trendFilter === k} className={chip(trendFilter === k)}>{l}</button>
          ))}
        </div>
      </section>

      {showLookup ? (
        <LookupPanel
          key={q.toLowerCase()}
          query={q}
          known={knownSymbols}
          total={allRows.length}
          sectors={data.sectors.map((s) => s.name)}
          benchFor={(name) => sectorInfo[name]?.bench ?? null}
          onShowExisting={(symbol) => {
            setQuery(symbol);
            setSelected(symbol);
          }}
        />
      ) : (
        <>
          <div className="mb-2 text-xs text-muted">{rows.length} stock{rows.length === 1 ? "" : "s"} shown</div>
          <StockTable
            rows={rows}
            sort={sort}
            onSort={onSort}
            onPick={setSelected}
            showSector={tab === ALL_STOCKS}
            selected={selected}
            watched={watchedSet}
            watchFull={watchFull}
            onToggleWatch={toggleWatch}
          />
        </>
      )}
    </>
  );

  return (
    <div className="lg:flex">
      <aside className="hidden border-r border-line bg-surface lg:sticky lg:top-0 lg:block lg:h-screen lg:w-64 lg:shrink-0 lg:overflow-y-auto lg:px-3 lg:py-5">{sidebar("Sectors")}</aside>

      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" tabIndex={-1} aria-label="Close menu" onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-black/40" />
          <div className="relative h-full w-72 max-w-[85vw] overflow-y-auto border-r border-line bg-surface px-3 py-4 shadow-xl">
            <button ref={closeButton} type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} className="absolute right-2 top-2 flex size-11 items-center justify-center rounded-lg text-xl hover:bg-surface2">
              ×
            </button>
            {sidebar("Sectors menu", () => {
              setMenuOpen(false);
              setSelected(null);
            })}
          </div>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3 border-b border-line px-4 py-2 lg:hidden">
          <button ref={menuButton} type="button" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} className="flex size-11 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface2">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20">
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
            </svg>
          </button>
          <span className="truncate text-base font-bold tracking-tight">{tab}</span>
          <div className="ml-auto">{bell}</div>
        </div>

        <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-4 sm:px-6 lg:pt-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="max-w-2xl flex-1">
              <GlobalSearch
                sectors={siteSectors}
                stocks={siteStocks}
                onOpenSector={(name) => go(name)}
                onOpenStock={(st) => go(st.sector, st.symbol)}
                onLookup={(text) => {
                  setQuery(text);
                  go(ALL_STOCKS);
                }}
                watched={watchedSet}
                watchFull={watchFull}
                onToggleWatch={(st) => {
                  const r = allRows.find((x) => x.stock.symbol === st.symbol);
                  return toggleWatch(r ? r.stock : { symbol: st.symbol, name: st.name });
                }}
              />
            </div>
            <div className="ml-auto hidden lg:block">{bell}</div>
          </div>

          {tab === OVERVIEW && (
            <>
              <header className="mb-5">
                <span className="inline-block rounded-full border border-line bg-surface px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-muted">
                  Sector screener · data as of {data.asOf}
                </span>
                <h1 className="mt-3 text-3xl sm:text-4xl">
                  Stock Analysis<span className="text-accent"> by sector</span>
                </h1>
                <p className="mt-1 max-w-3xl text-sm text-muted">
                  A first-pass screen. A stock is considered when its ROE is greater than the industry ROE (the median of the
                  other profitable stocks listed in its sector) and also above a {fmtPct(ROE_FLOOR, 0)} minimum. It is rated Strong
                  when ROCE also passes and Moderate when only ROE passes. Profit consistency over the last four years is shown as a
                  separate flag. Figures come from Yahoo Finance.
                </p>
              </header>
              <OverviewStats total={total} sectors={sectors.length} near={nearCount} />
            </>
          )}

          {/* The builder stays mounted on every page (hidden away from the Overview), so a build in progress carries on while the person looks at another sector. */}
          <div hidden={tab !== OVERVIEW}>
            <SectorBuilder taken={listedList} onBuilt={onBuilt} onExisting={onExisting} />
          </div>

          {tab === OVERVIEW && <SectorCards sectors={summary} onOpen={(name) => go(name)} />}

          {/* Kept mounted, hidden away from its own page, so the search, filters and page survive a visit to a sector and the back button. */}
          <div hidden={tab !== SECTORS}>
            <SectorsPage rows={sectorTable} pinned={pins} onTogglePin={onTogglePin} onOpen={(name) => go(name)} loading={!sharedLoaded} />
          </div>

          {tab === ALL_STOCKS && (
            <>
              <h1 className="mb-1 text-2xl sm:text-3xl">All stocks</h1>
              <p className="mb-4 max-w-3xl text-sm text-muted">Every stock from every sector in one table. A company that sits in two sectors appears once.</p>
              {stockList}
            </>
          )}

          {tab !== OVERVIEW && tab !== ALL_STOCKS && tab !== SECTORS && (
            <>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{sector?.built ? "Built from Yahoo" : sector ? "Listed sector" : "Sector"}</p>
              <div className="mb-3 mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
                <h1 className="text-2xl sm:text-3xl">{tab}</h1>
                {sector && (
                  <button
                    type="button"
                    aria-pressed={pins.includes(sector.name)}
                    disabled={pins.length >= MAX_PINS && !pins.includes(sector.name)}
                    title={pins.length >= MAX_PINS && !pins.includes(sector.name) ? `${MAX_PINS} sectors are pinned. Unpin one on the Sectors page first.` : undefined}
                    onClick={() => onTogglePin(sector.name)}
                    className="flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-3.5 text-sm hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 lg:min-h-9"
                  >
                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill={pins.includes(sector.name) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
                      <path d="M7 3h6l-1 6 3 3v1.5H5V12l3-3z" />
                      <path d="M10 13.5V18" />
                    </svg>
                    {pins.includes(sector.name) ? "Pinned to sidebar" : "Pin to sidebar"}
                  </button>
                )}
              </div>
              {sector && o && info ? (
                <>
                  {sector.built && <BuiltBanner sector={sector} share={shareState[sector.built!.yahooName]} onRemove={() => removeBuilt(sector.name)} />}
                  <SectorView
                    name={sector.name}
                    bench={info.bench}
                    health={info.health}
                    t={tally(sectorRows)}
                    points={sectorRows
                      .filter((r) => r.stock.roe != null && r.stock.roce != null)
                      .map((r) => ({ symbol: r.stock.symbol, roe: r.stock.roe as number, roce: r.stock.roce as number, verdict: r.verdict as Verdict }))}
                    override={o}
                    onOverride={(k, v) => setOverrides((p) => ({ ...p, [sector.name]: { ...o, [k]: v } }))}
                    onPick={setSelected}
                  >
                    {!sector.built && (
                      <NewsPanel
                        sector={sector.name}
                        news={news.sectors[sector.name]}
                        fetchedAt={news.fetchedAt}
                        windowDays={news.windowDays}
                        stocks={sectorRows.map((r) => ({ symbol: r.stock.symbol, name: r.stock.name, verdict: r.verdict }))}
                        onPick={setSelected}
                      />
                    )}
                  </SectorView>
                  <h2 className="mb-3 mt-2 text-xl font-semibold tracking-tight">{tab} stocks</h2>
                  {stockList}
                </>
              ) : (
                <section aria-label="Sector not found" className="rounded-xl border border-line bg-surface p-5 text-sm shadow-sm">
                  {sharedLoaded ? (
                    <>
                      <p className="font-semibold">“{tab}” is not on this site.</p>
                      <p className="mt-1 text-muted">A sector you built yourself is kept for your visit only, and a link to one stops working after you leave. Build it again from the Overview.</p>
                      <a href={hashForTab(OVERVIEW)} className="mt-3 inline-block font-medium text-accent hover:underline">
                        Go to the Overview
                      </a>
                    </>
                  ) : (
                    <p role="status" className="text-muted">Loading sectors…</p>
                  )}
                </section>
              )}
            </>
          )}

          <footer className="mt-8 max-w-3xl space-y-2 text-xs text-muted">
            <p>
              Screening aid only, not investment advice. Strict comparison is used, so a stock exactly at the cut-off does not
              pass, and a stock within {Math.round(BORDERLINE_BAND * 100)} points of it is marked Near cut-off. Revenue and profit are trailing
              twelve months. The industry figure is the median of the other profitable stocks listed here: loss-making
              companies and the stock itself are left out. That is still a small hand-picked peer set, so check the Peer set
              grade for each sector. Several companies carry one-off items; open a stock for its data notes.
            </p>
            <p>Consistency: Consistent = profit grew in at least 2 of 3 year-on-year steps with no loss year. Recovering = an early loss year, then growth every year since. Weak = a loss year, or the latest year&apos;s profit not above the first year shown. Mixed = everything else.</p>
          </footer>
        </div>
      </div>

      {selectedRow && (
        <StockDetail
          row={selectedRow}
          onClose={() => setSelected(null)}
          watching={watchedSet.has(selectedRow.stock.symbol)}
          watchFull={watchFull}
          onToggleWatch={() => toggleWatch(selectedRow.stock)}
        />
      )}
    </div>
  );
}
