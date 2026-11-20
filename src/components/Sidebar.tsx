"use client";

import { useId, useState } from "react";
import { ALL_STOCKS, OVERVIEW, SECTORS, hashForTab } from "@/lib/route";
import { norm } from "@/lib/sectorMatch";

export type SidebarItem = { name: string; n: number };

const link = (active: boolean) =>
  `flex min-h-11 items-center gap-2 rounded-lg border-l-[3px] px-2.5 py-1.5 text-sm hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-accent lg:min-h-9 ${
    active ? "border-accent bg-surface2 font-semibold" : "border-transparent"
  }`;
const group = "px-2.5 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-muted";
const MAX_MATCHES = 6;

/**
 * The menu down the left of every page. It stays the same length however many sectors the site holds: the four fixed
 * pages, the sectors this visitor pinned, the sectors most recently built from Yahoo, and a link to the Sectors page, which
 * lists the rest. The filter box looks through every sector, so any of them is one step away. Every entry is a real link,
 * shows how many stocks it holds, and the current page is marked. `onNavigate` lets the caller close a phone drawer.
 */
export default function Sidebar({
  label,
  active,
  total,
  all,
  pinned,
  recent,
  onNavigate,
}: {
  label: string;
  active: string;
  /** Stocks on the site, each counted once. */
  total: number;
  /** Every sector, for the count, the filter box and the link to the Sectors page. */
  all: SidebarItem[];
  pinned: SidebarItem[];
  recent: SidebarItem[];
  onNavigate?: () => void;
}) {
  const [filter, setFilter] = useState("");
  const filterId = useId();
  const tokens = norm(filter).split(" ").filter(Boolean);
  const matches = tokens.length ? all.filter((s) => tokens.every((t) => norm(s.name).includes(t))) : [];

  const item = (name: string, n?: number, tab: string = name) => (
    <li key={name}>
      <a href={hashForTab(tab)} aria-current={active === tab ? "page" : undefined} onClick={onNavigate} className={link(active === tab)}>
        <span className="min-w-0 flex-1 truncate">{name}</span>
        {n != null && <span className="num text-xs font-normal text-muted">{n}</span>}
      </a>
    </li>
  );

  return (
    <nav aria-label={label} className="flex flex-col">
      <a href={hashForTab(OVERVIEW)} onClick={onNavigate} className="mb-1 flex min-h-11 items-center rounded-lg px-2.5 text-[15px] font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-accent lg:min-h-9">
        Stock Analysis
      </a>
      <ul className="space-y-0.5">
        {item(OVERVIEW)}
        {item(ALL_STOCKS, total)}
        {item(SECTORS, all.length)}
      </ul>

      <h2 className={group}>{tokens.length ? "Matching sectors" : "Pinned sectors"}</h2>
      <div className="px-1 pb-2">
        <label className="sr-only" htmlFor={filterId}>
          Filter sectors
        </label>
        <input
          id={filterId}
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter sectors"
          autoComplete="off"
          className="min-h-11 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent lg:min-h-0"
        />
      </div>

      {tokens.length ? (
        <>
          <ul className="space-y-0.5">{matches.slice(0, MAX_MATCHES).map((s) => item(s.name, s.n))}</ul>
          {matches.length === 0 && <p className="px-2.5 py-1 text-xs text-muted">No sector matches.</p>}
          {matches.length > MAX_MATCHES && (
            <p className="px-2.5 py-1 text-xs text-muted">
              {MAX_MATCHES} of {matches.length} shown. Narrow the words, or{" "}
              <a href={hashForTab(SECTORS)} onClick={onNavigate} className="font-medium text-accent hover:underline">
                see all sectors
              </a>
              .
            </p>
          )}
        </>
      ) : (
        <>
          <ul className="space-y-0.5">{pinned.map((s) => item(s.name, s.n))}</ul>
          {pinned.length === 0 && <p className="px-2.5 py-1 text-xs text-muted">Pin a sector on the Sectors page to keep it here.</p>}

          {recent.length > 0 && (
            <>
              <h2 className={group}>Recently built</h2>
              <ul className="space-y-0.5">{recent.map((s) => item(s.name, s.n))}</ul>
            </>
          )}
        </>
      )}

      <a
        href={hashForTab(SECTORS)}
        onClick={onNavigate}
        className="mt-2 flex min-h-11 items-center rounded-lg px-2.5 py-1.5 text-[13px] font-semibold underline underline-offset-2 hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-accent lg:min-h-9"
      >
        All sectors ({all.length}) →
      </a>
    </nav>
  );
}
