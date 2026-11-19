import { norm } from "./sectorMatch";

/**
 * The plain search box at the top of every page: finds sectors and stocks that are on the site by what they are called.
 * It matches spelling, not meaning ("lenders" will not find a bank), and it covers only what is already on the page:
 * the listed sectors, and the sectors built from Yahoo.
 */

export type SiteSector = { name: string; n: number; built: boolean };
export type SiteStock = { name: string; symbol: string; sector: string; built: boolean };

export type SectorHit = SiteSector;
export type StockHit = SiteStock;
export type SiteHits = { sectors: SectorHit[]; stocks: StockHit[] };

export const MAX_SECTORS = 4;
export const MAX_STOCKS = 8;

// How well a name matches, best first. A match is every typed word starting a word of the name, or sitting inside it.
const EXACT = 0;
const STARTS = 1; // the name (or ticker) begins with what was typed
const WORDS = 2; // every typed word begins some word of the name
const INSIDE = 3; // every typed word is somewhere in the name

/** Tickers are written with or without the exchange ending (TCS, TCS.NS); the ending is ignored. */
const bare = (s: string) => s.replace(/\.(ns|bo)$/i, "");

function rank(query: string, tokens: string[], target: string): number | null {
  const t = norm(target);
  if (!t) return null;
  if (t === query) return EXACT;
  if (t.startsWith(query)) return STARTS;
  const words = t.split(" ");
  if (tokens.every((tok) => words.some((w) => w.startsWith(tok)))) return WORDS;
  if (tokens.every((tok) => t.includes(tok))) return INSIDE;
  return null;
}

/** The best of a company's name and ticker. */
function rankStock(query: string, tokens: string[], s: SiteStock): number | null {
  const a = rank(query, tokens, s.name);
  const b = rank(query, tokens, bare(s.symbol));
  if (a == null) return b;
  if (b == null) return a;
  return Math.min(a, b);
}

/**
 * Sectors and stocks whose names fit what was typed, best match first. A company that sits in two sectors appears once,
 * under the first sector it was given in, so give the listed sectors before the built ones.
 */
export function searchSite(raw: string, sectors: SiteSector[], stocks: SiteStock[], limits = { sectors: MAX_SECTORS, stocks: MAX_STOCKS }): SiteHits {
  const query = norm(bare(raw.trim()));
  if (!query) return { sectors: [], stocks: [] };
  const tokens = query.split(" ");

  const sectorHits = sectors
    .map((s) => ({ s, r: rank(query, tokens, s.name) }))
    .filter((x): x is { s: SiteSector; r: number } => x.r != null)
    .sort((a, b) => a.r - b.r || a.s.name.localeCompare(b.s.name))
    .slice(0, limits.sectors)
    .map((x) => x.s);

  const seen = new Set<string>();
  const unique = stocks.filter((s) => (seen.has(s.symbol) ? false : (seen.add(s.symbol), true)));
  const stockHits = unique
    .map((s) => ({ s, r: rankStock(query, tokens, s) }))
    .filter((x): x is { s: SiteStock; r: number } => x.r != null)
    .sort((a, b) => a.r - b.r || a.s.name.localeCompare(b.s.name))
    .slice(0, limits.stocks)
    .map((x) => x.s);

  return { sectors: sectorHits, stocks: stockHits };
}
