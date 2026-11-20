/**
 * The notification centre's rules, kept apart from the screen so they can be tested: what a notification is, how long it
 * lives, how it is cleaned, filtered and dismissed. Kept in this browser only (see browserStore).
 *
 * A notification goes away when it is opened. One that is never opened stays for 24 hours, or 7 days for a merger or
 * acquisition headline (they are only checked weekly). Nothing here makes notifications yet: the alerts that do are added
 * in later steps, and call `addNotices`.
 */

export type NoticeKind = "price" | "roe" | "roce" | "mna";

export type Notice = {
  /** Stable for the same event, so the same alert is not added twice. */
  id: string;
  kind: NoticeKind;
  symbol: string;
  name: string;
  /** One line saying what happened, e.g. "ROE 18.2% → 23.5% (+5.3 points) after the latest results". */
  detail: string;
  /** Optional second line, e.g. "Screen verdict changed: Skip → Consider". */
  extra?: string;
  /** When it was made (ms since 1970). */
  at: number;
  /** A news item behind it, opened in a new tab. Only http and https links are kept. */
  source?: { name: string; url: string };
};

/** localStorage key. */
export const NOTICE_KEY = "stock-analysis:notifications:v1";
export const NOTICE_HOURS = 24;
export const MNA_DAYS = 7;
/** Most notifications kept; the oldest go first. */
export const NOTICE_MAX = 100;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const KINDS: NoticeKind[] = ["price", "roe", "roce", "mna"];
export const KIND_LABEL: Record<NoticeKind, string> = { price: "Price", roe: "ROE", roce: "ROCE", mna: "M&A" };

/** How long a notification of this kind stays if it is never opened. */
export const lifetimeMs = (kind: NoticeKind): number => (kind === "mna" ? MNA_DAYS * DAY : NOTICE_HOURS * HOUR);
export const expiresAt = (n: Pick<Notice, "kind" | "at">): number => n.at + lifetimeMs(n.kind);

/**
 * "21h left", "45 min left", "6d left". Hours and days round up, so a notification made three hours ago says 21h and not 20h
 * a moment later. One past its time says "expired" (it is removed on the next clean-up).
 */
export function timeLeft(n: Pick<Notice, "kind" | "at">, now: number): string {
  const ms = expiresAt(n) - now;
  if (ms <= 0) return "expired";
  if (ms < HOUR) return `${Math.max(1, Math.ceil(ms / 60000))} min left`;
  if (ms < 48 * HOUR) return `${Math.ceil(ms / HOUR)}h left`;
  return `${Math.ceil(ms / DAY)}d left`;
}

const cleanText = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ");
  return t ? t.slice(0, max) : null;
};

function cleanSource(v: unknown): Notice["source"] {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const name = cleanText(o.name, 80);
  if (!name || typeof o.url !== "string" || o.url.length > 2000) return undefined;
  try {
    const u = new URL(o.url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return undefined;
    return { name, url: u.toString() };
  } catch {
    return undefined;
  }
}

/**
 * Cleans a list (from storage, or newly made): drops malformed items, repeats of an id and anything past its time, pulls a
 * time in the future back to now, and returns the newest first, at most NOTICE_MAX. Safe to call on untrusted input.
 */
export function pruneNotices(list: unknown, now: number): Notice[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: Notice[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = cleanText(o.id, 200);
    const symbol = cleanText(o.symbol, 32);
    const name = cleanText(o.name, 100);
    const detail = cleanText(o.detail, 300);
    const kind = o.kind as NoticeKind;
    if (!id || !symbol || !name || !detail || !KINDS.includes(kind) || seen.has(id)) continue;
    if (typeof o.at !== "number" || !Number.isFinite(o.at)) continue;
    const n: Notice = { id, kind, symbol, name, detail, at: Math.min(o.at, now) };
    const extra = cleanText(o.extra, 200);
    if (extra) n.extra = extra;
    const source = cleanSource(o.source);
    if (source) n.source = source;
    if (now >= expiresAt(n)) continue;
    seen.add(id);
    out.push(n);
  }
  out.sort((a, b) => b.at - a.at);
  return out.slice(0, NOTICE_MAX);
}

/** Adds new notifications to the list. One whose id is already there is not added again. */
export function addNotices(list: Notice[], incoming: Notice[], now: number): Notice[] {
  const have = new Set(list.map((n) => n.id));
  return pruneNotices([...incoming.filter((n) => !have.has(n.id)), ...list], now);
}

/** Opening a notification removes it. */
export const dismissNotice = (list: Notice[], id: string): Notice[] => list.filter((n) => n.id !== id);

export type NoticeFilter = "all" | "price" | "fundamentals" | "mna";
export const FILTERS: { key: NoticeFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "price", label: "Price" },
  { key: "fundamentals", label: "ROE / ROCE" },
  { key: "mna", label: "M&A" },
];

const inFilter = (n: Notice, f: NoticeFilter): boolean =>
  f === "all" || (f === "price" && n.kind === "price") || (f === "mna" && n.kind === "mna") || (f === "fundamentals" && (n.kind === "roe" || n.kind === "roce"));

export const filterNotices = (list: Notice[], f: NoticeFilter): Notice[] => list.filter((n) => inFilter(n, f));

export function countByFilter(list: Notice[]): Record<NoticeFilter, number> {
  return {
    all: list.length,
    price: filterNotices(list, "price").length,
    fundamentals: filterNotices(list, "fundamentals").length,
    mna: filterNotices(list, "mna").length,
  };
}

/**
 * What a watcher is told about. `live` is false until that alert is built, so the screen never promises one that does not exist yet.
 */
export const ALERT_RULES: { kind: NoticeKind | "fundamentals"; text: string; live: boolean }[] = [
  { kind: "price", text: "Price up or down 5% or more over 5 days", live: false },
  { kind: "fundamentals", text: "ROE or ROCE up or down 5 points or more", live: false },
  { kind: "mna", text: "A headline about a merger or acquisition (checked weekly)", live: false },
];
