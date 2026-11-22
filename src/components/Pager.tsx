"use client";

import { pageNumbers, type Page } from "@/lib/sectorsPage";

const btn = "min-h-11 rounded-lg border text-sm focus-visible:outline-2 focus-visible:outline-accent lg:min-h-9";

/** Previous, numbered and next buttons for a paged table. Draws nothing when everything fits on one page. */
export default function Pager({ pg, label, onPage }: { pg: Page; label: string; onPage: (page: number) => void }) {
  if (pg.pages <= 1) return null;
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <button type="button" aria-label="Previous page" disabled={pg.page === 1} onClick={() => onPage(pg.page - 1)} className={`${btn} min-w-11 border-line bg-surface px-3 disabled:opacity-40`}>
        ‹
      </button>
      {pageNumbers(pg.page, pg.pages).map((n, i) =>
        n === "…" ? (
          <span key={`gap${i}`} aria-hidden="true" className="px-1 text-muted">
            …
          </span>
        ) : (
          <button
            key={n}
            type="button"
            aria-label={`Page ${n}`}
            aria-current={n === pg.page ? "page" : undefined}
            onClick={() => onPage(n)}
            className={`${btn} num min-w-11 lg:min-w-9 ${n === pg.page ? "border-primary bg-primary font-semibold text-on-primary" : "border-line bg-surface hover:bg-surface2"}`}
          >
            {n}
          </button>
        ),
      )}
      <button type="button" aria-label="Next page" disabled={pg.page === pg.pages} onClick={() => onPage(pg.page + 1)} className={`${btn} min-w-11 border-line bg-surface px-3 disabled:opacity-40`}>
        ›
      </button>
    </nav>
  );
}
