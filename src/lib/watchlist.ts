/**
 * The stocks a visitor watches. Kept in this browser only (see browserStore). A stock is identified by its ticker, so a
 * company that sits in two sectors is one entry. Nothing here touches the page or the network.
 */

/** The figures when the stock was added, so a later alert can say what changed. */
export type Seen = { price: number | null; roe: number | null; roce: number | null; at: number };

export type WatchEntry = { symbol: string; name: string; addedAt: number; seen: Seen | null };

/** localStorage key. */
export const WATCH_KEY = "stock-analysis:watchlist:v1";
/** Most stocks watched at once, so the list (and the alerts it will make) stays small enough to read. */
export const WATCH_MAX = 30;

const MAX_SYMBOL = 32;
const MAX_NAME = 100;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function cleanSeen(v: unknown): Seen | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const at = num(o.at);
  if (at == null) return null;
  return { price: num(o.price), roe: num(o.roe), roce: num(o.roce), at };
}

/**
 * Cleans whatever was stored: drops malformed entries and repeats of a ticker, keeps the newest additions first and no more
 * than WATCH_MAX. Safe to call on untrusted input (storage can be edited by hand).
 */
export function parseWatchlist(raw: unknown): WatchEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: WatchEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.symbol !== "string" || typeof o.name !== "string") continue;
    const symbol = o.symbol.trim();
    const name = o.name.trim().slice(0, MAX_NAME);
    const addedAt = num(o.addedAt);
    if (!symbol || symbol.length > MAX_SYMBOL || !name || addedAt == null || seen.has(symbol)) continue;
    seen.add(symbol);
    out.push({ symbol, name, addedAt, seen: cleanSeen(o.seen) });
  }
  out.sort((a, b) => b.addedAt - a.addedAt); // stable: on a tie the entry listed first stays first
  return out.slice(0, WATCH_MAX);
}

export const isWatching = (list: WatchEntry[], symbol: string): boolean => list.some((w) => w.symbol === symbol);

export const isFull = (list: WatchEntry[]): boolean => list.length >= WATCH_MAX;

export type ToggleResult = { list: WatchEntry[]; result: "added" | "removed" | "full" };

/** Adds the stock at the top, or takes it off if it is already watched. A full list refuses a new stock and is returned unchanged. */
export function toggleWatch(
  list: WatchEntry[],
  stock: { symbol: string; name: string; price?: number | null; roe?: number | null; roce?: number | null },
  now: number,
): ToggleResult {
  if (isWatching(list, stock.symbol)) return { list: list.filter((w) => w.symbol !== stock.symbol), result: "removed" };
  if (isFull(list)) return { list, result: "full" };
  const entry: WatchEntry = {
    symbol: stock.symbol,
    name: stock.name,
    addedAt: now,
    seen: { price: num(stock.price), roe: num(stock.roe), roce: num(stock.roce), at: now },
  };
  return { list: [entry, ...list], result: "added" };
}

export const removeWatch = (list: WatchEntry[], symbol: string): WatchEntry[] => list.filter((w) => w.symbol !== symbol);
