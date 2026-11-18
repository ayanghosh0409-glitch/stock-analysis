"use client";

import { useState } from "react";
import { BORDERLINE_BAND, explain, isBorderline, profitTrend, roeMargin, verdict, type Benchmarks } from "@/lib/screen";
import { completeness, type Preview } from "@/lib/yahoo";
import { ConsistencyBadge, NearCutoffBadge, VerdictBadge } from "./Badges";
import { eyebrow } from "./SectorCards";
import { fmtCr, fmtPct, fmtPrice, fmtX } from "./format";

/**
 * What the screen makes of a company that is not on the list: its figures from Yahoo Finance, a verdict against the sector
 * the person picks, and a checklist of which needed figures Yahoo did and did not supply. Nothing here is saved.
 */
export default function PreviewCard({
  preview,
  sectors,
  benchFor,
  onBack,
}: {
  preview: Preview;
  sectors: string[];
  benchFor: (sector: string) => Benchmarks | null;
  onBack?: () => void;
}) {
  const [sector, setSector] = useState(preview.suggestedSector ?? "");
  const bench = sector ? benchFor(sector) : null;
  const v = bench ? verdict(preview.stock, bench) : null;
  const margin = bench ? roeMargin(preview.stock, bench) : null;
  const trend = profitTrend(preview.stock);
  const { have, total } = completeness(preview);
  const f = preview.figures;
  const peers = bench?.peers ?? 0;

  return (
    <section aria-label={`${preview.name} preview`} className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className={eyebrow}>Preview · from Yahoo Finance · not saved</span>
          <h3 className="mt-1 text-xl font-semibold tracking-tight">{preview.name}</h3>
          <p className="text-xs text-muted">
            {preview.ticker}
            {preview.latestYear ? ` · latest annual results ${preview.latestYear}` : ""}
          </p>
        </div>
        {onBack && (
          <button type="button" onClick={onBack} className="rounded-full border border-line bg-surface px-3 py-1 text-xs hover:bg-surface2">
            Back to results
          </button>
        )}
      </div>

      <div className="mt-4 rounded-lg bg-surface2 p-4">
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Compare against</span>
          <select
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            className="rounded-lg border border-line bg-surface px-2 py-1"
          >
            <option value="">Pick a sector…</option>
            {sectors.map((s) => (
              <option key={s} value={s}>
                {s}
                {s === preview.suggestedSector ? " (suggested)" : ""}
              </option>
            ))}
          </select>
        </label>
        {!preview.suggestedSector && (
          <p className="mt-2 text-xs text-muted">
            {preview.yahooIndustry
              ? `Yahoo lists it as ${preview.yahooSector ?? "?"} / ${preview.yahooIndustry}, which is not one of the sectors here, so pick the closest one.`
              : "Yahoo gave no industry for it, so pick a sector."}
          </p>
        )}

        {bench && v ? (
          <div className="mt-3 space-y-2" aria-live="polite">
            <div className="flex flex-wrap items-center gap-2">
              <VerdictBadge v={v} />
              {isBorderline(preview.stock, bench) && <NearCutoffBadge points={Math.round(BORDERLINE_BAND * 100)} />}
              <ConsistencyBadge c={trend.consistency} />
            </div>
            <p className="text-sm">{explain(preview.stock, bench)}</p>
            <p className="text-xs text-muted">
              Judged against the {peers} profitable {sector} stocks already on the list; this company is not part of that benchmark.
              {margin !== null && ` Its ROE ${margin > 0 ? "clears" : "falls short of"} the cut-off by ${(Math.abs(margin) * 100).toFixed(1)} points.`}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">Pick a sector to see the verdict. The screen judges a stock against the ROE of its sector peers.</p>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fig label="ROE" value={fmtPct(f.roe)} />
        <Fig label="ROCE" value={f.roce === null ? "Not available" : fmtPct(f.roce)} />
        <Fig label="Market cap" value={f.marketCap === null ? "–" : `₹${fmtCr(f.marketCap)} cr`} />
        <Fig label="Profit, trailing" value={f.profit === null ? "–" : `₹${fmtCr(f.profit)} cr`} />
        <Fig label="P/E" value={fmtX(f.pe)} />
        <Fig label="Price" value={f.price === null ? "–" : `₹${fmtPrice(f.price)}`} />
        <Fig label="Profit growth" value={typeof trend.cagr === "number" ? `${fmtPct(trend.cagr)} a year` : trend.cagr === "n/m" ? "Not meaningful" : "–"} />
        <Fig label="Annual profit" value={f.profitHistory.length ? `${f.historyLabels[0]}–${f.historyLabels[f.historyLabels.length - 1]}` : "–"} />
      </dl>

      <div className="mt-5">
        <h4 className={eyebrow}>
          Data from Yahoo Finance · {have} of {total} needed figures
        </h4>
        <ul className="mt-2 divide-y divide-line rounded-lg border border-line text-sm">
          {preview.checks.map((c) => (
            <li key={c.key} className="flex items-start gap-3 px-3 py-2">
              <span aria-hidden className="mt-0.5 font-semibold" style={{ color: c.ok ? "var(--good)" : "var(--bad)" }}>
                {c.ok ? "✓" : "✗"}
              </span>
              <span className="min-w-0">
                <span className="font-medium">{c.label}</span>
                <span className="sr-only">{c.ok ? " found" : " missing"}</span>
                <span className="block text-xs text-muted">{c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-muted">
        {preview.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
        <li>A preview only: nothing here is saved to the list, and it is a screening aid, not investment advice.</li>
      </ul>
    </section>
  );
}

function Fig({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2">
      <dt className={eyebrow}>{label}</dt>
      <dd className="mt-0.5 text-base font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
