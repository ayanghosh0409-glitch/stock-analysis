import type { SectorList } from "./sectorLists";
import type { Sector, Stock } from "./types";
import type { Preview } from "./yahoo";

/**
 * Turns the ten companies Yahoo returned for a sector or industry into a sector the dashboard can show, using the same
 * screen as the listed ones. Pure: the fetching is done by the component, the rules by screen.ts.
 */

/** Yahoo industries where ROCE means little: lenders and insurers fund themselves with deposits, premiums and borrowings. */
const ROE_ONLY = /^(Banks|Insurance|Credit Services|Mortgage Finance|Financial Conglomerates)/;

export const ROE_ONLY_NOTE = "ROCE is not used for banks, lenders and insurers, so this stock is judged on ROE alone and the best result is Moderate.";

export const isRoeOnly = (industry: string | null | undefined): boolean => !!industry && ROE_ONLY.test(industry);

export type Fetched = { preview: Preview; fetchedAt: string };
export type Skipped = { symbol: string; name: string; reason: string };

/** One Yahoo preview as a stock of the built sector. */
export function toStock(p: Preview): Stock {
  const s = { ...p.stock, notes: [...p.stock.notes] };
  if (isRoeOnly(p.yahooIndustry)) {
    s.roceNa = true;
    s.roce = null;
    s.roceHistory = null;
    s.notes.push(ROE_ONLY_NOTE);
  }
  return s;
}

/**
 * The built sector. Stocks keep the list's order (largest market cap first). `taken` is the names already used by
 * tabs, so a built sector never shares a name with another one.
 */
export function buildSector(list: SectorList, fetched: Fetched[], skipped: Skipped[], taken: string[]): Sector {
  const byTicker = new Map(fetched.map((f) => [f.preview.ticker, f]));
  const ordered = list.stocks.map((s) => byTicker.get(s.symbol)).filter((f): f is Fetched => !!f);
  const seen = new Set<string>();
  const stocks: Stock[] = [];
  for (const f of ordered) {
    const s = toStock(f.preview);
    if (seen.has(s.symbol)) continue;
    seen.add(s.symbol);
    stocks.push(s);
  }
  const name = taken.includes(list.name) ? `${list.name} (Yahoo)` : list.name;
  const times = ordered.map((f) => f.fetchedAt).sort();
  return {
    name,
    title: name,
    stocks,
    built: {
      kind: list.kind,
      yahooName: list.name,
      parentSector: list.sector,
      total: list.total,
      listsFetchedAt: null,
      oldest: times[0] ?? null,
      skipped,
    },
  };
}
