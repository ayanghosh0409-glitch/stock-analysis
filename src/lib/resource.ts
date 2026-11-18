import { benchmarkFor, profitTrend, verdict, type Consistency, type Verdict } from "./screen";
import type { Dataset, Stock } from "./types";
import type { Preview } from "./yahoo";

/**
 * Re-sources the listed stocks from Yahoo Finance. Nothing here touches the network or the disk: scripts/resource-yahoo.ts
 * fetches a Preview per stock (the same code the lookup uses), and these functions decide what goes into the file and
 * write the before/after report.
 */

/** Yahoo tickers to try, in order, where <SYMBOL>.NS (or .BO for a BSE code) is wrong. Same list as scripts/refresh_market_data.py. */
const OVERRIDES: Record<string, string[]> = {
  LTM: ["LTM.NS", "LTIM.NS"],
  "504093": ["PANAENERG.BO"], // Panasonic Energy India
  "504176": ["HIGHENE.BO"], // High Energy Batteries (India)
};

export function tickersFor(symbol: string): string[] {
  if (OVERRIDES[symbol]) return OVERRIDES[symbol];
  return [/^\d+$/.test(symbol) ? `${symbol}.BO` : `${symbol}.NS`];
}

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
export const MIN_YEARS = 4;

// ---- notes ----------------------------------------------------------------------------------------------------

/** Sentences that only described the Screener.in page the figures were copied from. They stop being true once the source is Yahoo. */
const SCREENER_BASIS = /\bprice is\b|\bTTM to\b|\bstandalone\b|consolidated page|basis not stated|symbol not confirmed|history left blank|\bscreener\b|BSE code shown/i;
/** Kept notes that talk about specific years or the five-year layout, which may no longer line up with Yahoo's four years. */
const YEAR_SPECIFIC = /\bFY\d\d\b|\bCY\d{4}\b|\b5Y\b|year-end|five/i;

export function cleanNotes(notes: string[]): { kept: string[]; dropped: string[]; recheck: string[] } {
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const note of notes) {
    const sentences = note.split(/(?<=\.)\s+/).filter(Boolean);
    const keep = sentences.filter((s) => !SCREENER_BASIS.test(s));
    dropped.push(...sentences.filter((s) => SCREENER_BASIS.test(s)));
    if (keep.length) kept.push(keep.join(" "));
  }
  return { kept, dropped, recheck: kept.filter((n) => YEAR_SPECIFIC.test(n)) };
}

// ---- merge ----------------------------------------------------------------------------------------------------

export type Merge = {
  stock: Stock;
  fromYahoo: boolean;
  /** Why the old figures were kept; empty when Yahoo's were used. */
  missing: string[];
  dropped: string[];
  recheck: string[];
};

/**
 * The stock as it should be stored. Yahoo's figures replace the old ones only when Yahoo supplied everything the
 * screen needs; otherwise the old stock is kept whole, so a row is never half one source and half another.
 */
export function mergeStock(old: Stock, p: Preview | null, failure?: string): Merge {
  const kept = cleanNotes(old.notes);
  if (!p) return { stock: old, fromYahoo: false, missing: [failure ?? "Yahoo returned nothing"], dropped: [], recheck: [] };
  const f = p.figures;
  const missing: string[] = [];
  if (f.price === null || f.marketCap === null) missing.push("price or market cap");
  if (f.profit === null) missing.push("profit");
  if (f.revenue === null) missing.push("revenue");
  if (f.roe === null) missing.push(p.checks.find((c) => c.key === "roe")?.detail ? `ROE (${p.checks.find((c) => c.key === "roe")!.detail})` : "ROE");
  if (f.roce === null) missing.push(p.checks.find((c) => c.key === "roce")?.detail ? `ROCE (${p.checks.find((c) => c.key === "roce")!.detail})` : "ROCE");
  if (f.profitHistory.filter(isNum).length < MIN_YEARS) missing.push(`annual profit (only ${f.profitHistory.filter(isNum).length} years)`);
  if (missing.length) return { stock: old, fromYahoo: false, missing, dropped: [], recheck: [] };
  return {
    stock: { ...p.stock, name: old.name, symbol: old.symbol, notes: kept.kept },
    fromYahoo: true,
    missing: [],
    dropped: kept.dropped,
    recheck: kept.recheck,
  };
}

// ---- before / after -------------------------------------------------------------------------------------------

export type Side = { roe: number | null; roce: number | null; verdict: Verdict; consistency: Consistency };
export type Row = { sector: string; symbol: string; name: string; fromYahoo: boolean; before: Side; after: Side; changed: boolean };
export type SectorSummary = { sector: string; before: Record<Verdict, number>; after: Record<Verdict, number>; cutoffBefore: number | null; cutoffAfter: number | null; rocePeerBefore: number | null; rocePeerAfter: number | null };

const VERDICTS: Verdict[] = ["CONSIDER – Strong", "CONSIDER – Moderate", "SKIP", "n/a"];
const zero = (): Record<Verdict, number> => ({ "CONSIDER – Strong": 0, "CONSIDER – Moderate": 0, SKIP: 0, "n/a": 0 });

/** Each stock judged against its own sector's peers within its own dataset, exactly as the site does. */
function sides(ds: Dataset) {
  const out = new Map<string, { sector: string; s: Stock; side: Side }>();
  for (const sec of ds.sectors) {
    for (const s of sec.stocks) {
      const b = benchmarkFor(s, sec.stocks);
      out.set(s.symbol, { sector: sec.name, s, side: { roe: s.roe, roce: s.roce, verdict: verdict(s, b), consistency: profitTrend(s).consistency } });
    }
  }
  return out;
}

export function compare(before: Dataset, after: Dataset, fromYahoo: Set<string>): { rows: Row[]; sectors: SectorSummary[] } {
  const a = sides(before);
  const b = sides(after);
  const rows: Row[] = [];
  for (const [symbol, x] of a) {
    const y = b.get(symbol);
    if (!y) continue;
    rows.push({ sector: x.sector, symbol, name: x.s.name, fromYahoo: fromYahoo.has(symbol), before: x.side, after: y.side, changed: x.side.verdict !== y.side.verdict });
  }
  const sectors: SectorSummary[] = before.sectors.map((sec) => {
    const other = after.sectors.find((s) => s.name === sec.name)!;
    const count = (list: Row[], k: "before" | "after") => {
      const c = zero();
      for (const r of list) c[r[k].verdict]++;
      return c;
    };
    const mine = rows.filter((r) => r.sector === sec.name);
    // The sector-wide figures use every profitable stock; each stock's own cut-off leaves itself out, which is why a stock's verdict can differ from a one-line summary.
    const bb = benchmarkFor({ symbol: "" } as Stock, sec.stocks);
    const ba = benchmarkFor({ symbol: "" } as Stock, other.stocks);
    return { sector: sec.name, before: count(mine, "before"), after: count(mine, "after"), cutoffBefore: bb.threshold, cutoffAfter: ba.threshold, rocePeerBefore: bb.roce, rocePeerAfter: ba.roce };
  });
  return { rows, sectors };
}

// ---- report ---------------------------------------------------------------------------------------------------

const pct = (x: number | null) => (x === null ? "–" : `${(x * 100).toFixed(1)}%`);
const short = (v: Verdict) => (v === "CONSIDER – Strong" ? "Strong" : v === "CONSIDER – Moderate" ? "Moderate" : v === "SKIP" ? "Skip" : "n/a");

export function report(args: {
  rows: Row[];
  sectors: SectorSummary[];
  merges: Map<string, Merge>;
  total: number;
  when: string;
}): string {
  const { rows, sectors, merges, total, when } = args;
  const yahoo = rows.filter((r) => r.fromYahoo).length;
  const changed = rows.filter((r) => r.changed);
  const out: string[] = [`# Re-source the listed stocks from Yahoo Finance`, `Run at ${when}`, ""];
  out.push(`**${yahoo} of ${total} stocks now use Yahoo's figures; ${total - yahoo} were kept as they were because Yahoo did not supply everything the screen needs. ${changed.length} of ${rows.length} verdicts change.**`, "");

  out.push("## Sector totals", "", "| Sector | Strong | Moderate | Skip | n/a | ROE cut-off | Industry ROCE |", "| --- | --- | --- | --- | --- | --- | --- |");
  const cell = (b: Record<Verdict, number>, a: Record<Verdict, number>, v: Verdict) => (b[v] === a[v] ? `${b[v]}` : `${b[v]} → **${a[v]}**`);
  for (const s of sectors) {
    out.push(`| ${s.sector} | ${VERDICTS.map((v) => cell(s.before, s.after, v)).join(" | ")} | ${pct(s.cutoffBefore)} → ${pct(s.cutoffAfter)} | ${pct(s.rocePeerBefore)} → ${pct(s.rocePeerAfter)} |`);
  }

  out.push("", "## Verdicts that change", "");
  if (!changed.length) out.push("None.");
  else {
    out.push("| Stock | Sector | ROE (Screener → Yahoo) | ROCE (Screener → Yahoo) | Verdict |", "| --- | --- | --- | --- | --- |");
    for (const r of changed) out.push(`| ${r.symbol} | ${r.sector} | ${pct(r.before.roe)} → ${pct(r.after.roe)} | ${pct(r.before.roce)} → ${pct(r.after.roce)} | ${short(r.before.verdict)} → **${short(r.after.verdict)}** |`);
  }

  const kept = rows.filter((r) => !r.fromYahoo);
  out.push("", "## Kept as they were (Yahoo did not supply everything)", "");
  if (!kept.length) out.push("None.");
  for (const r of kept) out.push(`- **${r.symbol}** (${r.sector}): ${merges.get(r.symbol)?.missing.join("; ") ?? "unknown"}`);

  out.push("", "## Every stock", "", "| Stock | Sector | ROE | ROCE | Verdict | Profit consistency |", "| --- | --- | --- | --- | --- | --- |");
  for (const r of rows) {
    const v = r.before.verdict === r.after.verdict ? short(r.after.verdict) : `${short(r.before.verdict)} → **${short(r.after.verdict)}**`;
    const c = r.before.consistency === r.after.consistency ? r.after.consistency : `${r.before.consistency} → **${r.after.consistency}**`;
    out.push(`| ${r.symbol}${r.fromYahoo ? "" : " (kept)"} | ${r.sector} | ${pct(r.before.roe)} → ${pct(r.after.roe)} | ${pct(r.before.roce)} → ${pct(r.after.roce)} | ${v} | ${c} |`);
  }

  const dropped = [...merges.entries()].filter(([, m]) => m.dropped.length);
  const recheck = [...merges.entries()].filter(([, m]) => m.recheck.length);
  out.push("", "## Hand-written notes", "", "Notes that only described the Screener.in page (price date, TTM period, standalone figures) were removed because they no longer apply:", "");
  if (!dropped.length) out.push("- none");
  for (const [sym, m] of dropped) out.push(`- **${sym}**: ${m.dropped.join(" ")}`);
  out.push("", "Notes kept but worth re-checking by hand, because they name specific years that may no longer line up with Yahoo's four:", "");
  if (!recheck.length) out.push("- none");
  for (const [sym, m] of recheck) out.push(`- **${sym}**: ${m.recheck.join(" ")}`);
  return out.join("\n") + "\n";
}
