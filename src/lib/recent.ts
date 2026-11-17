export type RecentSearch = { q: string; at: number };

/** How long a search is remembered. An entry exactly this old is still kept. */
export const RECENT_DAYS = 7;
/** Most searches kept, newest first. */
export const RECENT_MAX = 8;
/** Shorter searches are not worth remembering. */
export const RECENT_MIN_LENGTH = 2;
/** localStorage key. Separate from the overrides key so the two never overwrite each other. */
export const RECENT_STORE = "stock-analysis:recent-searches:v1";

const DAY_MS = 24 * 60 * 60 * 1000;

export const normalizeQuery = (q: string): string => q.trim().replace(/\s+/g, " ");

/**
 * Cleans whatever was stored: drops malformed entries, anything older than the retention window and
 * case-insensitive duplicates, then returns the newest RECENT_MAX first. Safe to call on untrusted input.
 */
export function pruneRecent(list: unknown, now: number): RecentSearch[] {
  if (!Array.isArray(list)) return [];
  const oldest = now - RECENT_DAYS * DAY_MS;
  const valid: RecentSearch[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const { q, at } = item as Record<string, unknown>;
    if (typeof q !== "string" || typeof at !== "number" || !Number.isFinite(at)) continue;
    const text = normalizeQuery(q);
    if (text.length < RECENT_MIN_LENGTH || at < oldest) continue;
    // A timestamp in the future (clock change, edited storage) must not outlive the window.
    valid.push({ q: text, at: Math.min(at, now) });
  }
  valid.sort((a, b) => b.at - a.at); // stable, so on a tie the entry listed first stays first
  const seen = new Set<string>();
  const out: RecentSearch[] = [];
  for (const r of valid) {
    const key = r.q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out.slice(0, RECENT_MAX);
}

/** Records a search at the top. Repeating one (any letter case) moves it up rather than adding a copy. */
export function addRecent(list: unknown, q: string, now: number): RecentSearch[] {
  const text = normalizeQuery(q);
  const current = pruneRecent(list, now);
  if (text.length < RECENT_MIN_LENGTH) return current;
  return pruneRecent([{ q: text, at: now }, ...current], now);
}

/** What the dropdown shows: everything while the box is empty, otherwise the entries that contain the typed text. */
export function suggestRecent(list: RecentSearch[], typed: string): RecentSearch[] {
  const t = normalizeQuery(typed).toLowerCase();
  if (!t) return list;
  return list.filter((r) => {
    const k = r.q.toLowerCase();
    return k !== t && k.includes(t);
  });
}
