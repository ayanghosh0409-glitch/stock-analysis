import type { SectorList } from "./sectorLists";

/**
 * Turns what a person typed ("banks", "pharma", "Banking") into one of the stored sector or industry lists.
 *
 * Yahoo does not say whether a sector exists (an invented name just returns zero stocks), so existence is decided
 * here, against the lists the weekly job stored. Three outcomes: one list matches, several match and the person
 * chooses, or none match and the nearest names are suggested.
 */

export type ListSummary = { kind: SectorList["kind"]; name: string; sector: string | null; total: number };

export type Match =
  | { status: "found"; list: SectorList }
  | { status: "choose"; options: ListSummary[] }
  | { status: "none"; suggestions: ListSummary[] };

const summary = (l: SectorList): ListSummary => ({ kind: l.kind, name: l.name, sector: l.sector, total: l.total });

/** Lower case, dashes and punctuation turned into spaces, "&" into "and": "Banks—Regional" becomes "banks regional". */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Everyday words that do not appear in Yahoo's names. Each points at Yahoo names; any name not in the stored lists is
 * ignored, so an entry can never produce a result that does not exist.
 */
export const ALIASES: Record<string, string[]> = {
  banking: ["Banks—Regional", "Banks—Diversified"],
  bank: ["Banks—Regional", "Banks—Diversified"],
  nbfc: ["Credit Services", "Financial Conglomerates"],
  lending: ["Credit Services"],
  finance: ["Financial Services"],
  financials: ["Financial Services"],
  pharma: ["Drug Manufacturers—Specialty & Generic", "Drug Manufacturers—General"],
  pharmaceutical: ["Drug Manufacturers—Specialty & Generic", "Drug Manufacturers—General"],
  pharmaceuticals: ["Drug Manufacturers—Specialty & Generic", "Drug Manufacturers—General"],
  drugs: ["Drug Manufacturers—Specialty & Generic", "Drug Manufacturers—General"],
  it: ["Information Technology Services", "Software—Application", "Software—Infrastructure"],
  software: ["Software—Application", "Software—Infrastructure"],
  tech: ["Technology"],
  fmcg: ["Packaged Foods", "Household & Personal Products", "Consumer Defensive"],
  auto: ["Auto Manufacturers", "Auto Parts", "Auto & Truck Dealerships"],
  automobile: ["Auto Manufacturers", "Auto Parts"],
  automobiles: ["Auto Manufacturers", "Auto Parts"],
  realty: ["Real Estate"],
  cement: ["Building Materials"],
  power: ["Utilities"],
  oil: ["Oil & Gas Integrated", "Oil & Gas Refining & Marketing", "Oil & Gas E&P"],
  telecom: ["Telecom Services"],
  health: ["Healthcare"],
  hospital: ["Medical Care Facilities"],
  hospitals: ["Medical Care Facilities"],
  textiles: ["Textile Manufacturing"],
  hotels: ["Lodging"],
  hotel: ["Lodging"],
};

/** Edit distance, for "farma" and "banx". Small inputs only. */
export function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

const MAX_OPTIONS = 8;
// Sectors first (the broad answer), then the industries with the most stocks.
const bySize = (a: SectorList, b: SectorList) => (a.kind === b.kind ? b.total - a.total : a.kind === "sector" ? -1 : 1);

function outcome(found: SectorList[]): Match | null {
  if (found.length === 0) return null;
  if (found.length === 1) return { status: "found", list: found[0] };
  return { status: "choose", options: [...found].sort(bySize).slice(0, MAX_OPTIONS).map(summary) };
}

export function matchSector(input: string, lists: SectorList[]): Match {
  const q = norm(input);
  if (!q || lists.length === 0) return { status: "none", suggestions: [] };
  const named = new Map(lists.map((l) => [l.name, l]));

  // 1. The name exactly, ignoring case and punctuation.
  const exact = lists.filter((l) => norm(l.name) === q);
  if (exact.length) return outcome(exact)!;

  // 2. An everyday word that points at Yahoo names.
  const aliased = (ALIASES[q] ?? []).map((n) => named.get(n)).filter((l): l is SectorList => !!l);
  const viaAlias = outcome(aliased);
  if (viaAlias) return viaAlias;

  // 3. Every word typed starts a word of the name ("bank" finds "Banks—Regional"; "real est" finds "Real Estate").
  const tokens = q.split(" ");
  const starts = lists.filter((l) => {
    const words = norm(l.name).split(" ");
    return tokens.every((t) => words.some((w) => w.startsWith(t)));
  });
  const viaWords = outcome(starts);
  if (viaWords) return viaWords;

  // 4. Nothing matches: suggest the nearest names, by edit distance to the whole name, to each of its words, and to the everyday words.
  const scored = new Map<string, number>();
  const note = (l: SectorList | undefined, d: number) => {
    if (l && d < (scored.get(l.name) ?? Infinity)) scored.set(l.name, d);
  };
  for (const l of lists) {
    const n = norm(l.name);
    note(l, distance(q, n));
    for (const w of n.split(" ")) if (w.length > 2) note(l, distance(q, w));
  }
  for (const [word, names] of Object.entries(ALIASES)) for (const n of names) note(named.get(n), distance(q, word));
  const limit = Math.max(2, Math.floor(q.length * 0.4));
  const near = lists.filter((l) => (scored.get(l.name) ?? Infinity) <= limit).sort((a, b) => scored.get(a.name)! - scored.get(b.name)! || bySize(a, b));
  return { status: "none", suggestions: near.slice(0, 3).map(summary) };
}

/** The sectors, for "did you mean one of these?" when nothing is near. */
export function sectorNames(lists: SectorList[]): string[] {
  return lists.filter((l) => l.kind === "sector").map((l) => l.name);
}
