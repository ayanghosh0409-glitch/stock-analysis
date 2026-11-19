"use client";

import { useEffect, useRef, useState } from "react";
import { buildSector, type Fetched, type Skipped } from "@/lib/builtSector";
import type { SectorList } from "@/lib/sectorLists";
import type { ListSummary } from "@/lib/sectorMatch";
import type { Sector } from "@/lib/types";
import type { Preview } from "@/lib/yahoo";

type Found = { status: "found"; list: SectorList; fetchedAt: string | null };
type Choose = { status: "choose"; options: ListSummary[] };
type None = { status: "none"; suggestions: ListSummary[]; sectors: string[] };
type Unavailable = { status: "unavailable" };
type Answer = Found | Choose | None | Unavailable;

type State =
  | { s: "idle"; note?: string }
  | { s: "searching" }
  | { s: "choose"; q: string; options: ListSummary[] }
  | { s: "none"; q: string; suggestions: ListSummary[]; sectors: string[] }
  | { s: "building"; name: string; done: number; total: number }
  | { s: "unavailable" }
  | { s: "error"; message: string };

const CONCURRENCY = 3;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : "Something went wrong. Try again.");
  return body as T;
}

/** One company's figures. A rate limit or a Yahoo hiccup gets one more try a few seconds later. */
async function fetchOne(ticker: string, signal: AbortSignal): Promise<Fetched> {
  const go = async () => {
    const r = await getJson<{ preview: Preview; fetchedAt: string }>(`/api/stock?ticker=${encodeURIComponent(ticker)}`, signal);
    return { preview: r.preview, fetchedAt: r.fetchedAt };
  };
  try {
    return await go();
  } catch (e) {
    if (signal.aborted) throw e;
    const m = e instanceof Error ? e.message : "";
    if (!/Too many|did not respond/.test(m)) throw e;
    await wait(4000);
    return go();
  }
}

const chip = "rounded-full border border-line bg-surface px-3 py-1 text-xs hover:bg-surface2";

/**
 * "Build a sector from Yahoo Finance": the person names a sector or industry, the site checks it against the stored
 * lists (no Yahoo call), offers a choice or the nearest names when needed, then fetches the ten largest companies and
 * hands the built sector to the dashboard, which screens it exactly like a listed one.
 */
export default function SectorBuilder({
  taken,
  onBuilt,
  onExisting,
}: {
  taken: string[];
  onBuilt: (s: Sector) => void;
  /** Shows a sector that is already shared and fresh, and says so by returning true: nothing needs fetching then. */
  onExisting: (yahooName: string) => boolean;
}) {
  const [text, setText] = useState("");
  const [st, setSt] = useState<State>({ s: "idle" });
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => () => ctrl.current?.abort(), []);

  const begin = () => {
    ctrl.current?.abort();
    ctrl.current = new AbortController();
    return ctrl.current.signal;
  };

  const build = async (list: SectorList, listsFetchedAt: string | null, signal: AbortSignal) => {
    const total = list.stocks.length;
    const got: Fetched[] = [];
    const skipped: Skipped[] = [];
    let next = 0;
    let done = 0;
    setSt({ s: "building", name: list.name, done, total });
    const worker = async () => {
      while (next < total && !signal.aborted) {
        const stock = list.stocks[next++];
        try {
          got.push(await fetchOne(stock.symbol, signal));
        } catch (e) {
          if (signal.aborted) return;
          skipped.push({ symbol: stock.symbol, name: stock.name, reason: e instanceof Error ? e.message : "Could not be fetched." });
        }
        done++;
        if (!signal.aborted) setSt({ s: "building", name: list.name, done, total });
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
    if (signal.aborted) return;
    if (got.length === 0) {
      setSt({ s: "error", message: `None of the ${total} companies in ${list.name} could be fetched from Yahoo Finance just now. Try again in a minute.` });
      return;
    }
    const sector = buildSector(list, got, skipped, taken);
    sector.built!.listsFetchedAt = listsFetchedAt;
    setSt({ s: "idle", note: `Built ${sector.name} from ${got.length} compan${got.length === 1 ? "y" : "ies"}.` });
    onBuilt(sector);
  };

  const find = async (q: string) => {
    const query = q.trim();
    if (query.length < 2) {
      setSt({ s: "error", message: "Type at least 2 characters of a sector or industry, for example banks." });
      return;
    }
    const signal = begin();
    setSt({ s: "searching" });
    try {
      const a = await getJson<Answer>(`/api/sector?q=${encodeURIComponent(query)}`, signal);
      if (signal.aborted) return;
      if (a.status === "found") {
        if (onExisting(a.list.name)) setSt({ s: "idle", note: `${a.list.name} is already shared with every visitor, so it is shown as it is.` });
        else await build(a.list, a.fetchedAt, signal);
      }
      else if (a.status === "choose") setSt({ s: "choose", q: query, options: a.options });
      else if (a.status === "none") setSt({ s: "none", q: query, suggestions: a.suggestions, sectors: a.sectors });
      else setSt({ s: "unavailable" });
    } catch (e) {
      if (signal.aborted) return;
      setSt({ s: "error", message: e instanceof Error ? e.message : "Something went wrong. Try again." });
    }
  };

  const pick = (name: string) => {
    setText(name);
    void find(name);
  };

  const busy = st.s === "searching" || st.s === "building";

  return (
    <section aria-label="Build a sector" className="mb-5 rounded-xl border border-line bg-surface p-4 shadow-sm">
      <h2 className="text-base font-semibold tracking-tight">Build a sector from Yahoo Finance</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        Type a sector or industry, for example banks, pharma or real estate. The ten largest NSE companies in it are fetched and
        screened with the same rules as the listed sectors, and the sector is then kept for every visitor to see.
      </p>
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void find(text);
        }}
      >
        <label htmlFor="sector-search" className="sr-only">
          Sector or industry
        </label>
        <input
          id="sector-search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={40}
          placeholder="Sector or industry"
          autoComplete="off"
          className="w-full max-w-xs rounded-full border border-line bg-surface px-4 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary sm:w-72"
        />
        <button type="submit" disabled={busy} className="rounded-full border border-primary bg-primary px-4 py-1.5 text-sm font-semibold text-on-primary disabled:opacity-60">
          {busy ? "Working…" : "Build sector"}
        </button>
      </form>

      <div role="status" aria-live="polite" className="mt-3 text-sm">
        {st.s === "searching" && <span className="text-muted">Checking the sector…</span>}
        {st.s === "building" && (
          <span className="text-muted">
            Fetching {st.name} from Yahoo Finance: {st.done} of {st.total} companies done.
          </span>
        )}
        {st.s === "idle" && st.note && <span className="text-muted">{st.note}</span>}
        {st.s === "unavailable" && <span className="text-muted">The sector lists have not been fetched yet. They are refreshed every Monday.</span>}
        {st.s === "choose" && (
          <div>
            <p className="mb-2 text-muted">&ldquo;{st.q}&rdquo; matches more than one. Pick one:</p>
            <div className="flex flex-wrap gap-2">
              {st.options.map((o) => (
                <button key={o.name} type="button" onClick={() => pick(o.name)} className={chip}>
                  {o.name} <span className="text-muted">({o.total})</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {st.s === "none" && (
          <div>
            <p className="mb-2 text-muted">
              {st.suggestions.length > 0
                ? <>No sector or industry called &ldquo;{st.q}&rdquo;. Did you mean:</>
                : <>No sector or industry called &ldquo;{st.q}&rdquo;, and nothing close. Yahoo&apos;s sectors are:</>}
            </p>
            <div className="flex flex-wrap gap-2">
              {(st.suggestions.length > 0 ? st.suggestions.map((o) => o.name) : st.sectors).map((n) => (
                <button key={n} type="button" onClick={() => pick(n)} className={chip}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {st.s === "error" && (
        <p role="alert" className="mt-3 text-sm" style={{ color: "var(--bad)" }}>
          {st.message}
        </p>
      )}
    </section>
  );
}
