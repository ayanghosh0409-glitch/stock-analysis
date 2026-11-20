/**
 * The sidebar keeps a short list of pinned sectors and the most recently built ones, so it stays the same length however
 * many sectors the site holds. Pins are kept in the visitor's own browser, like the watchlist, and nothing else needs them.
 */
export const MAX_PINS = 3;
export const MAX_RECENT = 3;
export const PINS_KEY = "stock-analysis:pins:v1";

type SectorLite = { name: string; n: number; built: boolean };

/** Until someone pins anything: the listed sectors with the most stocks. */
export function defaultPins(sectors: SectorLite[], max = MAX_PINS): string[] {
  return sectors
    .filter((s) => !s.built)
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
    .slice(0, max)
    .map((s) => s.name);
}

/** What is stored, read safely: a list of sector names, or null when nothing usable is there. */
export function parsePins(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) return null;
    return [...new Set(v as string[])];
  } catch {
    return null;
  }
}

/** The pins to show: the stored ones (or the defaults), without sectors that are not on the site, at most `max`. */
export function effectivePins(stored: string[] | null, defaults: string[], existing: ReadonlySet<string>, max = MAX_PINS): string[] {
  return (stored ?? defaults).filter((n) => existing.has(n)).slice(0, max);
}

/**
 * Pins `name`, or unpins it when it is already pinned. Returns the new list to store, or null when the list is full and
 * the sector cannot be added. A stored name that is not on the site (a sector built by someone else that has not loaded yet)
 * is kept, so loading late never loses a pin, unless `canPrune` says the full list of sectors has arrived.
 */
export function togglePin(base: string[], name: string, existing: ReadonlySet<string>, canPrune: boolean, max = MAX_PINS): string[] | null {
  const kept = canPrune ? base.filter((n) => existing.has(n)) : base;
  if (kept.includes(name)) return kept.filter((n) => n !== name);
  if (kept.filter((n) => existing.has(n)).length >= max) return null;
  return [...kept, name];
}

/**
 * The newest visitor-built sectors, newest first. A sector this visitor has just built, which the server has not kept
 * yet, has no build time and counts as the newest.
 */
export function recentlyBuilt(sectors: { name: string; built: boolean; builtAt: string | null }[], max = MAX_RECENT): string[] {
  const time = (s: { builtAt: string | null }) => {
    const t = s.builtAt ? Date.parse(s.builtAt) : Number.NaN;
    return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
  };
  return sectors
    .filter((s) => s.built)
    .sort((a, b) => {
      const x = time(a);
      const y = time(b);
      return x === y ? a.name.localeCompare(b.name) : y > x ? 1 : -1;
    })
    .slice(0, max)
    .map((s) => s.name);
}
