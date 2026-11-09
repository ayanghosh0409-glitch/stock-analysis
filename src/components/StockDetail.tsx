"use client";

import { useEffect } from "react";
import { ProfitBars, RoceLine } from "./Charts";
import { ConsistencyBadge, VerdictBadge } from "./Badges";
import { fmtCr, fmtPct, fmtPrice, fmtX } from "./format";
import type { Row } from "./StockTable";
import { explain, profitTrend } from "@/lib/screen";

const DEFAULT_LABELS = ["FY22", "FY23", "FY24", "FY25", "FY26"];

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface2 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className="num text-base font-semibold">{value}</div>
    </div>
  );
}

export default function StockDetail({ row, onClose }: { row: Row; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const s = row.stock;
  const t = profitTrend(s);
  const labels = s.historyLabels ?? DEFAULT_LABELS;
  const roceAvg = s.roceHistory?.filter((x): x is number => typeof x === "number");
  const avg = roceAvg && roceAvg.length ? roceAvg.reduce((a, b) => a + b, 0) / roceAvg.length : null;

  return (
    <aside role="dialog" aria-label={`${s.name} details`} className="fixed inset-y-0 right-0 z-30 w-full max-w-xl overflow-y-auto border-l border-line bg-surface p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{s.name}</h2>
          <div className="text-xs text-muted">{s.symbol} · {row.sector}</div>
        </div>
        <button type="button" onClick={onClose} className="rounded border border-line px-2 py-1 text-xs hover:bg-surface2">Close (Esc)</button>
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <VerdictBadge v={row.verdict} />
          <ConsistencyBadge c={row.consistency} />
        </div>
        <p className="text-sm">{explain(s, row.bench)}</p>
        <p className="text-xs text-muted">
          The profit consistency flag is shown separately and never changes the verdict.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Metric label="Price" value={"₹" + fmtPrice(s.price)} />
        <Metric label="52W high" value={"₹" + fmtPrice(s.high52)} />
        <Metric label="52W low" value={"₹" + fmtPrice(s.low52)} />
        <Metric label="Market cap" value={"₹" + fmtCr(s.marketCap) + " Cr"} />
        <Metric label="Revenue (TTM)" value={"₹" + fmtCr(s.revenue) + " Cr"} />
        <Metric label="Profit (TTM)" value={"₹" + fmtCr(s.profit) + " Cr"} />
        <Metric label="ROE" value={`${fmtPct(s.roe)} (ind. ${fmtPct(row.bench.roe)})`} />
        <Metric label="ROCE" value={`${fmtPct(s.roce)} (ind. ${fmtPct(row.bench.roce)})`} />
        <Metric label="P/E" value={fmtX(s.pe)} />
      </div>

      <h3 className="mt-6 text-sm font-semibold">Net profit, 5 years (₹ Cr)</h3>
      {s.profitHistory ? (
        <ProfitBars labels={labels} values={s.profitHistory} />
      ) : (
        <p className="mt-2 text-sm text-muted">Annual history is not available for this stock (see notes).</p>
      )}
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Metric label="Profit CAGR" value={typeof t.cagr === "number" ? fmtPct(t.cagr) : t.cagr === "n/m" ? "n/m" : "–"} />
        <Metric label="Growth years" value={t.growthYears == null ? "–" : `${t.growthYears} of ${t.steps}`} />
        <Metric label="Loss year" value={t.hasLoss == null ? "–" : t.hasLoss ? "Yes" : "No"} />
      </div>

      {s.roceHistory && (
        <>
          <h3 className="mt-6 text-sm font-semibold">ROCE by year (5Y average {fmtPct(avg)}; 5Y avg ROE {fmtPct(s.roe5y)})</h3>
          <RoceLine labels={labels} values={s.roceHistory} />
        </>
      )}

      {s.notes.length > 0 && (
        <>
          <h3 className="mt-6 text-sm font-semibold">Data notes</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {s.notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </>
      )}
    </aside>
  );
}
