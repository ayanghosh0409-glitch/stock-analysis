import type { Benchmarks, PeerHealth } from "@/lib/screen";
import { donutArcs, share, type Tally } from "@/lib/overview";
import { PeerBadge } from "./Badges";
import { fmtPct } from "./format";

export type SectorSummary = { name: string; bench: Benchmarks; health: PeerHealth; t: Tally; built?: boolean };

export const eyebrow = "text-[11px] font-medium uppercase tracking-wider text-muted";

/** One row of big numbers across all sectors, like the stat strip in the reference design. */
export function OverviewStats({ total, sectors, near }: { total: Tally; sectors: number; near: number }) {
  const tiles = [
    { value: total.n, label: "Stocks screened", sub: `across ${sectors} sectors` },
    { value: total.pass, label: "Worth a closer look", sub: `of ${total.n} pass the ROE rule` },
    { value: total.strong, label: "Rated Strong", sub: "ROE and ROCE both pass" },
    { value: near, label: "Near the cut-off", sub: "within 2 points, could flip" },
  ];
  return (
    <section aria-label="All sectors at a glance" className="mb-5 grid grid-cols-2 divide-line rounded-xl border border-line bg-surface shadow-sm lg:grid-cols-4 lg:divide-x">
      {tiles.map((t) => (
        <div key={t.label} className="px-5 py-4 text-center">
          <div className="num text-3xl font-semibold tracking-tight">{t.value}</div>
          <div className="mt-0.5 text-sm font-medium">{t.label}</div>
          <div className="text-xs text-muted">{t.sub}</div>
        </div>
      ))}
    </section>
  );
}

const Dot = ({ colour }: { colour: string }) => <span aria-hidden className="inline-block size-2 shrink-0 rounded-full" style={{ background: colour }} />;

export function Donut({ t }: { t: Tally }) {
  const parts = [
    { label: "Strong", count: t.strong, colour: "var(--good)" },
    { label: "Moderate", count: t.moderate, colour: "var(--warn)" },
    { label: "Skip", count: t.skip, colour: "var(--bad)" },
    ...(t.na > 0 ? [{ label: "Not rated", count: t.na, colour: "var(--muted)" }] : []),
  ];
  const arcs = donutArcs(parts.map((p) => p.count));
  return (
    <div className="flex items-center gap-4">
      <div className="relative size-[88px] shrink-0">
        <svg viewBox="0 0 42 42" aria-hidden className="size-full -rotate-90">
          <circle cx="21" cy="21" r="15.9155" fill="none" stroke="var(--grey-bg)" strokeWidth="5" />
          {parts.map((p, i) =>
            arcs[i].dash > 0 ? (
              <circle
                key={p.label}
                cx="21"
                cy="21"
                r="15.9155"
                fill="none"
                stroke={p.colour}
                strokeWidth="5"
                strokeDasharray={`${arcs[i].dash} ${100 - arcs[i].dash}`}
                strokeDashoffset={arcs[i].offset}
              />
            ) : null,
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-tight">
          <span className="num text-lg font-semibold">{t.pass}</span>
          <span className="text-[10px] text-muted">of {t.n}</span>
          <span className="sr-only"> stocks pass the screen</span>
        </div>
      </div>
      <ul className="flex-1 space-y-1 text-sm">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2">
            <Dot colour={p.colour} />
            <span className="text-muted">{p.label}</span>
            <span className="num ml-auto font-medium">{p.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TrendBar({ t }: { t: Tally }) {
  const parts = [
    { label: "Consistent", count: t.consistent, colour: "var(--good)" },
    { label: "Recovering", count: t.recovering, colour: "var(--info)" },
    { label: "Mixed", count: t.mixed, colour: "var(--warn)" },
    { label: "Weak", count: t.weak, colour: "var(--bad)" },
    { label: "No data", count: t.nodata, colour: "var(--muted)" },
  ].filter((p) => p.count > 0);
  return (
    <div>
      <div aria-hidden className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-surface2">
        {parts.map((p) => (
          <span key={p.label} style={{ width: `${share(p.count, t.n)}%`, background: p.colour }} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5">
            <Dot colour={p.colour} />
            <span className="text-muted">{p.label}</span>
            <span className="num font-medium">{p.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SectorCard({ s, onOpen }: { s: SectorSummary; onOpen: (name: string) => void }) {
  const { bench, t } = s;
  const floorApplies = bench.roe != null && bench.threshold != null && bench.threshold > bench.roe;
  return (
    <article className="relative flex flex-col gap-5 rounded-xl border border-line bg-surface p-5 shadow-sm transition hover:border-accent hover:shadow-md has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">
            {/* The button stretches over the whole card, so the card is one big target while staying a real, focusable button. */}
            <button type="button" onClick={() => onOpen(s.name)} className="outline-none after:absolute after:inset-0 after:content-['']" aria-label={`Open ${s.name} sector, ${t.n} stocks`}>
              {s.name}
            </button>
          </h3>
          <p className="text-xs text-muted">
            {t.n} stocks
            {s.built && <span className="ml-2 rounded-full border border-line bg-surface2 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">From Yahoo</span>}
          </p>
        </div>
        <div className="relative z-10 flex flex-col items-end gap-1">
          <span className={eyebrow}>Peer set</span>
          <PeerBadge health={s.health} />
        </div>
      </header>

      <section aria-label={`${s.name} industry benchmark`}>
        <h4 className={eyebrow}>Industry benchmark</h4>
        <dl className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-surface2 px-3 py-2">
            <dt className="text-xs text-muted">ROE cut-off</dt>
            <dd className="num text-xl font-semibold tracking-tight">{fmtPct(bench.threshold)}</dd>
          </div>
          <div className="rounded-lg bg-surface2 px-3 py-2">
            <dt className="text-xs text-muted">Industry ROCE</dt>
            <dd className="num text-xl font-semibold tracking-tight">{fmtPct(bench.roce)}</dd>
          </div>
        </dl>
        <p className="mt-1.5 text-[11px] text-muted">
          {floorApplies
            ? `Peer median ROE is ${fmtPct(bench.roe)}, so the ${fmtPct(bench.floor, 0)} minimum applies.`
            : s.built
              ? `Median of the profitable stocks among these ${t.n}, not of the whole sector.`
              : "Median of the profitable peers in this sector."}
        </p>
      </section>

      <section aria-label={`${s.name} screen results`}>
        <h4 className={eyebrow}>Screen results · {t.n} stocks</h4>
        <div className="mt-2">
          <Donut t={t} />
        </div>
      </section>

      <section aria-label={`${s.name} profit consistency`}>
        <h4 className={eyebrow}>Profit consistency · {t.n} stocks</h4>
        <div className="mt-2">
          <TrendBar t={t} />
        </div>
      </section>

      <p aria-hidden className="mt-auto text-sm font-medium text-accent">
        View stocks →
      </p>
    </article>
  );
}

export default function SectorCards({ sectors, onOpen }: { sectors: SectorSummary[]; onOpen: (name: string) => void }) {
  return (
    <section aria-label="Sector cards" className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {sectors.map((s) => (
        <SectorCard key={s.name} s={s} onOpen={onOpen} />
      ))}
    </section>
  );
}
