"use client";

import { useId, useMemo, useState } from "react";
import type { Stock } from "@/lib/types";
import {
  DEFAULT_SORT,
  GROUPS,
  GROUP_LABEL,
  NO_FILTERS,
  PAGE_SIZE,
  SORT_LABELS,
  STEP_ARROW,
  TRENDS,
  against,
  countGroups,
  filterItems,
  groupOf,
  isFiltered,
  sectionsForPage,
  sortGrouped,
  stepsLabel,
  trendSteps,
  type Filters,
  type SortKey,
  type Step,
  type TrendFilter,
  type VerdictFilter,
} from "@/lib/sectorPage";
import { paginate } from "@/lib/sectorsPage";
import { ConsistencyBadge } from "./Badges";
import GroupMark from "./GroupMark";
import Pager from "./Pager";
import WatchButton from "./WatchButton";
import { fmtPct } from "./format";
import type { Row } from "./StockTable";

const COLS = 7;
const control = "min-h-11 rounded-lg border border-line bg-surface px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent lg:min-h-9";
const chip = (on: boolean) =>
  `inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm focus-visible:outline-2 focus-visible:outline-accent lg:min-h-9 ${on ? "border-primary bg-primary font-semibold text-on-primary" : "border-line bg-surface hover:bg-surface2"}`;
const th = "px-4 py-2.5 text-left text-xs font-medium text-muted";
const STEP_COLOUR: Record<Step, string> = { up: "var(--good)", down: "var(--bad)", flat: "var(--muted)", none: "var(--muted)" };

/** Three arrows, one for each year's rise or fall, in the order the years happened. The words are given to screen readers. */
function Arrows({ history }: { history: Stock["profitHistory"] }) {
  const steps = trendSteps(history);
  return (
    <span role="img" aria-label={stepsLabel(steps)} className="inline-flex gap-1.5 font-semibold">
      {steps.map((s, i) => (
        <span key={i} aria-hidden="true" style={{ color: STEP_COLOUR[s] }}>
          {STEP_ARROW[s]}
        </span>
      ))}
    </span>
  );
}

/**
 * The stocks of one sector as a table in four groups (Strong, Moderate, Near cut-off, Skip), each with a heading that says how
 * many stocks it holds and what it means, so no chart is needed to see how the sector fared. Filter by group and by profit trend,
 * sort inside the groups, and page through 25 rows at a time. A row opens that stock. The filters belong to the sector shown;
 * the parent gives each sector its own copy (a `key`) so they start fresh.
 */
export default function SectorStocks({
  name,
  rows,
  selected,
  watched,
  watchFull,
  onPick,
  onToggleWatch,
}: {
  name: string;
  rows: Row[];
  selected: string | null;
  watched: Set<string>;
  watchFull: boolean;
  onPick: (symbol: string) => void;
  onToggleWatch: (stock: Stock) => void;
}) {
  const ids = { trend: useId(), sort: useId() };
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT);
  const [pageAsked, setPageAsked] = useState(1);

  const counts = useMemo(() => countGroups(rows, filters.trend), [rows, filters.trend]);
  const hasUnrated = useMemo(() => rows.some((r) => groupOf(r) === "na"), [rows]);
  const grouped = useMemo(() => sortGrouped(filterItems(rows, filters), sort), [rows, filters, sort]);
  const pg = paginate(grouped.length, pageAsked, PAGE_SIZE);
  const sections = sectionsForPage(grouped, pg.start, pg.end);
  const filtered = isFiltered(filters);

  const change = (f: Partial<Filters>) => {
    setFilters((p) => ({ ...p, ...f }));
    setPageAsked(1);
  };
  const chips: { key: VerdictFilter; label: string }[] = [
    { key: "all", label: "All" },
    ...GROUPS.filter((g) => g.key !== "na" || hasUnrated).map((g) => ({ key: g.key as VerdictFilter, label: g.label })),
  ];

  return (
    <section aria-label={`${name} stocks`} className="mt-6">
      <h2 className="mb-3 text-xl font-semibold tracking-tight">{name} stocks</h2>

      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-2.5">
        <div role="group" aria-label="Screen result" className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <button key={c.key} type="button" aria-pressed={filters.verdict === c.key} onClick={() => change({ verdict: c.key })} className={chip(filters.verdict === c.key)}>
              {c.key !== "all" && <GroupMark group={c.key} />}
              {c.label}
              <span className="num opacity-80">{counts[c.key]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:ml-auto">
          <label htmlFor={ids.trend} className="flex items-center gap-2 text-sm text-muted">
            Profit trend
            <select id={ids.trend} value={filters.trend} onChange={(e) => change({ trend: e.target.value as TrendFilter })} className={control}>
              <option value="any">Any</option>
              {TRENDS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor={ids.sort} className="flex items-center gap-2 text-sm text-muted">
            Sort
            <select id={ids.sort} value={sort} onChange={(e) => (setSort(e.target.value as SortKey), setPageAsked(1))} className={control}>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          {filtered && (
            <button type="button" onClick={() => (setFilters(NO_FILTERS), setPageAsked(1))} className="min-h-11 rounded-lg px-2 text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent lg:min-h-9">
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <caption className="sr-only">
              {name} stocks in groups by screen result. Each group has a heading with its count. Sorted by {SORT_LABELS[sort].toLowerCase()} inside each group.
            </caption>
            <thead className="bg-surface2">
              <tr>
                <th scope="col" className={`${th} w-16 px-2 text-center`}>
                  Watch
                </th>
                <th scope="col" className={th}>
                  Stock
                </th>
                <th scope="col" className={th}>
                  ROE
                </th>
                <th scope="col" className={th}>
                  Against benchmark
                </th>
                <th scope="col" className={th}>
                  ROCE
                </th>
                <th scope="col" className={th}>
                  Profit, last 4 years
                </th>
                <th scope="col" className={th}>
                  Verdict
                </th>
              </tr>
            </thead>
            {sections.map((sec) => {
              const g = GROUPS.find((x) => x.key === sec.key)!;
              return (
                <tbody key={`${sec.key}-${sec.continued}`}>
                  <tr>
                    <th scope="rowgroup" colSpan={COLS} className="border-y border-line bg-surface2 px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted">
                      <span className="inline-flex items-center gap-2">
                        <GroupMark group={sec.key} />
                        <span>
                          {g.label} · {sec.total}
                          {sec.continued ? " (continued)" : ""} · {g.meaning}
                        </span>
                      </span>
                    </th>
                  </tr>
                  {sec.rows.map((r) => {
                    const s = r.stock;
                    const text = against(r);
                    const margin = r.margin ?? 0;
                    return (
                      <tr
                        key={s.symbol}
                        onClick={(e) => {
                          if (!(e.target as HTMLElement).closest("a, button")) onPick(s.symbol);
                        }}
                        className={`cursor-pointer border-t border-line first:border-t-0 ${selected === s.symbol ? "bg-surface2" : "hover:bg-surface2"}`}
                      >
                        <td className="px-2 py-1 text-center">
                          <WatchButton name={s.name} watching={watched.has(s.symbol)} full={watchFull} onToggle={() => onToggleWatch(s)} />
                        </td>
                        <td className="px-4 py-2.5">
                          <button type="button" onClick={() => onPick(s.symbol)} className="min-h-11 text-left font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent lg:min-h-0">
                            {s.name}
                          </button>
                          <div className="text-[11px] text-muted">
                            {s.symbol}
                            {watched.has(s.symbol) ? " · Watching" : ""}
                          </div>
                        </td>
                        <td className="num px-4 py-2.5">{s.roe == null ? <span className="text-muted">–</span> : fmtPct(s.roe)}</td>
                        <td className="num px-4 py-2.5" style={{ color: r.margin == null || text.startsWith("Below") ? "var(--muted)" : margin > 0 ? "var(--good)" : margin < 0 ? "var(--bad)" : "var(--muted)" }}>
                          {text}
                        </td>
                        <td className="num px-4 py-2.5">{s.roceNa ? <span className="text-muted">Not used</span> : s.roce == null ? <span className="text-muted">–</span> : fmtPct(s.roce)}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                            <Arrows history={s.profitHistory} />
                            <ConsistencyBadge c={r.consistency} />
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-2">
                            <GroupMark group={sec.key} />
                            {GROUP_LABEL[sec.key]}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
            {sections.length === 0 && (
              <tbody>
                <tr>
                  <td colSpan={COLS} className="px-4 py-10 text-center text-muted">
                    {rows.length === 0 ? "This sector has no stocks yet." : "No stocks match these filters."}
                    {filtered && (
                      <>
                        {" "}
                        <button type="button" onClick={() => (setFilters(NO_FILTERS), setPageAsked(1))} className="font-medium text-accent hover:underline">
                          Clear filters
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              </tbody>
            )}
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line bg-surface2 px-4 py-3 text-sm">
          <p aria-live="polite" className="text-muted">
            {pg.total === 0 ? "No stocks to show" : `Showing ${pg.from}–${pg.to} of ${pg.total}`}
            {filtered && rows.length !== pg.total ? ` (${rows.length} in the sector)` : ""}
          </p>
          <div className="sm:ml-auto">
            <Pager pg={pg} label={`Pages of ${name} stocks`} onPage={setPageAsked} />
          </div>
        </div>
      </div>

      <p className="mt-2 text-xs text-muted lg:hidden">Scroll the table sideways to see every column.</p>
      <p className="mt-2 text-xs text-muted">
        Open a row for that stock: price, market cap and P/E, ROE and ROCE history, profit by year, data notes and its recent news. The arrows are the latest
        year-on-year moves in annual profit, oldest first (↑ rose, ↓ fell, → unchanged, – unknown).
      </p>
    </section>
  );
}
