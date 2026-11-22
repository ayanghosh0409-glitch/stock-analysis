import { ROE_FLOOR, type Benchmarks, type PeerHealth } from "@/lib/screen";
import { PeerBadge } from "./Badges";
import { eyebrow } from "./SectorCards";
import { fmtPct } from "./format";

export type OverrideInput = { roe: string; roce: string; floor?: string };

const card = "rounded-xl border border-line bg-surface p-5 shadow-sm";

function Card({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm sm:p-5">
      <h3 className={eyebrow}>{label}</h3>
      <div className="num mt-2 flex min-h-9 items-center text-2xl sm:text-3xl font-semibold tracking-tight">{children}</div>
      <p className="mt-1 text-xs text-muted">{sub}</p>
    </div>
  );
}

/**
 * What sits above the stock table on a sector page: four cards that say the sector's benchmarks in words (no charts), and the
 * collapsible benchmark workings with the overrides.
 */
export default function SectorView({
  name,
  bench,
  health,
  count,
  override,
  onOverride,
}: {
  name: string;
  bench: Benchmarks;
  health: PeerHealth;
  count: number;
  override: OverrideInput;
  onOverride: (key: "roe" | "roce" | "floor", value: string) => void;
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
    <div className="mb-2 space-y-4">
      <section aria-label={`${name} at a glance`} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Card label="Stocks in this sector" sub="every stock listed here is screened">
          {count}
        </Card>
        <Card
          label="ROE benchmark"
          sub={
            isSet(override.roe)
              ? "your override; a pass needs above this"
              : floorApplies
                ? `a pass needs above this (the ${fmtPct(bench.floor, 0)} minimum applies)`
                : "a pass needs above this and above the minimum"
          }
        >
          {fmtPct(bench.threshold)}
        </Card>
        <Card label="ROCE benchmark" sub={isSet(override.roce) ? "your override; needed for a Strong rating" : "needed for a Strong rating (median of profitable peers)"}>
          {fmtPct(bench.roce)}
        </Card>
        <Card label="Peer set confidence" sub={peerNote}>
          <PeerBadge health={health} />
        </Card>
      </section>

      <details className={`${card} group`}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold focus-visible:outline-2 focus-visible:outline-accent">
          <span>Benchmark details and overrides</span>
          <span aria-hidden className="text-muted transition group-open:rotate-90">
            ›
          </span>
        </summary>
        <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
          <div>
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
              higher of the industry ROE and the minimum.
            </p>
          </div>
          <div>
            <p className="mt-4 text-xs text-muted">Optionally override either with your own figures (in %); leave blank to use the defaults. Overrides are saved in this browser only.</p>
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
                    className="mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink lg:min-h-9"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
