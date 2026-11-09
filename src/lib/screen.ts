import type { Stock } from "./types";

export type Verdict = "CONSIDER – Strong" | "CONSIDER – Moderate" | "SKIP" | "n/a";
export type Consistency =
  | "Consistent"
  | "Recovering"
  | "Mixed"
  | "Weak"
  | "Insufficient data";

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

export function median(xs: (number | null | undefined)[]): number | null {
  const v = xs.filter(isNum).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export type Override = { roe: number | null; roce: number | null };

export type Benchmarks = {
  medianRoe: number | null;
  medianRoce: number | null;
  roe: number | null; // value actually used (override wins)
  roce: number | null;
};

export function benchmarks(stocks: Stock[], o?: Override): Benchmarks {
  const medianRoe = median(stocks.map((s) => s.roe));
  const medianRoce = median(stocks.map((s) => s.roce));
  return {
    medianRoe,
    medianRoce,
    roe: isNum(o?.roe) ? o!.roe : medianRoe,
    roce: isNum(o?.roce) ? o!.roce : medianRoce,
  };
}

/** Strict comparison: a stock exactly at the benchmark fails. */
const passes = (x: number, bench: number) => x > bench;

export function verdict(s: Stock, b: Benchmarks): Verdict {
  if (!isNum(s.roe) || !isNum(s.roce) || !isNum(b.roe) || !isNum(b.roce)) return "n/a";
  if (!passes(s.roe, b.roe)) return "SKIP";
  return passes(s.roce, b.roce) ? "CONSIDER – Strong" : "CONSIDER – Moderate";
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
  if (!isNum(b.roe) || !isNum(b.roce)) return "The sector has no benchmark yet.";
  const word = "above";
  const roeOk = passes(s.roe, b.roe);
  const roceOk = passes(s.roce, b.roce);
  const pct = (x: number) => (x * 100).toFixed(1) + "%";
  if (!roeOk)
    return `ROE ${pct(s.roe)} is not ${word} the industry ${pct(b.roe)}, so the stock is skipped.`;
  return roceOk
    ? `ROE ${pct(s.roe)} is ${word} the industry ${pct(b.roe)} and ROCE ${pct(s.roce)} is ${word} ${pct(b.roce)}.`
    : `ROE ${pct(s.roe)} is ${word} the industry ${pct(b.roe)}, but ROCE ${pct(s.roce)} is not ${word} ${pct(b.roce)}.`;
}
