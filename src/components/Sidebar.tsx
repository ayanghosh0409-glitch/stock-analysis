"use client";

import { useId, useState } from "react";
import { ALL_STOCKS, OVERVIEW, hashForTab } from "@/lib/route";
import { norm } from "@/lib/sectorMatch";

export type SidebarItem = { name: string; n: number };

const link = (active: boolean) =>
  `flex min-h-9 items-center gap-2 rounded-lg border-l-[3px] px-2.5 py-1.5 text-sm hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-accent ${
    active ? "border-accent bg-surface2 font-semibold" : "border-transparent"
  }`;
const group = "px-2.5 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-muted";

/**
 * The menu down the left of every page: the Overview, the table of all stocks, then every sector, listed ones first and
 * the ones built from Yahoo after. Every entry is a real link to that page's address, shows how many stocks it holds, and
 * the current page is marked. `onNavigate` lets the caller close a phone drawer after a choice.
 */
export default function Sidebar({
  label,
  active,
  total,
  listed,
  built,
  onNavigate,
}: {
  label: string;
  active: string;
  total: number;
  listed: SidebarItem[];
  built: SidebarItem[];
  onNavigate?: () => void;
}) {
  const [filter, setFilter] = useState("");
  const filterId = useId();
  const tokens = norm(filter).split(" ").filter(Boolean);
  const keep = (items: SidebarItem[]) => (tokens.length ? items.filter((i) => tokens.every((t) => norm(i.name).includes(t))) : items);
  const l = keep(listed);
  const b = keep(built);

  const item = (name: string, n?: number) => (
    <li key={name}>
      <a href={hashForTab(name)} aria-current={active === name ? "page" : undefined} onClick={onNavigate} className={link(active === name)}>
        <span className="min-w-0 flex-1 truncate">{name}</span>
        {n != null && <span className="num text-xs font-normal text-muted">{n}</span>}
      </a>
    </li>
  );

  return (
    <nav aria-label={label} className="flex flex-col">
      <a href={hashForTab(OVERVIEW)} onClick={onNavigate} className="rounded-lg px-2.5 pb-3 pt-1 text-[15px] font-bold tracking-tight">
        Stock Analysis
      </a>
      <ul className="space-y-0.5">
        {item(OVERVIEW)}
        {item(ALL_STOCKS, total)}
      </ul>

      <h2 className={group}>Listed sectors</h2>
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
          className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent"
        />
      </div>
      <ul className="space-y-0.5">{l.map((s) => item(s.name, s.n))}</ul>
      {l.length === 0 && <p className="px-2.5 py-1 text-xs text-muted">No listed sector matches.</p>}

      {built.length > 0 && (
        <>
          <h2 className={group}>Built from Yahoo</h2>
          <ul className="space-y-0.5">{b.map((s) => item(s.name, s.n))}</ul>
          {b.length === 0 && <p className="px-2.5 py-1 text-xs text-muted">No built sector matches.</p>}
        </>
      )}
    </nav>
  );
}
