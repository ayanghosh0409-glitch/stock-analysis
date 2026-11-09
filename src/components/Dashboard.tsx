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
import { PeerBadge } from "./Badges";
import { RoeRoceScatter } from "./Charts";
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

export default function Dashboard({ data }: { data: Dataset }) {
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

  const summary = data.sectors.map((sec) => {
    const rs = allRows.filter((r) => r.sector === sec.name);
    const count = (f: (r: Row) => boolean) => rs.filter(f).length;
    return {
      name: sec.name,
      n: rs.length,
      bench: sectorInfo[sec.name].bench,
      health: sectorInfo[sec.name].health,
      strong: count((r) => r.verdict === "CONSIDER – Strong"),
      moderate: count((r) => r.verdict === "CONSIDER – Moderate"),
      skip: count((r) => r.verdict === "SKIP"),
      cons: count((r) => r.consistency === "Consistent"),
      rec: count((r) => r.consistency === "Recovering"),
      mixed: count((r) => r.consistency === "Mixed"),
      weak: count((r) => r.consistency === "Weak"),
      nodata: count((r) => r.consistency === "Insufficient data"),
    };
  });

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs ${active ? "border-accent bg-accent text-bg font-semibold" : "border-line bg-surface hover:bg-surface2"}`;

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold">Stock Analysis</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          A first-pass screen. A stock is considered when its ROE is greater than the industry ROE (the median of the
          other profitable stocks listed in its sector) and also above a {fmtPct(ROE_FLOOR, 0)} minimum. It is rated Strong
          when ROCE also passes and Moderate when only ROE passes. Profit consistency over five years is shown as a
          separate flag. Data as of {data.asOf}, from public Screener.in pages.
        </p>
      </header>

      <nav aria-label="Sectors" className="mb-4 flex flex-wrap gap-2">
        {[OVERVIEW, ...data.sectors.map((s) => s.name)].map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t} className={chip(tab === t)}>
            {t}
          </button>
        ))}
      </nav>

      <section aria-label="Controls" className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-lg border border-line bg-surface p-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Search</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or symbol" className="w-40 rounded border border-line bg-surface px-2 py-1" />
        </label>
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

      {tab === OVERVIEW ? (
        <section aria-label="Sector summary" className="mb-5 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead className="bg-surface2 text-xs uppercase tracking-wide text-muted">
              <tr>
                {["Sector", "Stocks", "Industry ROE", "ROE cut-off", "Industry ROCE", "Peer set", "Strong", "Moderate", "Skip", "Consistent", "Recovering", "Mixed", "Weak", "No data"].map((h, i) => (
                  <th key={h} scope="col" className={`px-3 py-2 font-medium ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => (
                <tr key={s.name} className="border-t border-line">
                  <td className="px-3 py-2"><button type="button" onClick={() => setTab(s.name)} className="text-left font-medium text-accent hover:underline">{s.name}</button></td>
                  {[s.n, fmtPct(s.bench.roe), fmtPct(s.bench.threshold), fmtPct(s.bench.roce), <PeerBadge key="peer" health={s.health} />, s.strong, s.moderate, s.skip, s.cons, s.rec, s.mixed, s.weak, s.nodata].map((v, i) => (
                    <td key={i} className="num px-3 py-2 text-right">{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        sector && o && info && (
          <section aria-label={`${sector.name} benchmark`} className="mb-5 grid gap-4 lg:grid-cols-[320px_1fr]">
            <div className="rounded-lg border border-line bg-surface p-4">
              <h2 className="text-sm font-semibold">{sector.title}</h2>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-muted">Median ROE (profitable stocks)</dt><dd className="num">{fmtPct(info.bench.medianRoe)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Median ROCE</dt><dd className="num">{fmtPct(info.bench.medianRoce)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Minimum ROE</dt><dd className="num">{fmtPct(info.bench.floor)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">ROE cut-off used</dt><dd className="num font-semibold">{fmtPct(info.bench.threshold)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">ROCE used</dt><dd className="num font-semibold">{fmtPct(info.bench.roce)}</dd></div>
              </dl>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-muted">Peer set</span>
                <PeerBadge health={info.health} />
              </div>
              {info.health.reasons.length > 0 && (
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted">
                  {info.health.reasons.map((r) => <li key={r}>{r}</li>)}
                </ul>
              )}
              <p className="mt-3 text-xs text-muted">
                Each stock is compared with its sector peers without itself, so its own figures are not in its benchmark. The
                cut-off is the higher of the industry ROE and the minimum. Optionally override either with your own figures (in %); leave
                blank to use the defaults.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(
                  [
                    ["roe", "ROE override %", "col-span-1", ""],
                    ["roce", "ROCE override %", "col-span-1", ""],
                    ["floor", "Minimum ROE %", "col-span-2", String(ROE_FLOOR * 100)],
                  ] as const
                ).map(([k, label, span, placeholder]) => (
                  <label key={k} className={`text-xs text-muted ${span}`}>
                    {label}
                    <input
                      inputMode="decimal"
                      value={o[k] ?? ""}
                      placeholder={placeholder}
                      onChange={(e) => setOverrides((p) => ({ ...p, [sector.name]: { ...o, [k]: e.target.value } }))}
                      className="mt-1 w-full rounded border border-line bg-surface px-2 py-1 text-sm text-ink"
                    />
                  </label>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-surface p-4">
              <h2 className="text-sm font-semibold">ROE vs ROCE (dashed lines = sector cut-offs; click a point for details)</h2>
              <RoeRoceScatter
                points={sectorRows
                  .filter((r) => r.stock.roe != null && r.stock.roce != null)
                  .map((r) => ({ symbol: r.stock.symbol, roe: r.stock.roe as number, roce: r.stock.roce as number, verdict: r.verdict as Verdict }))}
                roeBench={info.bench.threshold}
                roceBench={info.bench.roce}
                onPick={setSelected}
              />
              <p className="text-xs text-muted">Green = Strong, amber = Moderate, red = Skip.</p>
            </div>
          </section>
        )
      )}

      <div className="mb-2 text-xs text-muted">{rows.length} stock{rows.length === 1 ? "" : "s"} shown</div>
      <StockTable rows={rows} sort={sort} onSort={onSort} onPick={setSelected} showSector={tab === OVERVIEW} selected={selected} />

      <footer className="mt-8 max-w-3xl space-y-2 text-xs text-muted">
        <p>
          Screening aid only, not investment advice. Strict comparison is used, so a stock exactly at the cut-off does not
          pass, and a stock within {Math.round(BORDERLINE_BAND * 100)} points of it is marked Near cut-off. Revenue and profit are trailing
          twelve months. The industry figure is the median of the other profitable stocks listed here: loss-making
          companies and the stock itself are left out. That is still a small hand-picked peer set, so check the Peer set
          grade for each sector. Several companies carry one-off items; open a stock for its data notes.
        </p>
        <p>Consistency: Consistent = profit grew in at least 3 of 4 year-on-year steps with no loss year. Recovering = an early loss year, then growth every year since. Weak = a loss year, or FY26 profit not above FY22. Mixed = everything else.</p>
      </footer>

      {selectedRow && <StockDetail row={selectedRow} onClose={() => setSelected(null)} />}
    </div>
  );
}
