import type { Consistency, Verdict } from "./screen";

/** Stock-level results for one group of stocks (a sector, or all of them). Every stock lands in exactly one bucket per row of the card. */
export type Tally = {
  n: number;
  strong: number;
  moderate: number;
  skip: number;
  /** Stocks the screen could not judge (no ROE or ROCE). */
  na: number;
  /** Strong + Moderate: the stocks the screen says to consider. */
  pass: number;
  consistent: number;
  recovering: number;
  mixed: number;
  weak: number;
  nodata: number;
};

export function tally(rows: { verdict: Verdict; consistency: Consistency }[]): Tally {
  const t: Tally = { n: rows.length, strong: 0, moderate: 0, skip: 0, na: 0, pass: 0, consistent: 0, recovering: 0, mixed: 0, weak: 0, nodata: 0 };
  for (const r of rows) {
    if (r.verdict === "CONSIDER – Strong") t.strong++;
    else if (r.verdict === "CONSIDER – Moderate") t.moderate++;
    else if (r.verdict === "SKIP") t.skip++;
    else t.na++;
    if (r.consistency === "Consistent") t.consistent++;
    else if (r.consistency === "Recovering") t.recovering++;
    else if (r.consistency === "Mixed") t.mixed++;
    else if (r.consistency === "Weak") t.weak++;
    else t.nodata++;
  }
  t.pass = t.strong + t.moderate;
  return t;
}

/** Share of a total as a percentage, 0 when there is nothing to divide. */
export const share = (count: number, total: number): number => (total > 0 ? (count / total) * 100 : 0);

export type Arc = { dash: number; offset: number };

/**
 * Stroke geometry for a ring split into parts, on a circle whose circumference is 100 units (radius 15.9155).
 * Each arc is drawn as `dash` long then a gap, starting `offset` units from the start of the ring.
 * A small gap separates neighbouring arcs, but only when there is more than one visible arc.
 */
export function donutArcs(counts: number[], gap = 0.8): Arc[] {
  const total = counts.reduce((a, b) => a + b, 0);
  const visible = counts.filter((c) => c > 0).length;
  const g = visible > 1 ? gap : 0;
  let start = 0;
  return counts.map((c) => {
    const len = share(c, total);
    const arc = { dash: Math.max(len - g, 0), offset: -start };
    start += len;
    return arc;
  });
}

/**
 * The first row for each company. The overview counts a company once even when it sits in two sectors (TCS is in the listed
 * IT sector and in a built Technology sector); rows come in tab order, so the listed sector wins over a built one.
 */
export function firstPerSymbol<T extends { stock: { symbol: string } }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.stock.symbol)) return false;
    seen.add(r.stock.symbol);
    return true;
  });
}
