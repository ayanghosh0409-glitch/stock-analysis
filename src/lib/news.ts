/** Shape of data/news.json, written by scripts/refresh_news.py and read here. */
export type NewsItem = {
  title: string;
  url: string;
  source: string;
  /** ISO time in UTC. */
  publishedAt: string;
  /** The Indian (IST) calendar date, yyyy-mm-dd, so every viewer sees the same date. */
  date: string;
};
export type SectorNews = { status: "ok" | "stale" | "error"; items: NewsItem[] };
export type NewsFile = { fetchedAt: string | null; windowDays: number; sectors: Record<string, SectorNews> };

export const EMPTY_NEWS: NewsFile = { fetchedAt: null, windowDays: 7, sectors: {} };

/** Only ordinary web links are ever rendered as links. */
export function safeUrl(u: unknown): string | null {
  if (typeof u !== "string") return null;
  try {
    const p = new URL(u);
    return p.protocol === "https:" || p.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The file is committed by a bot, so treat it as untrusted input: keep what is well formed, drop the rest. */
export function cleanNews(raw: unknown): NewsFile {
  if (!raw || typeof raw !== "object") return EMPTY_NEWS;
  const r = raw as Record<string, unknown>;
  const sectors: Record<string, SectorNews> = {};
  if (r.sectors && typeof r.sectors === "object") {
    for (const [name, v] of Object.entries(r.sectors as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const s = v as Record<string, unknown>;
      const items: NewsItem[] = [];
      for (const it of Array.isArray(s.items) ? s.items : []) {
        if (!it || typeof it !== "object") continue;
        const { title, url, source, publishedAt, date } = it as Record<string, unknown>;
        const link = safeUrl(url);
        if (typeof title !== "string" || !title.trim() || !link) continue;
        if (typeof date !== "string" || !DATE_RE.test(date)) continue;
        items.push({
          title: title.trim().slice(0, 300),
          url: link,
          source: typeof source === "string" && source.trim() ? source.trim().slice(0, 80) : "Unknown source",
          publishedAt: typeof publishedAt === "string" ? publishedAt : "",
          date,
        });
      }
      sectors[name] = { status: s.status === "ok" || s.status === "stale" ? s.status : "error", items };
    }
  }
  return {
    fetchedAt: typeof r.fetchedAt === "string" ? r.fetchedAt : null,
    windowDays: typeof r.windowDays === "number" && r.windowDays > 0 ? r.windowDays : 7,
    sectors,
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-17" -> "17 Nov". Plain string work, so server and browser always agree. */
export function formatNewsDate(date: string): string {
  const m = DATE_RE.test(date) ? date.split("-") : null;
  if (!m) return "";
  const month = MONTHS[Number(m[1]) - 1];
  return month ? `${Number(m[2])} ${month}` : "";
}

/** "18 Nov 2026, 07:30 IST" from an ISO timestamp, independent of the viewer's time zone. */
export function formatFetched(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t + 330 * 60_000);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())} IST`;
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’]/g, "'");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Which of the given stocks a headline names, in the order they appear. A stock is named when one of its
 * aliases (data/stock-aliases.json) appears as whole words, ignoring case and accents. This says only that
 * the company is mentioned; it does not say whether the news is good or bad for it.
 */
export function tagStocks(title: string, symbols: string[], aliases: Record<string, string[]>): string[] {
  const text = fold(title);
  const hits: { symbol: string; at: number }[] = [];
  for (const symbol of symbols) {
    let at = Infinity;
    for (const alias of aliases[symbol] ?? []) {
      const a = fold(alias).trim();
      if (!a) continue;
      const m = new RegExp(`(^|[^a-z0-9])${escapeRe(a)}(?![a-z0-9])`).exec(text);
      if (m) at = Math.min(at, m.index + m[1].length);
    }
    if (at !== Infinity) hits.push({ symbol, at });
  }
  return hits.sort((x, y) => x.at - y.at).map((h) => h.symbol);
}
