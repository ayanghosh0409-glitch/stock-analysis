"use client";

import { useEffect, useRef, useState } from "react";
import type { EnteredMap, Field } from "@/lib/figures";
import type { Benchmarks } from "@/lib/screen";
import type { Candidate, Preview } from "@/lib/yahoo";
import PreviewCard from "./PreviewCard";

type State =
  | { s: "idle" }
  | { s: "searching" }
  | { s: "choose"; results: Candidate[] }
  | { s: "loading"; name: string; results: Candidate[] }
  | { s: "preview"; preview: Preview; results: Candidate[]; shared: Shared }
  | { s: "error"; message: string; retry: () => void };

/** Figures other visitors entered for this company. `configured` is false until the site has a database. */
export type Shared = { configured: boolean; entered: EnteredMap };

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : "Something went wrong. Try again.");
  return body as T;
}

const btn = "rounded-full border border-line bg-surface px-3 py-1 text-xs hover:bg-surface2";

/**
 * Shown when a search matches nothing on the list. It offers to look the company up on Yahoo Finance, lets the person
 * choose between the NSE and BSE companies that match, then shows the preview. Remounted for every new search text
 * (the parent keys it), so each search starts from the first step.
 */
export default function LookupPanel({
  query,
  known,
  total,
  sectors,
  benchFor,
  onShowExisting,
}: {
  query: string;
  known: Set<string>;
  total: number;
  sectors: string[];
  benchFor: (sector: string) => Benchmarks | null;
  onShowExisting: (symbol: string) => void;
}) {
  const [st, setSt] = useState<State>({ s: "idle" });
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => () => ctrl.current?.abort(), []);

  const begin = () => {
    ctrl.current?.abort();
    ctrl.current = new AbortController();
    return ctrl.current.signal;
  };

  const search = async () => {
    const signal = begin();
    setSt({ s: "searching" });
    try {
      const { results } = await getJson<{ results: Candidate[] }>(`/api/lookup?q=${encodeURIComponent(query)}`, signal);
      setSt({ s: "choose", results });
    } catch (e) {
      if (signal.aborted) return;
      setSt({ s: "error", message: e instanceof Error ? e.message : "Something went wrong.", retry: search });
    }
  };

  const open = async (c: Candidate, results: Candidate[]) => {
    const signal = begin();
    setSt({ s: "loading", name: c.name, results });
    try {
      const { preview } = await getJson<{ preview: Preview }>(`/api/stock?ticker=${encodeURIComponent(c.ticker)}`, signal);
      // Visitors' figures are a bonus: if they cannot be fetched the preview still shows, just without them.
      const shared = await getJson<Shared>(`/api/figures?ticker=${encodeURIComponent(preview.ticker)}`, signal).catch((): Shared => ({ configured: false, entered: {} }));
      if (signal.aborted) return;
      setSt({ s: "preview", preview, results, shared });
    } catch (e) {
      if (signal.aborted) return;
      setSt({ s: "error", message: e instanceof Error ? e.message : "Something went wrong.", retry: () => open(c, results) });
    }
  };

  /** Sends one figure to the shared database. Resolves to an error message, or null when it was saved. */
  const saveFigure = async (field: Field, percent: number): Promise<string | null> => {
    if (st.s !== "preview") return "Something went wrong. Try again.";
    const ticker = st.preview.ticker;
    try {
      const res = await fetch("/api/figures", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticker, field, percent }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return typeof body?.error === "string" ? body.error : "Could not save that. Try again.";
      setSt((cur) => (cur.s === "preview" && cur.preview.ticker === ticker ? { ...cur, shared: { configured: true, entered: body.entered ?? {} } } : cur));
      return null;
    } catch {
      return "Could not reach the site. Check your connection and try again.";
    }
  };

  if (st.s === "preview") {
    return (
      <PreviewCard
        preview={st.preview}
        shared={st.shared}
        onSave={saveFigure}
        sectors={sectors}
        benchFor={benchFor}
        onBack={st.results.length > 1 ? () => setSt({ s: "choose", results: st.results }) : undefined}
      />
    );
  }

  return (
    <section aria-label="Look up a company" className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <h3 className="text-base font-semibold tracking-tight">“{query}” is not on the list</h3>
      <p className="mt-1 text-sm text-muted">
        The list holds {total} hand-picked stocks. You can look a company up on Yahoo Finance (NSE and BSE) and see what the screen makes of it. Nothing is saved.
      </p>

      <div className="mt-4" role="status" aria-live="polite">
        {st.s === "idle" && (
          <button type="button" onClick={search} className="rounded-full border border-primary bg-primary px-4 py-1.5 text-sm font-semibold text-on-primary">
            Look up “{query}” on Yahoo Finance
          </button>
        )}
        {st.s === "searching" && <p className="text-sm text-muted">Searching Yahoo Finance…</p>}
        {st.s === "loading" && <p className="text-sm text-muted">Fetching the figures for {st.name}. This can take a few seconds…</p>}
        {st.s === "error" && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm" style={{ color: "var(--bad)" }}>
              {st.message}
            </p>
            <button type="button" onClick={st.retry} className={btn}>
              Try again
            </button>
          </div>
        )}
        {st.s === "choose" &&
          (st.results.length === 0 ? (
            <p className="text-sm text-muted">Yahoo Finance found no NSE or BSE company for “{query}”. Try the full company name or its exact symbol.</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {st.results.map((c) => {
                const base = c.ticker.replace(/\.(NS|BO)$/, "");
                const listed = known.has(base);
                return (
                  <li key={c.ticker} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0">
                      <span className="font-medium">{c.name}</span>
                      <span className="block text-xs text-muted">
                        {c.ticker} · {c.exchange}
                      </span>
                    </span>
                    {listed ? (
                      <button type="button" onClick={() => onShowExisting(base)} className={btn}>
                        Already on the list · show it
                      </button>
                    ) : (
                      <button type="button" onClick={() => open(c, st.results)} className={btn}>
                        Preview
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          ))}
      </div>
    </section>
  );
}
