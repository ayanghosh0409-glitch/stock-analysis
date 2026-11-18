import aliasData from "../../data/stock-aliases.json";
import type { Verdict } from "@/lib/screen";
import { formatFetched, formatNewsDate, tagStocks, type SectorNews } from "@/lib/news";

const ALIASES = aliasData as Record<string, string[]>;

const dot: Record<Verdict, string> = {
  "CONSIDER – Strong": "var(--good)",
  "CONSIDER – Moderate": "var(--warn)",
  SKIP: "var(--bad)",
  "n/a": "var(--muted)",
};

export type NewsStock = { symbol: string; name: string; verdict: Verdict };

/** Latest headlines for one sector, each tagged with the sector's stocks it names. */
export default function NewsPanel({
  sector,
  news,
  fetchedAt,
  windowDays,
  stocks,
  onPick,
}: {
  sector: string;
  news: SectorNews | undefined;
  fetchedAt: string | null;
  windowDays: number;
  stocks: NewsStock[];
  onPick: (symbol: string) => void;
}) {
  const items = news?.items ?? [];
  const bySymbol = new Map(stocks.map((s) => [s.symbol, s]));
  const symbols = stocks.map((s) => s.symbol);
  const updated = formatFetched(fetchedAt);

  let empty: string | null = null;
  if (items.length === 0) {
    empty = !fetchedAt
      ? "No headlines yet. The news refresh runs every morning (IST)."
      : news?.status === "ok"
        ? `No headlines found for ${sector} in the last ${windowDays} days.`
        : "The last refresh could not reach the news source, so there are no headlines to show yet.";
  }

  return (
    <section aria-label={`${sector} news`} className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold tracking-tight">Latest news</h3>
          <p className="text-xs text-muted">
            Headlines from the last {windowDays} days{updated ? ` · updated ${updated}` : ""}
          </p>
        </div>
        {news?.status === "stale" && items.length > 0 && (
          <span className="rounded px-2 py-0.5 text-xs font-semibold" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>
            Earlier headlines: latest refresh failed
          </span>
        )}
      </div>

      {empty ? (
        <p className="mt-4 rounded-lg bg-surface2 px-4 py-6 text-center text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {items.map((it) => {
            const tags = tagStocks(it.title, symbols, ALIASES);
            return (
              <li key={it.url} className="py-3">
                <a href={it.url} target="_blank" rel="noopener noreferrer" className="font-medium leading-snug hover:text-accent hover:underline">
                  {it.title}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted">
                  <span>{it.source}</span>
                  <span aria-hidden>·</span>
                  <time dateTime={it.date}>{formatNewsDate(it.date)}</time>
                  {tags.length > 0 ? (
                    tags.map((sym) => {
                      const s = bySymbol.get(sym);
                      if (!s) return null;
                      return (
                        <button
                          key={sym}
                          type="button"
                          onClick={() => onPick(sym)}
                          title={`Open ${s.name} (${s.verdict})`}
                          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface2 px-2 py-0.5 text-ink hover:border-accent"
                        >
                          <span aria-hidden className="inline-block size-1.5 rounded-full" style={{ background: dot[s.verdict] }} />
                          {s.name}
                        </button>
                      );
                    })
                  ) : (
                    <span className="rounded-full px-2 py-0.5" style={{ background: "var(--grey-bg)" }}>
                      Sector-wide
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        Collected automatically from Google News and not reviewed. A stock tag means its name appears in the headline; the dot shows
        its current screen result (green Strong, amber Moderate, red Skip). A tag does not say whether the news is good or bad for the
        stock, so read the story before acting.
      </p>
    </section>
  );
}
