"use client";

import { useMemo, useState } from "react";
import { applyEntered, validateEntry, type Field } from "@/lib/figures";
import { BORDERLINE_BAND, explain, isBorderline, profitTrend, roeMargin, verdict, type Benchmarks } from "@/lib/screen";
import { completeness, type Preview } from "@/lib/yahoo";
import { ConsistencyBadge, NearCutoffBadge, VerdictBadge } from "./Badges";
import { eyebrow } from "./SectorCards";
import type { Shared } from "./LookupPanel";
import { fmtCr, fmtPct, fmtPrice, fmtX } from "./format";

/**
 * What the screen makes of a company that is not on the list: its figures from Yahoo Finance, a verdict against the sector
 * the person picks, and a checklist of which needed figures Yahoo did and did not supply. Nothing here is saved.
 */
export default function PreviewCard({
  preview: yahoo,
  shared,
  onSave,
  sectors,
  benchFor,
  onBack,
}: {
  preview: Preview;
  shared?: Shared;
  onSave?: (field: Field, percent: number) => Promise<string | null>;
  sectors: string[];
  benchFor: (sector: string) => Benchmarks | null;
  onBack?: () => void;
}) {
  // What Yahoo supplied, plus visitors' figures where Yahoo had none. Everything below reads from `preview`.
  const preview = useMemo(() => applyEntered(yahoo, shared?.entered), [yahoo, shared?.entered]);
  const entered = preview.enteredFields ?? [];
  const canEnter = !!shared?.configured && !!onSave;
  const [sector, setSector] = useState(preview.suggestedSector ?? "");
  const bench = sector ? benchFor(sector) : null;
  const v = bench ? verdict(preview.stock, bench) : null;
  const margin = bench ? roeMargin(preview.stock, bench) : null;
  const trend = profitTrend(preview.stock);
  const { have, total } = completeness(yahoo); // Yahoo's own count; visitors' figures are listed separately
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
        <Fig label="ROE" value={f.roe === null ? "Not available" : fmtPct(f.roe)} note={entered.includes("roe") ? "entered by visitors" : undefined} />
        <Fig label="ROCE" value={f.roce === null ? "Not available" : fmtPct(f.roce)} note={entered.includes("roce") ? "entered by visitors" : undefined} />
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
          {entered.length > 0 && ` · ${entered.length} more entered by visitors`}
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
                {canEnter && (c.key === "roe" || c.key === "roce") && (!c.ok || entered.includes(c.key)) && (
                  <EnterFigure ticker={preview.ticker} field={c.key} label={c.label} again={c.ok} onSave={onSave!} />
                )}
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

function Fig({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2">
      <dt className={eyebrow}>{label}</dt>
      <dd className="mt-0.5 text-base font-semibold tabular-nums">{value}</dd>
      {note && <p className="text-xs text-muted">{note}</p>}
    </div>
  );
}

/**
 * Lets a visitor type in a figure Yahoo did not supply. It is saved for everyone and shown, marked unverified, to anyone
 * who previews this company. `again` is true when someone has already entered one and this adds a further opinion.
 */
function EnterFigure({
  ticker,
  field,
  label,
  again,
  onSave,
}: {
  ticker: string;
  field: Field;
  label: string;
  again: boolean;
  onSave: (field: Field, percent: number) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(!again);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = `enter-${field}`;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 text-xs text-primary underline underline-offset-2">
        Think it is different? Enter another {label} figure
      </button>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const percent = Number(text.trim().replace(/%$/, "").replace(",", "."));
    const checked = validateEntry({ ticker, field, percent: text.trim() === "" ? NaN : percent });
    if (!checked.ok) return setError(checked.error);
    setBusy(true);
    setError(null);
    const failed = await onSave(field, percent);
    setBusy(false);
    if (failed) return setError(failed);
    setText("");
    setOpen(false);
  };

  return (
    <form onSubmit={submit} className="mt-2 space-y-1" noValidate>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="text-xs text-muted">
          {label} (%)
        </label>
        <input
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          inputMode="decimal"
          autoComplete="off"
          placeholder="e.g. 18.5"
          aria-describedby={`${id}-help`}
          className="w-24 rounded-lg border border-line bg-surface px-2 py-1 text-sm tabular-nums"
        />
        <button type="submit" disabled={busy} className="rounded-full border border-primary bg-primary px-3 py-1 text-xs font-semibold text-on-primary disabled:opacity-60">
          {busy ? "Saving…" : "Save for everyone"}
        </button>
      </div>
      <p id={`${id}-help`} className="text-xs text-muted">
        Everyone who previews this company will see it, marked as entered by visitors and unverified. Yahoo’s own figure always wins if it has one. It is combined with earlier entries (the median of the last 5).
      </p>
      {error && (
        <p role="alert" className="text-xs" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}
    </form>
  );
}
