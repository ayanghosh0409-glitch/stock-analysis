import type { Stock } from "./types";

export type Verdict = "CONSIDER – Strong" | "CONSIDER – Moderate" | "SKIP" | "n/a";
export type Consistency =
  | "Consistent"
  | "Recovering"
  | "Mixed"
  | "Weak"
  | "Insufficient data";

/** Tunable rules. Fractions, so 0.15 means 15%. */
export const ROE_FLOOR = 0.15; // a stock must also clear this minimum ROE, whatever its peers earn
export const BORDERLINE_BAND = 0.02; // within 2 points of the cut-off counts as a close call
export const THIN_PEERS = 8; // fewer profitable peers than this makes a benchmark thin
export const MIN_PEERS = 5; // fewer than this and the benchmark is not trustworthy
export const LOSS_MAKERS_WARN = 2; // this many loss-making companies makes a peer set noisy
export const SPREAD_WARN = 0.2; // middle-half ROE spread wider than this is flagged

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

export function median(xs: (number | null | undefined)[]): number | null {
  const v = xs.filter(isNum).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Linear-interpolated quantile of numbers already sorted ascending. */
export function quantile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const k = (sorted.length - 1) * p;
  const lo = Math.floor(k);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (k - lo);
}

/** A company that lost money over the trailing year. Left out of benchmarks. */
export const isLossMaking = (s: Stock): boolean =>
  (isNum(s.profit) && s.profit <= 0) || (isNum(s.roe) && s.roe < 0);

export type Override = { roe: number | null; roce: number | null; floor?: number | null };

export type Benchmarks = {
  medianRoe: number | null; // median of the profitable peers behind this benchmark
  medianRoce: number | null;
  roe: number | null; // industry ROE actually used (override wins)
  roce: number | null; // industry ROCE actually used
  floor: number; // minimum ROE in force
  threshold: number | null; // the ROE a stock must beat: the higher of industry ROE and the floor
  peers: number; // profitable peers with an ROE behind the median
};

function build(peers: Stock[], o?: Override): Benchmarks {
  const ok = peers.filter((p) => !isLossMaking(p));
  const medianRoe = median(ok.map((p) => p.roe));
  const medianRoce = median(ok.map((p) => p.roce));
  const roe = isNum(o?.roe) ? o.roe : medianRoe;
  const roce = isNum(o?.roce) ? o.roce : medianRoce;
  const floor = isNum(o?.floor) ? o.floor : ROE_FLOOR;
  return {
    medianRoe,
    medianRoce,
    roe,
    roce,
    floor,
    threshold: isNum(roe) ? Math.max(roe, floor) : null,
    peers: ok.filter((p) => isNum(p.roe)).length,
  };
}

/** Sector-wide reference: every profitable stock in the sector. Used for summaries and chart lines. */
export function benchmarks(stocks: Stock[], o?: Override): Benchmarks {
  return build(stocks, o);
}

/** The benchmark a single stock is judged against: its sector peers, never the stock itself. */
export function benchmarkFor(s: Stock, stocks: Stock[], o?: Override): Benchmarks {
  return build(
    stocks.filter((p) => p.symbol !== s.symbol),
    o,
  );
}

/** Strict comparison: a stock exactly at the cut-off fails. */
const passes = (x: number, bench: number) => x > bench;

export function verdict(s: Stock, b: Benchmarks): Verdict {
  if (!isNum(s.roe) || !isNum(s.roce) || !isNum(b.threshold) || !isNum(b.roce)) return "n/a";
  if (!passes(s.roe, b.threshold)) return "SKIP";
  return passes(s.roce, b.roce) ? "CONSIDER – Strong" : "CONSIDER – Moderate";
}

/** ROE minus the cut-off, as a fraction (0.032 is 3.2 points). Positive means the stock clears it. */
export function roeMargin(s: Stock, b: Benchmarks): number | null {
  return isNum(s.roe) && isNum(b.threshold) ? s.roe - b.threshold : null;
}

/** True when ROE is within the borderline band of the cut-off, on either side. */
export function isBorderline(s: Stock, b: Benchmarks): boolean {
  const m = roeMargin(s, b);
  return m !== null && Math.abs(m) <= BORDERLINE_BAND + 1e-9;
}

export type PeerHealth = {
  level: "ok" | "caution" | "poor";
  peers: number; // profitable stocks with an ROE
  lossMaking: number;
  spread: number | null; // ROE range of the middle half of peers
  reasons: string[];
};

/** How far the sector's peer set can be trusted as an industry benchmark. */
export function peerHealth(stocks: Stock[]): PeerHealth {
  const ok = stocks.filter((s) => !isLossMaking(s) && isNum(s.roe));
  const lossMaking = stocks.filter(isLossMaking).length;
  const roes = ok.map((s) => s.roe as number).sort((a, b) => a - b);
  const q1 = quantile(roes, 0.25);
  const q3 = quantile(roes, 0.75);
  const spread = roes.length >= 4 && q1 !== null && q3 !== null ? q3 - q1 : null;

  const reasons: string[] = [];
  if (ok.length < THIN_PEERS) reasons.push(`Only ${ok.length} profitable stocks with an ROE (${THIN_PEERS}+ preferred)`);
  if (lossMaking >= LOSS_MAKERS_WARN) reasons.push(`${lossMaking} loss-making companies are left out of the median`);
  if (spread !== null && spread > SPREAD_WARN)
    reasons.push(`ROE varies widely: the middle half of stocks spans ${(spread * 100).toFixed(0)} points`);

  const level = ok.length < MIN_PEERS || reasons.length >= 2 ? "poor" : reasons.length === 1 ? "caution" : "ok";
  return { level, peers: ok.length, lossMaking, spread, reasons };
}

export type ProfitTrend = {
  cagr: number | "n/m" | null;
  growthYears: number | null;
  steps: number;
  hasLoss: boolean | null;
  consistency: Consistency;
};

/** Mirrors the workbook's columns Y, Z, AA and Q. Never feeds into the verdict. */
export function profitTrend(s: Stock): ProfitTrend {
  const h = s.profitHistory ?? [];
  const count = h.filter(isNum).length;
  const first = h[0];
  const last = h[h.length - 1];

  let cagr: ProfitTrend["cagr"] = null;
  if (isNum(first) && isNum(last)) cagr = first > 0 && last > 0 ? Math.pow(last / first, 1 / 4) - 1 : "n/m";

  let growth = 0;
  let steps = 0;
  for (let i = 0; i < h.length - 1; i++) {
    const a = h[i];
    const b = h[i + 1];
    if (isNum(a) && isNum(b)) {
      steps++;
      if (b > a) growth++;
    }
  }
  const growthYears = count < 2 ? null : growth;
  const hasLoss = count === 0 ? null : h.some((x) => isNum(x) && x < 0);

  let consistency: Consistency;
  if (count < 4) consistency = "Insufficient data";
  else if (hasLoss) consistency = isNum(last) && last > 0 && growth === steps ? "Recovering" : "Weak";
  else if (isNum(cagr) && cagr <= 0) consistency = "Weak";
  else consistency = steps > 0 && growth / steps >= 0.75 ? "Consistent" : "Mixed";

  return { cagr, growthYears, steps, hasLoss, consistency };
}

export function explain(s: Stock, b: Benchmarks): string {
  if (!isNum(s.roe) || !isNum(s.roce)) return "ROE or ROCE is missing, so no verdict can be given.";
  if (!isNum(b.threshold) || !isNum(b.roe) || !isNum(b.roce)) return "The sector has no benchmark yet.";
  const pct = (x: number) => (x * 100).toFixed(1) + "%";
  const limit =
    b.floor > b.roe
      ? `the ${pct(b.floor)} minimum ROE (industry ROE is ${pct(b.roe)})`
      : `the industry ROE of ${pct(b.roe)}`;
  const close = isBorderline(s, b)
    ? ` It is within ${(BORDERLINE_BAND * 100).toFixed(0)} points of the cut-off, so treat the call as close.`
    : "";
  if (!passes(s.roe, b.threshold)) return `ROE ${pct(s.roe)} does not beat ${limit}, so the stock is skipped.${close}`;
  return passes(s.roce, b.roce)
    ? `ROE ${pct(s.roe)} beats ${limit} and ROCE ${pct(s.roce)} beats the industry ${pct(b.roce)}.${close}`
    : `ROE ${pct(s.roe)} beats ${limit}, but ROCE ${pct(s.roce)} does not beat the industry ${pct(b.roce)}.${close}`;
}
