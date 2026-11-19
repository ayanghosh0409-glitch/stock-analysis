import type { ComponentProps } from "react";
import { ROE_FLOOR, type Benchmarks, type PeerHealth } from "@/lib/screen";
import type { Tally } from "@/lib/overview";
import { PeerBadge } from "./Badges";
import { RoeRoceScatter } from "./Charts";
import { Donut, TrendBar, eyebrow } from "./SectorCards";
import { fmtPct } from "./format";

export type OverrideInput = { roe: string; roce: string; floor?: string };
type Points = ComponentProps<typeof RoeRoceScatter>["points"];

const card = "rounded-xl border border-line bg-surface p-5 shadow-sm";

function Stat({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4 text-center">
      <div className="num flex min-h-9 items-center justify-center text-3xl font-semibold tracking-tight">{children}</div>
      <div className="mt-0.5 text-sm font-medium">{label}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

const LEGEND = [
  { label: "Strong", colour: "var(--good)" },
  { label: "Moderate", colour: "var(--warn)" },
  { label: "Skip", colour: "var(--bad)" },
];

/**
 * Everything above the stock table on a sector tab: the sector's headline numbers, how its stocks
 * fared, the benchmark workings with overrides, and the ROE-vs-ROCE chart. `children` is where
 * further panels (such as news) slot in under the chart.
 */
export default function SectorView({
  name,
  bench,
  health,
  t,
  points,
  override,
  onOverride,
  onPick,
  children,
}: {
  name: string;
  bench: Benchmarks;
  health: PeerHealth;
  t: Tally;
  points: Points;
  override: OverrideInput;
  onOverride: (key: "roe" | "roce" | "floor", value: string) => void;
  onPick: (symbol: string) => void;
  children?: React.ReactNode;
}) {
  const isSet = (v: string | undefined) => !!v && v.trim() !== "" && Number.isFinite(Number(v));
  const floorApplies = bench.roe != null && bench.threshold != null && bench.threshold > bench.roe;
  const peerNote = health.reasons.length ? health.reasons.join(" · ") : `${health.peers} profitable stocks, compact ROE range`;
  const rows: [string, string, boolean][] = [
    ["Median ROE (profitable stocks)", fmtPct(bench.medianRoe), false],
    ["Median ROCE", fmtPct(bench.medianRoce), false],
    ["Minimum ROE", fmtPct(bench.floor), false],
    ["ROE cut-off used", fmtPct(bench.threshold), true],
    ["ROCE used", fmtPct(bench.roce), true],
  ];

  return (
    <div className="mb-6 space-y-4">
      <section aria-label={`${name} at a glance`} className="grid grid-cols-2 divide-line rounded-xl border border-line bg-surface shadow-sm lg:grid-cols-4 lg:divide-x">
        <Stat label="Stocks" sub="in this sector">{t.n}</Stat>
        <Stat label="ROE cut-off" sub={isSet(override.roe) ? "your override" : floorApplies ? `${fmtPct(bench.floor, 0)} minimum applies` : "median of profitable peers"}>{fmtPct(bench.threshold)}</Stat>
        <Stat label="Industry ROCE" sub={isSet(override.roce) ? "your override" : "median of profitable peers"}>{fmtPct(bench.roce)}</Stat>
        <Stat label="Peer set" sub={peerNote}>
          <PeerBadge health={health} />
        </Stat>
      </section>

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <section aria-label={`${name} screen results`} className={card}>
            <h3 className={eyebrow}>Screen results · {t.n} stocks</h3>
            <div className="mt-3">
              <Donut t={t} />
            </div>
          </section>
          <section aria-label={`${name} profit consistency`} className={card}>
            <h3 className={eyebrow}>Profit consistency · {t.n} stocks</h3>
            <div className="mt-3">
              <TrendBar t={t} />
            </div>
          </section>
          <details className={`${card} group`}>
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
              <span>Benchmark details and overrides</span>
              <span aria-hidden className="text-muted transition group-open:rotate-90">›</span>
            </summary>
            <dl className="mt-4 space-y-2 text-sm">
              {rows.map(([k, v, strong]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-muted">{k}</dt>
                  <dd className={`num ${strong ? "font-semibold" : ""}`}>{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-muted">
              Each stock is compared with its sector peers without itself, so its own figures are not in its benchmark. The cut-off is the
              higher of the industry ROE and the minimum. Optionally override either with your own figures (in %); leave blank to use the
              defaults. Overrides are saved in this browser only.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
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
                    value={override[k] ?? ""}
                    placeholder={placeholder}
                    onChange={(e) => onOverride(k, e.target.value)}
                    className="mt-1 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
                  />
                </label>
              ))}
            </div>
          </details>
        </div>

        <section aria-label={`${name} ROE versus ROCE`} className={card}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold tracking-tight">ROE vs ROCE</h3>
              <p className="text-xs text-muted">Dashed lines are the sector cut-offs. Click a point to open the stock.</p>
            </div>
            <ul className="flex gap-3 text-xs">
              {LEGEND.map((l) => (
                <li key={l.label} className="flex items-center gap-1.5">
                  <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: l.colour }} />
                  <span className="text-muted">{l.label}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-3">
            {points.length > 0 ? (
              <RoeRoceScatter points={points} roeBench={bench.threshold} roceBench={bench.roce} onPick={onPick} />
            ) : (
              <p className="py-16 text-center text-sm text-muted">No stock here has both ROE and ROCE, so there is nothing to plot. Open a stock in the table below for its figures.</p>
            )}
          </div>
        </section>
      </div>
      {children}
    </div>
  );
}
