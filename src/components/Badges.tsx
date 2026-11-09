import type { Consistency, PeerHealth, Verdict } from "@/lib/screen";

const base = "inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold";

export function NearCutoffBadge({ points }: { points: number }) {
  return (
    <span
      className={base}
      style={{ background: "var(--warn-bg)", color: "var(--warn)" }}
      title={`ROE is within ${points} points of the cut-off, so a small data change could flip the verdict.`}
    >
      Near cut-off
    </span>
  );
}

export function PeerBadge({ health }: { health: PeerHealth }) {
  const label = { ok: "Solid", caution: "Caution", poor: "Weak" }[health.level];
  const [bg, fg] =
    health.level === "ok"
      ? ["var(--good-bg)", "var(--good)"]
      : health.level === "caution"
        ? ["var(--warn-bg)", "var(--warn)"]
        : ["var(--bad-bg)", "var(--bad)"];
  const title = health.reasons.length
    ? health.reasons.join(". ") + "."
    : `${health.peers} profitable stocks with a compact ROE range.`;
  return (
    <span className={base} style={{ background: bg, color: fg }} title={title}>
      {label}
    </span>
  );
}

export function VerdictBadge({ v }: { v: Verdict }) {
  const style: Record<Verdict, [string, string]> = {
    "CONSIDER – Strong": ["var(--good-bg)", "var(--good)"],
    "CONSIDER – Moderate": ["var(--warn-bg)", "var(--warn)"],
    SKIP: ["var(--bad-bg)", "var(--bad)"],
    "n/a": ["var(--grey-bg)", "var(--muted)"],
  };
  const [bg, fg] = style[v];
  return (
    <span className={base} style={{ background: bg, color: fg }}>
      {v}
    </span>
  );
}

export function ConsistencyBadge({ c }: { c: Consistency }) {
  const style: Record<Consistency, [string, string]> = {
    Consistent: ["var(--good-bg)", "var(--good)"],
    Recovering: ["var(--info-bg)", "var(--info)"],
    Mixed: ["var(--warn-bg)", "var(--warn)"],
    Weak: ["var(--bad-bg)", "var(--bad)"],
    "Insufficient data": ["var(--grey-bg)", "var(--muted)"],
  };
  const [bg, fg] = style[c];
  return (
    <span className={base} style={{ background: bg, color: fg }}>
      {c}
    </span>
  );
}
