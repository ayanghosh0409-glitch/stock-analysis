import { norm } from "./sectorMatch";
import type { Benchmarks, PeerHealth, Verdict } from "./screen";
import type { Sector } from "./types";

/**
 * The numbers behind the Sectors page: one row per sector, and the search, filters, sorting and paging that keep the
 * table to one page of rows however many sectors have been built. Nothing here touches the page or the network.
 */

/** What the screen calls the peer set, in the words the site uses everywhere. */
export type Grade = "Good" | "Fair" | "Weak";
export const GRADE: Record<PeerHealth["level"], Grade> = { ok: "Good", caution: "Fair", poor: "Weak" };
const GRADE_RANK: Record<Grade, number> = { Good: 0, Fair: 1, Weak: 2 };

/**
 * Every stock in a sector lands in exactly one bucket. "Near cut-off" is a Skip that missed the ROE cut-off by no more
 * than the borderline band, so a stock that only just failed is not lost among the plain Skips. "Not rated" is a stock
 * the screen could not judge (no ROE or ROCE).
 */
export type Buckets = { strong: number; moderate: number; near: number; skip: number; na: number };

export function bucketCounts(rows: { verdict: Verdict; borderline: boolean }[]): Buckets {
  const b: Buckets = { strong: 0, moderate: 0, near: 0, skip: 0, na: 0 };
  for (const r of rows) {
    if (r.verdict === "CONSIDER – Strong") b.strong++;
    else if (r.verdict === "CONSIDER – Moderate") b.moderate++;
    else if (r.verdict === "SKIP") {
      if (r.borderline) b.near++;
      else b.skip++;
    }
    else b.na++;
  }
  return b;
}

export type SectorRow = Buckets & {
  name: string;
  built: boolean;
  /** When the server built a shared sector (ISO). Null for a listed sector, or one only this visitor has built so far. */
  builtOn: string | null;
  n: number;
  /** Strong plus Moderate as a fraction of the sector's stocks, 0 to 1. */
  passShare: number;
  medianRoe: number | null;
  grade: Grade;
  health: PeerHealth;
};

/** A fraction of a whole, 0 when there is nothing to divide. */
export const fraction = (count: number, total: number): number => (total > 0 ? count / total : 0);

/** One row for every sector. A company that sits in two sectors counts in both, because each row describes its own sector. */
export function buildSectorRows(
  sectors: Sector[],
  stockRows: { sector: string; verdict: Verdict; borderline: boolean }[],
  info: Record<string, { bench: Benchmarks; health: PeerHealth } | undefined>,
): SectorRow[] {
  const bySector = new Map<string, { verdict: Verdict; borderline: boolean }[]>();
  for (const r of stockRows) {
    const list = bySector.get(r.sector);
    if (list) list.push(r);
    else bySector.set(r.sector, [r]);
  }
  return sectors.map((sec) => {
    const b = bucketCounts(bySector.get(sec.name) ?? []);
    const i = info[sec.name];
    const n = sec.stocks.length;
    return {
      ...b,
      name: sec.name,
      built: !!sec.built,
      builtOn: sec.built?.builtAt ?? null,
      n,
      passShare: fraction(b.strong + b.moderate, n),
      medianRoe: i?.bench.roe ?? null,
      grade: i ? GRADE[i.health.level] : "Weak",
      health: i?.health ?? { level: "poor", peers: 0, lossMaking: 0, spread: null, reasons: [] },
    };
  });
}

/** "6 Strong · 1 Moderate · 1 Near · 3 Skip", with "· 2 Not rated" only when there are some. */
export function countsText(b: Buckets): string {
  const parts = [`${b.strong} Strong`, `${b.moderate} Moderate`, `${b.near} Near`, `${b.skip} Skip`];
  if (b.na > 0) parts.push(`${b.na} Not rated`);
  return parts.join(" · ");
}

/** What a screen reader says for the bar, in full words. */
export function barLabel(name: string, b: Buckets): string {
  const parts = [`${b.strong} strong`, `${b.moderate} moderate`, `${b.near} near the cut-off`, `${b.skip} skip`];
  if (b.na > 0) parts.push(`${b.na} not rated`);
  return `${name}: ${parts.join(", ")}`;
}

/** "12 Nov" for an ISO time, always in India's time zone so the server and the browser agree. Empty for a bad value. */
export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(d);
}

// ---- search, filter, sort ------------------------------------------------------------------------------------------

export type SourceFilter = "all" | "listed" | "built";
export type GradeFilter = "any" | Grade;
export type SortKey = "pass" | "roe" | "stocks" | "name" | "peer";
export type Filters = { q: string; source: SourceFilter; grade: GradeFilter };

export const NO_FILTERS: Filters = { q: "", source: "all", grade: "any" };
export const isFiltered = (f: Filters): boolean => f.q.trim() !== "" || f.source !== "all" || f.grade !== "any";

/** The rows that match the search words (every word must appear in the name), the source chip and the peer-set grade. */
export function filterSectors(rows: SectorRow[], f: Filters): SectorRow[] {
  const tokens = norm(f.q).split(" ").filter(Boolean);
  return rows.filter((r) => {
    if (f.source === "listed" && r.built) return false;
    if (f.source === "built" && !r.built) return false;
    if (f.grade !== "any" && r.grade !== f.grade) return false;
    if (tokens.length) {
      const n = norm(r.name);
      if (!tokens.every((t) => n.includes(t))) return false;
    }
    return true;
  });
}

export function countBySource(rows: SectorRow[]): { all: number; listed: number; built: number } {
  const built = rows.filter((r) => r.built).length;
  return { all: rows.length, listed: rows.length - built, built };
}

const byName = (a: SectorRow, b: SectorRow) => a.name.localeCompare(b.name);
const roeOf = (r: SectorRow) => r.medianRoe;

/** A new array, sorted. Ties and gaps never reorder at random: the same data always gives the same table. */
export function sortSectors(rows: SectorRow[], key: SortKey): SectorRow[] {
  const out = [...rows];
  switch (key) {
    case "name":
      return out.sort(byName);
    case "stocks":
      return out.sort((a, b) => b.n - a.n || byName(a, b));
    case "roe":
      return out.sort((a, b) => {
        const x = roeOf(a);
        const y = roeOf(b);
        if (x == null && y == null) return byName(a, b);
        if (x == null) return 1;
        if (y == null) return -1;
        return y - x || byName(a, b);
      });
    case "peer":
      return out.sort((a, b) => GRADE_RANK[a.grade] - GRADE_RANK[b.grade] || b.passShare - a.passShare || byName(a, b));
    case "pass":
    default:
      return out.sort((a, b) => b.passShare - a.passShare || b.n - a.n || byName(a, b));
  }
}

export const SORT_LABELS: Record<SortKey, string> = {
  pass: "Share that pass",
  roe: "Median ROE",
  stocks: "Most stocks",
  peer: "Peer set, best first",
  name: "Name, A to Z",
};

// ---- paging --------------------------------------------------------------------------------------------------------

export const PAGE_SIZES = [10, 25, 50] as const;

export type Page = {
  page: number; // the page actually shown, 1-based, after keeping it inside the range
  pages: number;
  /** Slice bounds into the sorted list. */
  start: number;
  end: number;
  /** For "Showing 1–10 of 50": from is 0 when the list is empty. */
  from: number;
  to: number;
  total: number;
};

/** Which rows to show. A page number outside the range (a filter just shrank the list) is pulled back inside it. */
export function paginate(total: number, page: number, size: number): Page {
  const s = Math.max(1, Math.floor(size) || 1);
  const pages = Math.max(1, Math.ceil(total / s));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (p - 1) * s;
  const end = Math.min(total, start + s);
  return { page: p, pages, start, end, from: total === 0 ? 0 : start + 1, to: end, total };
}

/** The page buttons: all of them when there are few, otherwise the first, the last and the neighbours of the current one. */
export function pageNumbers(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((n, i) => {
    const prev = sorted[i - 1];
    if (prev !== undefined) {
      if (n - prev === 2) out.push(prev + 1);
      else if (n - prev > 2) out.push("…");
    }
    out.push(n);
  });
  return out;
}
