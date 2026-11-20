"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Verdict } from "@/lib/screen";
import {
  ALERT_RULES,
  FILTERS,
  KIND_LABEL,
  MNA_DAYS,
  NOTICE_HOURS,
  countByFilter,
  filterNotices,
  timeLeft,
  type Notice,
  type NoticeFilter,
} from "@/lib/notifications";
import { WATCH_MAX, type WatchEntry } from "@/lib/watchlist";

/** What the page knows about a stock on the site, by ticker. A watched stock that has left the site has no entry. */
export type WatchInfo = Record<string, { name: string; sector: string; verdict: Verdict }>;

const MARK: Record<Verdict, { label: string; color: string }> = {
  "CONSIDER – Strong": { label: "Strong", color: "var(--good)" },
  "CONSIDER – Moderate": { label: "Moderate", color: "var(--warn)" },
  SKIP: { label: "Skip", color: "var(--bad)" },
  "n/a": { label: "Not rated", color: "var(--muted)" },
};

/** Drawn, not typed, so it looks the same on every device: full circle Strong, half circle Moderate, empty circle Skip, a dash when not rated. */
function Shape({ v }: { v: Verdict }) {
  const { color } = MARK[v];
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" className="shrink-0">
      {v === "n/a" ? (
        <path d="M2.5 6h7" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      ) : (
        <>
          <circle cx="6" cy="6" r="4.6" fill={v === "CONSIDER – Strong" ? color : "none"} stroke={color} strokeWidth="1.5" />
          {v === "CONSIDER – Moderate" && <path d="M6 1.4a4.6 4.6 0 0 0 0 9.2z" fill={color} />}
        </>
      )}
    </svg>
  );
}

/** The screen's verdict as a small shape, so it does not rely on colour. */
function VerdictMark({ v }: { v: Verdict | undefined }) {
  if (!v) return null;
  return (
    <span role="img" aria-label={`Verdict: ${MARK[v].label}`} title={MARK[v].label} className="inline-flex">
      <Shape v={v} />
    </span>
  );
}

function Legend() {
  return (
    <span aria-hidden="true" className="flex items-center gap-2.5 text-xs text-muted">
      {(["CONSIDER – Strong", "CONSIDER – Moderate", "SKIP"] as const).map((v) => (
        <span key={v} className="inline-flex items-center gap-1">
          <Shape v={v} />
          {MARK[v].label}
        </span>
      ))}
    </span>
  );
}

const lifeText = `${NOTICE_HOURS} hours (${MNA_DAYS} days for M&A)`;
const small = "text-xs text-muted";
const ghost = "rounded-lg px-2.5 text-sm font-medium text-accent hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-accent min-h-11 lg:min-h-9";

/**
 * The bell in the header and the panel it opens: the notifications waiting, and the stocks being watched. A notification
 * goes away once it is opened (`onOpenNotice` goes to the stock and removes it; opening its news link removes it through
 * `onDismiss`), or when its time runs out. Opening the panel does not remove
 * anything. Escape or a click outside closes it.
 */
export default function NotificationCenter({
  notices,
  now,
  watch,
  info,
  onOpenNotice,
  onDismiss,
  onOpenStock,
  onClear,
  onUnwatch,
}: {
  notices: Notice[];
  now: number;
  watch: WatchEntry[];
  info: WatchInfo;
  onOpenNotice: (n: Notice) => void;
  onDismiss: (id: string) => void;
  onOpenStock: (symbol: string) => void;
  onClear: () => void;
  onUnwatch: (symbol: string) => void;
}) {
  const id = useId();
  const panelId = `${id}-panel`;
  const wrap = useRef<HTMLDivElement>(null);
  const bell = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"notices" | "watching">("notices");
  const [filter, setFilter] = useState<NoticeFilter>("all");

  const counts = countByFilter(notices);
  const shown = filterNotices(notices, filter);
  const waiting = notices.length;

  const close = (refocus: boolean) => {
    setOpen(false);
    setView("notices");
    if (refocus) bell.current?.focus();
  };

  // Escape and a click outside close the panel; focus goes to its heading when it opens or changes view.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setView("notices");
        bell.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) {
        setOpen(false);
        setView("notices");
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);
  useEffect(() => {
    if (open) heading.current?.focus();
  }, [open, view]);

  const openNotice = (n: Notice) => {
    close(false);
    onOpenNotice(n);
  };
  const openStock = (symbol: string) => {
    close(false);
    onOpenStock(symbol);
  };

  const chip = (on: boolean) =>
    `inline-flex min-h-11 items-center rounded-full border px-3 text-xs lg:min-h-8 ${on ? "border-primary bg-primary text-on-primary font-semibold" : "border-line bg-surface hover:bg-surface2"}`;

  return (
    <div ref={wrap} className="relative">
      <button
        ref={bell}
        type="button"
        aria-label={waiting > 0 ? `Notifications, ${waiting} waiting` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
        className="relative flex size-11 items-center justify-center rounded-full border border-line bg-surface shadow-sm hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-accent lg:size-10"
      >
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20">
          <path
            d="M10 2.5a5 5 0 0 0-5 5c0 3.2-1.2 4.4-2 5.3h14c-.8-.9-2-2.1-2-5.3a5 5 0 0 0-5-5zM8 15.5a2 2 0 0 0 4 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {waiting > 0 && (
          <span aria-hidden="true" className="num absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-on-primary">
            {waiting > 9 ? "9+" : waiting}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={view === "notices" ? "Notifications" : "Watchlist"}
          className="fixed inset-x-3 top-16 z-40 flex max-h-[calc(100dvh-5rem)] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-xl lg:absolute lg:inset-x-auto lg:right-0 lg:top-full lg:mt-2 lg:max-h-[75vh] lg:w-96"
        >
          {view === "notices" ? (
            <>
              <div className="flex items-center gap-2 px-4 pt-3">
                <h2 ref={heading} tabIndex={-1} className="mr-auto text-base font-semibold outline-none!">
                  Notifications
                </h2>
                {waiting > 0 && (
                  <button type="button" onClick={onClear} className={ghost}>
                    Clear all
                  </button>
                )}
                <button type="button" aria-label="Close notifications" onClick={() => close(true)} className="flex size-11 items-center justify-center rounded-lg text-xl hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-accent lg:size-9">
                  <span aria-hidden="true">×</span>
                </button>
              </div>

              {waiting > 0 && (
                <div role="group" aria-label="Kind of notification" className="flex flex-wrap gap-1.5 px-4 pt-2">
                  {FILTERS.map((f) => (
                    <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} className={chip(filter === f.key)}>
                      {f.label}
                      <span className="num ml-1 opacity-80">{counts[f.key]}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="min-h-0 flex-1 overflow-y-auto">
                {waiting === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p aria-hidden="true" className="text-2xl text-muted">
                      ✓
                    </p>
                    <p className="mt-1 text-sm font-semibold">{watch.length === 0 ? "You are not watching any stocks yet" : "You are all caught up"}</p>
                    <p className={`mx-auto mt-1 max-w-xs ${small}`}>
                      {watch.length === 0
                        ? "Click the star beside a stock to watch it. Notifications about the stocks you watch show up here."
                        : `Nothing new on the stocks you watch. A new notification stays for ${lifeText}.`}
                    </p>
                  </div>
                ) : (
                  <>
                    <p className={`px-4 pb-1 pt-2 ${small}`}>Each one goes away when you open it, or after {lifeText}.</p>
                    {shown.length === 0 ? (
                      <p className="px-4 py-6 text-center text-sm text-muted">No notifications of this kind.</p>
                    ) : (
                      <ul>
                        {shown.map((n) => {
                          const v = info[n.symbol]?.verdict;
                          return (
                            <li key={n.id} className="border-t border-line first:border-t-0">
                              <button type="button" onClick={() => openNotice(n)} className="block w-full px-4 py-3 text-left hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-accent">
                                <span className="flex items-center gap-2">
                                  <span className="rounded border border-line px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-muted">{KIND_LABEL[n.kind]}</span>
                                  <span className="min-w-0 truncate text-sm font-semibold">{n.name}</span>
                                  <VerdictMark v={v} />
                                  <span className="num ml-auto shrink-0 text-xs text-muted">{timeLeft(n, now)}</span>
                                </span>
                                <span className="mt-1 block text-sm">{n.detail}</span>
                                {n.extra && <span className="mt-0.5 block text-sm text-muted">{n.extra}</span>}
                              </button>
                              {n.source && (
                                <a
                                  href={n.source.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={() => window.setTimeout(() => onDismiss(n.id), 0)}
                                  className="mb-3 ml-4 inline-flex min-h-9 items-center text-xs font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                                >
                                  {n.source.name} ↗<span className="sr-only"> (opens in a new tab)</span>
                                </a>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-3 border-t border-line px-4 py-1">
                <span className="num text-sm">Watching {watch.length} stock{watch.length === 1 ? "" : "s"}</span>
                <button type="button" onClick={() => setView("watching")} className={ghost}>
                  Manage
                </button>
                {waiting > 0 && (
                  <span className="ml-auto">
                    <Legend />
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1 px-2 pt-3">
                <button type="button" aria-label="Back to notifications" onClick={() => setView("notices")} className="flex size-11 items-center justify-center rounded-lg text-xl hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-accent lg:size-9">
                  <span aria-hidden="true">‹</span>
                </button>
                <h2 ref={heading} tabIndex={-1} className="mr-auto text-base font-semibold outline-none!">
                  Watching {watch.length} stock{watch.length === 1 ? "" : "s"}
                </h2>
                <button type="button" aria-label="Close notifications" onClick={() => close(true)} className="flex size-11 items-center justify-center rounded-lg text-xl hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-accent lg:size-9">
                  <span aria-hidden="true">×</span>
                </button>
              </div>
              <p className={`px-4 pb-1 ${small}`}>You are notified about these stocks only (up to {WATCH_MAX}).</p>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {watch.length === 0 ? (
                  <p className="px-4 py-5 text-sm text-muted">Nothing watched yet.</p>
                ) : (
                  <ul>
                    {watch.map((w) => {
                      const i = info[w.symbol];
                      return (
                        <li key={w.symbol} className="flex items-center gap-1 border-t border-line pl-4 pr-1 first:border-t-0">
                          <span aria-hidden="true" className="text-accent">
                            ★
                          </span>
                          {i ? (
                            <button type="button" onClick={() => openStock(w.symbol)} className="min-h-11 min-w-0 flex-1 px-2 text-left hover:underline focus-visible:outline-2 focus-visible:outline-accent lg:min-h-10">
                              <span className="block truncate text-sm font-semibold text-accent">{w.name}</span>
                              <span className={`block truncate ${small}`}>{i.sector}</span>
                            </button>
                          ) : (
                            <span className="min-w-0 flex-1 px-2 py-2">
                              <span className="block truncate text-sm font-semibold">{w.name}</span>
                              <span className={`block ${small}`}>Not on this site now</span>
                            </span>
                          )}
                          <VerdictMark v={i?.verdict} />
                          <button
                            type="button"
                            aria-label={`Stop watching ${w.name}`}
                            onClick={() => onUnwatch(w.symbol)}
                            className="flex size-11 items-center justify-center rounded-lg text-lg text-muted hover:bg-surface2 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent lg:size-9"
                          >
                            <span aria-hidden="true">×</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <p className={`px-4 pb-1 pt-3 ${small}`}>To add a stock, click the star beside it in a table, in its details or in a search result.</p>

                <h3 className="px-4 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wider text-muted">What you will be notified about</h3>
                <ul className="space-y-1 px-4 pb-3 text-sm">
                  {ALERT_RULES.map((r) => (
                    <li key={r.kind} className="flex flex-wrap items-baseline gap-x-2">
                      <span>{r.text}</span>
                      {!r.live && <span className="rounded border border-line px-1.5 py-px text-[10px] font-medium uppercase tracking-wider text-muted">Not switched on yet</span>}
                    </li>
                  ))}
                </ul>
                <p className={`px-4 pb-3 ${small}`}>A notification goes away when you open it, or after {lifeText}.</p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
