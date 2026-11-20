"use client";

import { useId, useState, type CSSProperties } from "react";
import { hashForTab } from "@/lib/route";
import {
  NO_FILTERS,
  PAGE_SIZES,
  SORT_LABELS,
  barLabel,
  countBySource,
  countsText,
  filterSectors,
  fmtDay,
  isFiltered,
  pageNumbers,
  paginate,
  sortSectors,
  type Buckets,
  type Filters,
  type GradeFilter,
  type SectorRow,
  type SortKey,
  type SourceFilter,
} from "@/lib/sectorsPage";
import { MAX_PINS } from "@/lib/pins";
import { PeerBadge } from "./Badges";
import { fmtPct } from "./format";

/**
 * Each part of the bar is told apart by more than colour: Strong is solid green, Moderate is striped green, Near cut-off
 * is solid amber and Skip is pale grey, and the counts are written beside it.
 */
const STRIPES = "repeating-linear-gradient(45deg, var(--surface) 0 2px, transparent 2px 5px)";
const DOTS = "repeating-linear-gradient(90deg, var(--surface) 0 2px, transparent 2px 4px)";
const SEGMENTS: { key: keyof Buckets; label: string; style: CSSProperties }[] = [
  { key: "strong", label: "Strong", style: { background: "var(--good)" } },
  { key: "moderate", label: "Moderate", style: { background: "var(--good)", backgroundImage: STRIPES } },
  { key: "near", label: "Near cut-off", style: { background: "var(--warn)" } },
  { key: "skip", label: "Skip", style: { background: "var(--grey-bg)", boxShadow: "inset 0 0 0 1px var(--line)" } },
  { key: "na", label: "Not rated", style: { background: "var(--muted)", backgroundImage: DOTS } },
];

function ScreenBar({ name, b }: { name: string; b: Buckets }) {
  return (
    <div>
      <div role="img" aria-label={barLabel(name, b)} className="flex h-2.5 gap-0.5 overflow-hidden rounded-full border border-line bg-surface">
        {SEGMENTS.filter((s) => b[s.key] > 0).map((s) => (
          <span key={s.key} style={{ ...s.style, flex: `${b[s.key]} 1 0` }} />
        ))}
      </div>
      {/* The same numbers in words, so the bar is never the only way to read them. The bar's own label already says them aloud. */}
      <p aria-hidden="true" className="mt-1 text-xs text-muted">
        {countsText(b)}
      </p>
    </div>
  );
}

const control = "min-h-11 rounded-lg border border-line bg-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-accent lg:min-h-9";
const chip = (on: boolean) =>
  `min-h-11 rounded-full border px-3.5 text-sm lg:min-h-9 ${on ? "border-primary bg-primary font-semibold text-on-primary" : "border-line bg-surface hover:bg-surface2"}`;
const th = "px-4 py-2.5 text-left text-xs font-medium text-muted";

/**
 * The one page that lists every sector, so the sidebar and the Overview never have to. A table with a search box, source
 * chips, a peer-set filter, a sort and paging; each row shows the screen results as a bar, so a sector can be judged
 * without opening it. Pinning a sector here puts it in the sidebar.
 */
export default function SectorsPage({
  rows,
  pinned,
  onTogglePin,
  onOpen,
  loading,
}: {
  rows: SectorRow[];
  pinned: string[];
  onTogglePin: (name: string) => void;
  /** Opens a sector when its row is clicked (the name in the row is also a real link, for the keyboard). */
  onOpen: (name: string) => void;
  /** True until the sectors other visitors built have arrived, so a short list is not mistaken for the whole list. */
  loading: boolean;
}) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<SortKey>("pass");
  const [size, setSize] = useState<number>(PAGE_SIZES[0]);
  const [pageAsked, setPageAsked] = useState(1);
  const ids = { find: useId(), peer: useId(), sort: useId(), size: useId() };

  const counts = countBySource(rows);
  const filtered = filterSectors(rows, filters);
  const sorted = sortSectors(filtered, sort);
  const pg = paginate(sorted.length, pageAsked, size);
  const shown = sorted.slice(pg.start, pg.end);
  const pinnedSet = new Set(pinned);
  const full = pinned.length >= MAX_PINS;

  // A change to the search or a filter starts again from the first page.
  const change = (f: Partial<Filters>) => {
    setFilters((p) => ({ ...p, ...f }));
    setPageAsked(1);
  };

  const sourceChips: [SourceFilter, string, number][] = [
    ["all", "All", counts.all],
    ["listed", "Listed", counts.listed],
    ["built", "Built from Yahoo", counts.built],
  ];

  return (
    <>
      <h1 className="text-2xl sm:text-3xl">Sectors</h1>
      <p className="mb-4 mt-1 max-w-3xl text-sm text-muted">
        {counts.all} sector{counts.all === 1 ? "" : "s"}: {counts.listed} listed and {counts.built} built from Yahoo by visitors. Open one to see its stocks, or pin up
        to {MAX_PINS} to keep them in the sidebar.
      </p>
      {loading && (
        <p role="status" className="mb-3 text-sm text-muted">
          Loading the sectors other visitors built…
        </p>
      )}

      <section aria-label="Find and filter sectors" className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2.5">
        <label htmlFor={ids.find} className="sr-only">
          Find a sector
        </label>
        <input
          id={ids.find}
          type="search"
          value={filters.q}
          onChange={(e) => change({ q: e.target.value })}
          placeholder="Find a sector"
          autoComplete="off"
          className={`${control} w-full rounded-full px-4 sm:w-64`}
        />
        <div role="group" aria-label="Source" className="flex flex-wrap gap-2">
          {sourceChips.map(([k, l, n]) => (
            <button key={k} type="button" aria-pressed={filters.source === k} onClick={() => change({ source: k })} className={chip(filters.source === k)}>
              {l} <span className="num">{n}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 sm:ml-auto">
          <label htmlFor={ids.peer} className="flex items-center gap-2 text-sm text-muted">
            Peer set
            <select id={ids.peer} value={filters.grade} onChange={(e) => change({ grade: e.target.value as GradeFilter })} className={`${control} text-ink`}>
              <option value="any">Any</option>
              <option value="Good">Good</option>
              <option value="Fair">Fair</option>
              <option value="Weak">Weak</option>
            </select>
          </label>
          <label htmlFor={ids.sort} className="flex items-center gap-2 text-sm text-muted">
            Sort
            <select
              id={ids.sort}
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as SortKey);
                setPageAsked(1);
              }}
              className={`${control} text-ink`}
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {isFiltered(filters) && (
        <p className="mb-2 text-sm text-muted">
          {sorted.length} of {rows.length} match.{" "}
          <button type="button" onClick={() => change(NO_FILTERS)} className="font-medium text-accent hover:underline">
            Clear filters
          </button>
        </p>
      )}

      <p className="mb-1 text-xs text-muted sm:hidden">Scroll the table sideways to see every column.</p>
      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <caption className="sr-only">Sectors, with how many of their stocks pass the screen. Select a row to open the sector.</caption>
            <thead className="border-b border-line bg-surface2">
              <tr>
                <th scope="col" className={th}>
                  Sector
                </th>
                <th scope="col" className={`${th} text-right`}>
                  Stocks
                </th>
                <th scope="col" className={`${th} w-[26%]`}>
                  Screen results
                </th>
                <th scope="col" className={`${th} text-right`}>
                  Median ROE
                </th>
                <th scope="col" className={`${th} text-right`}>
                  Pass
                </th>
                <th scope="col" className={th}>
                  Peer set
                </th>
                <th scope="col" className={`${th} text-center`}>
                  Pin
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const on = pinnedSet.has(r.name);
                const passN = r.strong + r.moderate;
                const day = fmtDay(r.builtOn);
                return (
                  <tr
                    key={r.name}
                    onClick={(e) => {
                      if (!(e.target as HTMLElement).closest("a,button")) onOpen(r.name);
                    }}
                    className="cursor-pointer border-b border-line last:border-b-0 hover:bg-surface2"
                  >
                    <td className="px-4 py-3">
                      <a href={hashForTab(r.name)} className="text-[15px] font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-accent">
                        {r.name}
                      </a>
                      <div className="text-xs text-muted">{r.built ? `Built from Yahoo${day ? ` · ${day}` : ""}` : "Listed"}</div>
                    </td>
                    <td className="num px-4 py-3 text-right">{r.n}</td>
                    <td className="px-4 py-3">
                      <ScreenBar name={r.name} b={r} />
                    </td>
                    <td className="num px-4 py-3 text-right">{fmtPct(r.medianRoe)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="num font-semibold">{Math.round(r.passShare * 100)}%</span>
                      <div className="num text-xs text-muted">
                        {passN} of {r.n}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <PeerBadge health={r.health} />
                    </td>
                    <td className="px-2 py-1 text-center">
                      <button
                        type="button"
                        aria-pressed={on}
                        aria-label={`Pin ${r.name} to the sidebar`}
                        disabled={full && !on}
                        title={full && !on ? `${MAX_PINS} sectors are pinned. Unpin one first.` : on ? "Pinned. Select to unpin." : "Pin to the sidebar"}
                        onClick={() => onTogglePin(r.name)}
                        className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-surface hover:shadow-sm focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
                          <path d="M7 3h6l-1 6 3 3v1.5H5V12l3-3z" />
                          <path d="M10 13.5V18" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted">
                    No sector matches.{" "}
                    <button type="button" onClick={() => change(NO_FILTERS)} className="font-medium text-accent hover:underline">
                      Clear filters
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line bg-surface2 px-4 py-3 text-sm">
          <p aria-live="polite" className="text-muted">
            {pg.total === 0 ? "No sectors to show" : `Showing ${pg.from}–${pg.to} of ${pg.total}`}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:ml-auto">
            <label htmlFor={ids.size} className="flex items-center gap-2 text-muted">
              Rows per page
              <select
                id={ids.size}
                value={size}
                onChange={(e) => {
                  setSize(Number(e.target.value));
                  setPageAsked(1);
                }}
                className={`${control} text-ink`}
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            {pg.pages > 1 && (
              <nav aria-label="Pages of sectors" className="flex items-center gap-1.5">
                <button type="button" aria-label="Previous page" disabled={pg.page === 1} onClick={() => setPageAsked(pg.page - 1)} className={`${control} min-w-11 disabled:opacity-40`}>
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
                      onClick={() => setPageAsked(n)}
                      className={`num min-h-11 min-w-11 rounded-lg border text-sm lg:min-h-9 lg:min-w-9 ${n === pg.page ? "border-primary bg-primary font-semibold text-on-primary" : "border-line bg-surface hover:bg-surface2"}`}
                    >
                      {n}
                    </button>
                  ),
                )}
                <button type="button" aria-label="Next page" disabled={pg.page === pg.pages} onClick={() => setPageAsked(pg.page + 1)} className={`${control} min-w-11 disabled:opacity-40`}>
                  ›
                </button>
              </nav>
            )}
          </div>
        </div>
      </div>

      <ul aria-label="Key to the screen results bar" className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted">
        {SEGMENTS.slice(0, 4).map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-2.5 w-6 rounded-sm" style={s.style} />
            {s.label}
          </li>
        ))}
      </ul>
      <p className="mt-2 max-w-3xl text-xs text-muted">
        Pass is Strong plus Moderate, as a share of the sector&apos;s stocks. Near cut-off is a Skip that missed the ROE cut-off by 2 points or less. Median ROE is the
        industry ROE the screen uses for that sector. Peer set grades how far the sector&apos;s profitable stocks can stand in for the industry (Good, Fair or Weak);
        hover the grade for the reason. Sectors built from Yahoo show the day they were built.
      </p>
    </>
  );
}
