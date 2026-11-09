"use client";

import type { Stock } from "@/lib/types";
import type { Benchmarks, Consistency, Verdict } from "@/lib/screen";
import { ConsistencyBadge, VerdictBadge } from "./Badges";
import Sparkline from "./Sparkline";
import { fmtCr, fmtPct, fmtPrice, fmtX } from "./format";

export type Row = {
  stock: Stock;
  sector: string;
  verdict: Verdict;
  consistency: Consistency;
  cagr: number | "n/m" | null;
  bench: Benchmarks;
};

export type SortKey =
  | "name" | "price" | "marketCap" | "revenue" | "profit" | "roe" | "roce" | "pe" | "verdict" | "consistency" | "cagr";

export const sortValue = (r: Row, k: SortKey): number | string | null => {
  switch (k) {
    case "name": return r.stock.name;
    case "price": return r.stock.price;
    case "marketCap": return r.stock.marketCap;
    case "revenue": return r.stock.revenue;
    case "profit": return r.stock.profit;
    case "roe": return r.stock.roe;
    case "roce": return r.stock.roce;
    case "pe": return r.stock.pe;
    case "cagr": return typeof r.cagr === "number" ? r.cagr : null;
    case "verdict": return ({ "CONSIDER – Strong": 0, "CONSIDER – Moderate": 1, SKIP: 2, "n/a": 3 } as const)[r.verdict];
    case "consistency":
      return ({ Consistent: 0, Recovering: 1, Mixed: 2, Weak: 3, "Insufficient data": 4 } as const)[r.consistency];
  }
};

function RangeBar({ s }: { s: Stock }) {
  const span = s.high52 - s.low52;
  const pos = span > 0 ? Math.min(1, Math.max(0, (s.price - s.low52) / span)) : 0;
  return (
    <div className="w-24" title={`52W low ₹${fmtPrice(s.low52)} – high ₹${fmtPrice(s.high52)}`}>
      <div className="relative h-1.5 rounded bg-surface2">
        <div className="absolute top-1/2 h-3 w-1 -translate-y-1/2 rounded-sm" style={{ left: `calc(${pos * 100}% - 2px)`, background: "var(--accent)" }} />
      </div>
      <div className="num mt-0.5 text-[10px] text-muted">{Math.round(pos * 100)}% of 52W range</div>
    </div>
  );
}

function Delta({ value, bench }: { value: number | null; bench: number | null }) {
  if (value == null || bench == null) return <span className="text-muted">–</span>;
  const d = value - bench;
  return (
    <div className="num">
      <div>{fmtPct(value)}</div>
      <div className="text-[10px]" style={{ color: d > 0 ? "var(--good)" : d < 0 ? "var(--bad)" : "var(--muted)" }}>
        {d > 0 ? "+" : ""}
        {(d * 100).toFixed(1)} pts vs industry
      </div>
    </div>
  );
}

export default function StockTable({
  rows, sort, onSort, onPick, showSector, selected,
}: {
  rows: Row[];
  sort: { key: SortKey; asc: boolean };
  onSort: (k: SortKey) => void;
  onPick: (symbol: string) => void;
  showSector: boolean;
  selected: string | null;
}) {
  const th = (k: SortKey, label: string, right = false) => (
    <th scope="col" aria-sort={sort.key === k ? (sort.asc ? "ascending" : "descending") : "none"} className={`px-3 py-2 font-medium ${right ? "text-right" : "text-left"}`}>
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 hover:text-ink">
        {label}
        <span aria-hidden className="text-[10px]">{sort.key === k ? (sort.asc ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full min-w-[1100px] border-collapse text-sm">
        <thead className="bg-surface2 text-xs uppercase tracking-wide text-muted">
          <tr>
            {th("name", "Stock")}
            {th("price", "Price (₹)", true)}
            <th scope="col" className="px-3 py-2 text-left font-medium">52W position</th>
            {th("marketCap", "Mkt cap (₹ Cr)", true)}
            {th("revenue", "Revenue (₹ Cr)", true)}
            {th("profit", "Profit (₹ Cr)", true)}
            {th("roe", "ROE", true)}
            {th("roce", "ROCE", true)}
            {th("pe", "P/E", true)}
            {th("verdict", "Verdict (ROE/ROCE)")}
            {th("consistency", "Profit consistency")}
            {th("cagr", "5Y trend", true)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const s = r.stock;
            return (
              <tr key={s.symbol} className={`border-t border-line ${selected === s.symbol ? "bg-surface2" : "hover:bg-surface2"}`}>
                <td className="px-3 py-2">
                  <button type="button" onClick={() => onPick(s.symbol)} className="text-left font-medium text-accent hover:underline">
                    {s.name}
                  </button>
                  <div className="text-[11px] text-muted">
                    {s.symbol}
                    {showSector ? ` · ${r.sector}` : ""}
                    {s.notes.length > 0 ? " · has notes" : ""}
                  </div>
                </td>
                <td className="num px-3 py-2 text-right">{fmtPrice(s.price)}</td>
                <td className="px-3 py-2"><RangeBar s={s} /></td>
                <td className="num px-3 py-2 text-right">{fmtCr(s.marketCap)}</td>
                <td className="num px-3 py-2 text-right">{fmtCr(s.revenue)}</td>
                <td className="num px-3 py-2 text-right">{fmtCr(s.profit)}</td>
                <td className="px-3 py-2 text-right"><Delta value={s.roe} bench={r.bench.roe} /></td>
                <td className="px-3 py-2 text-right"><Delta value={s.roce} bench={r.bench.roce} /></td>
                <td className="num px-3 py-2 text-right">{fmtX(s.pe)}</td>
                <td className="px-3 py-2"><VerdictBadge v={r.verdict} /></td>
                <td className="px-3 py-2"><ConsistencyBadge c={r.consistency} /></td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <span className="num text-xs text-muted">{typeof r.cagr === "number" ? fmtPct(r.cagr) : r.cagr === "n/m" ? "n/m" : "–"}</span>
                    <Sparkline values={s.profitHistory} />
                  </div>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={12} className="px-3 py-8 text-center text-muted">No stocks match these filters.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
