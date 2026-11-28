"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { searchSite, type SiteSector, type SiteStock } from "@/lib/siteSearch";
import { WATCH_MAX } from "@/lib/watchlist";
import { useAuth } from "./AuthProvider";
import { Star } from "./WatchButton";

type Option =
  | { kind: "sector"; sector: SiteSector }
  | { kind: "stock"; stock: SiteStock }
  | { kind: "lookup"; query: string };

const tag = "rounded-full border border-line px-1.5 py-px text-[10px] font-medium uppercase tracking-wider text-muted";
const heading = "px-4 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wider text-muted";

/**
 * The search box at the top of every page. It finds a sector or a stock on the site by name or ticker as you type, and
 * opening a result takes you to that page. When no stock fits, it offers to look the company up on Yahoo Finance instead.
 * Press "/" anywhere on the page to jump to it.
 */
export default function GlobalSearch({
  sectors,
  stocks,
  onOpenSector,
  onOpenStock,
  onLookup,
  watched,
  watchFull,
  onToggleWatch,
}: {
  sectors: SiteSector[];
  stocks: SiteStock[];
  onOpenSector: (name: string) => void;
  onOpenStock: (stock: SiteStock) => void;
  onLookup: (query: string) => void;
  /** Tickers being watched. */
  watched: Set<string>;
  /** True when no more stocks can be watched. */
  watchFull: boolean;
  /** Watches or stops watching a stock; says what happened. */
  onToggleWatch: (stock: SiteStock) => "added" | "removed" | "full";
}) {
  const id = useId();
  const listId = `${id}-list`;
  const auth = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [note, setNote] = useState("");

  const q = value.trim();
  const hits = useMemo(() => searchSite(q, sectors, stocks), [q, sectors, stocks]);
  const options: Option[] = useMemo(() => {
    const out: Option[] = [...hits.sectors.map((sector) => ({ kind: "sector" as const, sector })), ...hits.stocks.map((stock) => ({ kind: "stock" as const, stock }))];
    if (q.length >= 2 && hits.stocks.length === 0) out.push({ kind: "lookup", query: q });
    return out;
  }, [hits, q]);
  const showing = open && q.length > 0;

  // "/" jumps to the box, unless the person is already typing somewhere.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = () => {
    setOpen(false);
    setActive(-1);
  };
  const choose = (o: Option) => {
    setValue("");
    close();
    input.current?.blur();
    if (o.kind === "sector") onOpenSector(o.sector.name);
    else if (o.kind === "stock") onOpenStock(o.stock);
    else onLookup(o.query);
  };

  // The star on a result, or Shift+Enter on the highlighted stock, watches it without leaving the search.
  const toggleWatch = (stock: SiteStock, anchor?: HTMLElement | null) => {
    if (auth.status === "loading") return;
    const where = anchor ?? input.current;
    if (!auth.user) {
      if (where) auth.ask(where, "watch a stock"); // a guest's star asks them to sign in; nothing is saved
      return;
    }
    const r = onToggleWatch(stock);
    setNote(r === "added" ? `Now watching ${stock.name}.` : r === "removed" ? `Stopped watching ${stock.name}.` : `You can watch ${WATCH_MAX} stocks. Stop watching one to add another.`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (options.length === 0) return;
      e.preventDefault();
      setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (a < 0 ? (step === 1 ? 0 : options.length - 1) : (a + step + options.length) % options.length));
    } else if (e.key === "Enter") {
      const o = options[active >= 0 ? active : 0];
      if (e.shiftKey) {
        if (o?.kind === "stock" && showing) {
          e.preventDefault();
          toggleWatch(o.stock);
        }
      } else if (o && showing) {
        e.preventDefault();
        choose(o);
      }
    } else if (e.key === "Escape") {
      if (showing) close();
      else setValue("");
    }
  };

  const row = (o: Option, i: number) => {
    const on = i === active;
    return (
      <li
        key={`${o.kind}-${o.kind === "sector" ? o.sector.name : o.kind === "stock" ? o.stock.symbol : "lookup"}`}
        id={`${id}-opt-${i}`}
        role="option"
        aria-selected={on}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => choose(o)}
        onMouseMove={() => setActive(i)}
        className={`flex cursor-pointer items-center gap-2 px-4 py-2 text-sm ${on ? "bg-surface2" : ""}`}
      >
        {o.kind === "sector" && (
          <>
            <span className="font-semibold">{o.sector.name}</span>
            {o.sector.built && <span className={tag}>From Yahoo</span>}
            <span className="num ml-auto text-xs text-muted">{o.sector.n} stocks · open the sector</span>
          </>
        )}
        {o.kind === "stock" && (
          <>
            <span className="font-medium">{o.stock.name}</span>
            <span className="num text-xs text-muted">{o.stock.symbol}</span>
            <span className="ml-auto flex items-center gap-1.5 text-xs text-muted">
              {o.stock.sector}
              {o.stock.built && <span className={tag}>From Yahoo</span>}
              {watched.has(o.stock.symbol) && <span className="sr-only">, watching</span>}
            </span>
            {/* A mouse shortcut for Shift+Enter: the keyboard and screen reader route is the key, so this stays out of the tab order. */}
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              disabled={watchFull && !watched.has(o.stock.symbol)}
              title={!auth.user ? "Sign in to watch" : watched.has(o.stock.symbol) ? "Stop watching" : "Watch for notifications"}
              onClick={(e) => {
                e.stopPropagation();
                toggleWatch(o.stock, e.currentTarget);
              }}
              className={`-my-1 flex size-9 shrink-0 items-center justify-center rounded-lg hover:bg-surface ${watched.has(o.stock.symbol) ? "text-accent" : "text-muted"} disabled:opacity-50`}
            >
              <Star filled={watched.has(o.stock.symbol)} />
            </button>
          </>
        )}
        {o.kind === "lookup" && (
          <span>
            Look up <span className="font-semibold">“{o.query}”</span> on Yahoo Finance
          </span>
        )}
      </li>
    );
  };

  const first = options.findIndex((o) => o.kind === "stock");
  const lookupAt = options.findIndex((o) => o.kind === "lookup");

  return (
    <div
      ref={wrap}
      className="relative"
      onBlur={(e) => {
        if (!wrap.current?.contains(e.relatedTarget as Node | null)) close();
      }}
    >
      <div role="search" className="flex items-center gap-2.5 rounded-full border border-line bg-surface px-4 shadow-sm focus-within:outline-2 focus-within:outline-accent">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" className="shrink-0 text-muted">
          <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
          <path d="M13 13l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-label="Search stocks and sectors"
          aria-expanded={showing}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showing && active >= 0 ? `${id}-opt-${active}` : undefined}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setNote("");
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search stocks and sectors"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none! placeholder:text-muted"
        />
        <kbd aria-hidden="true" className="hidden rounded-md border border-line px-1.5 text-[11px] text-muted sm:block">
          /
        </kbd>
      </div>

      <div role="status" className="sr-only">
        {note || (showing ? (options.filter((o) => o.kind !== "lookup").length === 0 ? "No match on this site." : `${options.filter((o) => o.kind !== "lookup").length} results.`) : "")}
      </div>

      {showing && (
        <div className="absolute inset-x-0 top-full z-30 mt-2 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-lg">
          {hits.sectors.length + hits.stocks.length === 0 && <p className="px-4 py-3 text-sm text-muted">Nothing on this site matches “{q}”.</p>}
          <ul id={listId} role="listbox" aria-label="Search results">
            {hits.sectors.length > 0 && (
              <li role="presentation">
                <div className={heading}>Sectors</div>
                <ul role="presentation">{options.slice(0, hits.sectors.length).map((o, i) => row(o, i))}</ul>
              </li>
            )}
            {hits.stocks.length > 0 && (
              <li role="presentation">
                <div className={heading}>Stocks</div>
                <ul role="presentation">{options.slice(first, first + hits.stocks.length).map((o, i) => row(o, first + i))}</ul>
              </li>
            )}
            {lookupAt >= 0 && (
              <li role="presentation" className="border-t border-line">
                <ul role="presentation">{row(options[lookupAt], lookupAt)}</ul>
              </li>
            )}
          </ul>
          <p className="border-t border-line px-4 py-2 text-xs text-muted">Searches the sectors and stocks on this site by name or ticker. Shift+Enter watches the highlighted stock.</p>
        </div>
      )}
    </div>
  );
}
