import type { Consistency, Verdict } from "./screen";

/**
 * What the sector page shows in words instead of charts: which group each stock falls in, how far it is from the benchmark,
 * which way its profit moved each year, and the filtering, sorting and paging of the grouped table. Nothing here touches the
 * page or the network.
 */

/** The stocks a sector page needs to group and sort: the same fields as a row of the stock table. */
export type Item = {
  stock: { name: string; symbol: string; roe: number | null; roce: number | null; profitHistory?: (number | null)[] | null };
  verdict: Verdict;
  borderline: boolean;
  consistency: Consistency;
  /** ROE minus the cut-off, as a fraction; positive means the stock clears it. */
  margin: number | null;
  bench: { floor: number };
};

// ---- groups --------------------------------------------------------------------------------------------------------

/** Strong, Moderate, Near cut-off (a Skip within the borderline band of passing), Skip, and Not rated (no ROE or ROCE to judge). */
export type GroupKey = "strong" | "moderate" | "near" | "skip" | "na";

export const GROUPS: { key: GroupKey; label: string; meaning: string }[] = [
  { key: "strong", label: "Strong", meaning: "ROE and ROCE both pass" },
  { key: "moderate", label: "Moderate", meaning: "ROE passes, ROCE does not (or is not used)" },
  { key: "near", label: "Near cut-off", meaning: "ROE within 2 points of passing" },
  { key: "skip", label: "Skip", meaning: "ROE does not pass" },
  { key: "na", label: "Not rated", meaning: "no ROE or ROCE to judge by" },
];
export const GROUP_LABEL: Record<GroupKey, string> = Object.fromEntries(GROUPS.map((g) => [g.key, g.label])) as Record<GroupKey, string>;
const GROUP_RANK: Record<GroupKey, number> = { strong: 0, moderate: 1, near: 2, skip: 3, na: 4 };

/** The same split as the Sectors page, so the numbers agree: a Skip within the band is "Near cut-off", not a plain Skip. */
export function groupOf(r: { verdict: Verdict; borderline: boolean }): GroupKey {
  if (r.verdict === "CONSIDER – Strong") return "strong";
  if (r.verdict === "CONSIDER – Moderate") return "moderate";
  if (r.verdict === "SKIP") return r.borderline ? "near" : "skip";
  return "na";
}

export type VerdictFilter = "all" | GroupKey;
export type TrendFilter = "any" | Consistency;
export type Filters = { verdict: VerdictFilter; trend: TrendFilter };
export const NO_FILTERS: Filters = { verdict: "all", trend: "any" };
export const isFiltered = (f: Filters): boolean => f.verdict !== "all" || f.trend !== "any";

export const TRENDS: Consistency[] = ["Consistent", "Recovering", "Mixed", "Weak", "Insufficient data"];

export function filterItems<T extends Item>(rows: T[], f: Filters): T[] {
  return rows.filter((r) => (f.verdict === "all" || groupOf(r) === f.verdict) && (f.trend === "any" || r.consistency === f.trend));
}

/** How many stocks each chip would show. Counted with the profit-trend filter applied, so a chip's number is what clicking it gives. */
export function countGroups<T extends Item>(rows: T[], trend: TrendFilter = "any"): Record<VerdictFilter, number> {
  const out: Record<VerdictFilter, number> = { all: 0, strong: 0, moderate: 0, near: 0, skip: 0, na: 0 };
  for (const r of filterItems(rows, { verdict: "all", trend })) {
    out.all++;
    out[groupOf(r)]++;
  }
  return out;
}

// ---- in words: the benchmark gap and the profit moves ---------------------------------------------------------------

const pct = (fraction: number): string => `${+(fraction * 100).toFixed(1)}%`;

/**
 * Where a stock's ROE stands against its cut-off, in words: "+24.0 pts above", "1.0 pt short", "Below 15% floor". A stock
 * under the minimum ROE says so, whatever the cut-off is. Strict comparison: exactly at the cut-off is not above it.
 */
export function against(r: Pick<Item, "stock" | "margin" | "bench">): string {
  const roe = r.stock.roe;
  if (roe == null || r.margin == null) return "No ROE to compare";
  if (roe < r.bench.floor) return `Below ${pct(r.bench.floor)} floor`;
  const pts = Math.abs(r.margin * 100).toFixed(1);
  const unit = pts === "1.0" ? "pt" : "pts";
  if (r.margin > 0) return `+${pts} ${unit} above`;
  if (r.margin < 0) return `${pts} ${unit} short`;
  return "At the cut-off";
}

export type Step = "up" | "down" | "flat" | "none";
export const STEP_ARROW: Record<Step, string> = { up: "↑", down: "↓", flat: "→", none: "–" };
const STEP_WORD: Record<Step, string> = { up: "rose", down: "fell", flat: "did not change", none: "is unknown" };

/**
 * One step for each year-on-year move across the latest four years (three steps, oldest first). A year with no figure makes
 * both its steps "none", and a history shorter than four years starts with "none"s.
 */
export function trendSteps(history: (number | null)[] | null | undefined): [Step, Step, Step] {
  const last = (history ?? []).slice(-4);
  const w: (number | null)[] = [...Array<null>(4 - last.length).fill(null), ...last];
  const step = (a: number | null, b: number | null): Step =>
    typeof a !== "number" || typeof b !== "number" || !Number.isFinite(a) || !Number.isFinite(b) ? "none" : b > a ? "up" : b < a ? "down" : "flat";
  return [step(w[0], w[1]), step(w[1], w[2]), step(w[2], w[3])];
}

/** "Profit rose, then fell, then rose" for a screen reader. */
export function stepsLabel(steps: Step[]): string {
  if (steps.every((s) => s === "none")) return "Profit moves are not known";
  return "Profit " + steps.map((s) => STEP_WORD[s]).join(", then ");
}

// ---- sorting --------------------------------------------------------------------------------------------------------

export type SortKey = "roe" | "margin" | "roce" | "trend" | "name";
export const SORT_LABELS: Record<SortKey, string> = {
  roe: "ROE, high to low",
  margin: "Against benchmark, best first",
  roce: "ROCE, high to low",
  trend: "Profit trend, best first",
  name: "Name, A to Z",
};
export const DEFAULT_SORT: SortKey = "roe";

const TREND_RANK: Record<Consistency, number> = { Consistent: 0, Recovering: 1, Mixed: 2, Weak: 3, "Insufficient data": 4 };
const byName = (a: Item, b: Item) => a.stock.name.localeCompare(b.stock.name);
/** High to low, a missing figure last, ties by name, so the same data always gives the same table. */
const desc = (get: (r: Item) => number | null) => (a: Item, b: Item) => {
  const x = get(a);
  const y = get(b);
  if (x == null && y == null) return byName(a, b);
  if (x == null) return 1;
  if (y == null) return -1;
  return y - x || byName(a, b);
};

/** A new array: the groups in their fixed order (Strong first), and inside each group the rows in the chosen order. */
export function sortGrouped<T extends Item>(rows: T[], key: SortKey): T[] {
  const inGroup: (a: Item, b: Item) => number =
    key === "name"
      ? byName
      : key === "roce"
        ? desc((r) => r.stock.roce)
        : key === "margin"
          ? desc((r) => r.margin)
          : key === "trend"
            ? (a, b) => TREND_RANK[a.consistency] - TREND_RANK[b.consistency] || desc((r) => r.stock.roe)(a, b)
            : desc((r) => r.stock.roe);
  return [...rows].sort((a, b) => GROUP_RANK[groupOf(a)] - GROUP_RANK[groupOf(b)] || inGroup(a, b));
}

// ---- grouping one page of rows -------------------------------------------------------------------------------------

export const PAGE_SIZE = 25;

export type Section<T> = {
  key: GroupKey;
  /** Every stock in this group after filtering, not only the ones on this page. */
  total: number;
  /** True when the group began on an earlier page, so its heading says it carries on. */
  continued: boolean;
  rows: T[];
};

/** Splits rows `start` to `end` of an already grouped list into one section for each group on that page. */
export function sectionsForPage<T extends Item>(grouped: T[], start: number, end: number): Section<T>[] {
  const totals = new Map<GroupKey, number>();
  for (const r of grouped) totals.set(groupOf(r), (totals.get(groupOf(r)) ?? 0) + 1);
  const out: Section<T>[] = [];
  for (let i = start; i < Math.min(end, grouped.length); i++) {
    const key = groupOf(grouped[i]);
    const last = out[out.length - 1];
    if (last && last.key === key) last.rows.push(grouped[i]);
    else out.push({ key, total: totals.get(key) ?? 0, continued: i > 0 && groupOf(grouped[i - 1]) === key, rows: [grouped[i]] });
  }
  return out;
}
