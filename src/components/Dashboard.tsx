"use client";

import { useEffect, useMemo, useState } from "react";
import type { Dataset } from "@/lib/types";
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
import { tally } from "@/lib/overview";
import { fmtPct } from "./format";

const OVERVIEW = "Overview";
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
  const [tab, setTab] = useState(OVERVIEW);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [verdictFilter, setVerdictFilter] = useState<"all" | "consider" | "strong">("all");
  const [trendFilter, setTrendFilter] = useState<"all" | "good">("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "verdict", asc: true });
  const [selected, setSelected] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

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
    setLoaded(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(STORE, JSON.stringify({ overrides }));
    } catch {}
  }, [overrides, loaded]);

  // Each stock is judged against its sector peers without itself (benchmarkFor), while the
  // sector-wide figures below are the reference shown in summaries and on the chart.
  const allRows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const sec of data.sectors) {
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
  }, [data, overrides]);

  const sectorInfo = useMemo(
    () =>
      Object.fromEntries(
        data.sectors.map((sec) => [sec.name, { bench: benchmarks(sec.stocks, toOverride(overrides[sec.name])), health: peerHealth(sec.stocks) }]),
      ),
    [data, overrides],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = allRows.filter((r) => {
      if (tab !== OVERVIEW && r.sector !== tab) return false;
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
  }, [allRows, tab, query, verdictFilter, trendFilter, sort]);

  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, asc: !s.asc } : { key, asc: key === "name" || key === "verdict" || key === "consistency" }));

  const selectedRow = selected ? allRows.find((r) => r.stock.symbol === selected) ?? null : null;
  const sector = data.sectors.find((s) => s.name === tab);
  const sectorRows = sector ? allRows.filter((r) => r.sector === sector.name) : [];
  const o = sector ? overrides[sector.name] ?? { roe: "", roce: "", floor: "" } : null;
  const info = sector ? sectorInfo[sector.name] : null;

  // Stock-level counts are tallied per sector for the cards; the sector-level benchmark comes from sectorInfo.
  const summary: SectorSummary[] = data.sectors.map((sec) => ({
    name: sec.name,
    bench: sectorInfo[sec.name].bench,
    health: sectorInfo[sec.name].health,
    t: tally(allRows.filter((r) => r.sector === sec.name)),
  }));
  const total = useMemo(() => tally(allRows), [allRows]);
  const nearCount = allRows.filter((r) => r.borderline).length;

  // A search that matches no stock anywhere on the list (not merely none under the current tab or filters) offers a Yahoo lookup.
  const q = query.trim();
  const inList = allRows.some((r) => r.stock.name.toLowerCase().includes(q.toLowerCase()) || r.stock.symbol.toLowerCase().includes(q.toLowerCase()));
  const showLookup = q.length >= 2 && !inList;
  const knownSymbols = useMemo(() => new Set(allRows.map((r) => r.stock.symbol)), [allRows]);

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs ${active ? "border-primary bg-primary text-on-primary font-semibold" : "border-line bg-surface hover:bg-surface2"}`;

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-6 sm:px-6">
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

      <nav aria-label="Sectors" className="mb-4 flex flex-wrap gap-2">
        {[OVERVIEW, ...data.sectors.map((s) => s.name)].map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t} className={chip(tab === t)}>
            {t}
          </button>
        ))}
      </nav>

      {tab === OVERVIEW ? (
        <>
          <OverviewStats total={total} sectors={data.sectors.length} near={nearCount} />
          <SectorCards sectors={summary} onOpen={setTab} />
        </>
      ) : (
        sector && o && info && (
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
            <NewsPanel
              sector={sector.name}
              news={news.sectors[sector.name]}
              fetchedAt={news.fetchedAt}
              windowDays={news.windowDays}
              stocks={sectorRows.map((r) => ({ symbol: r.stock.symbol, name: r.stock.name, verdict: r.verdict }))}
              onPick={setSelected}
            />
          </SectorView>
        )
      )}

      <h2 className="mb-3 mt-2 text-xl font-semibold tracking-tight">{tab === OVERVIEW ? "All stocks" : `${tab} stocks`}</h2>
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
          <StockTable rows={rows} sort={sort} onSort={onSort} onPick={setSelected} showSector={tab === OVERVIEW} selected={selected} />
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

      {selectedRow && <StockDetail row={selectedRow} onClose={() => setSelected(null)} />}
    </div>
  );
}
