"use client";

import { useCallback, useEffect, useState } from "react";
import { readStored, writeStored } from "@/lib/browserStore";
import { NOTICE_KEY, dismissNotice, pruneNotices, type Notice } from "@/lib/notifications";
import { WATCH_KEY, parseWatchlist, removeWatch, toggleWatch, type ToggleResult, type WatchEntry } from "@/lib/watchlist";

const TICK_MS = 30_000;

/**
 * The visitor's watchlist and notifications, kept in this browser (lib/browserStore). Read once after the page mounts, so the
 * server and browser render the same first paint; saved whenever they change; kept in step with other tabs of the same
 * browser; and cleaned every half minute so a notification that has run out of time disappears while the page is open.
 */
export function useWatchNotify() {
  const [watch, setWatch] = useState<WatchEntry[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [now, setNow] = useState(0);
  const [loaded, setLoaded] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const t = Date.now();
    setWatch(parseWatchlist(readStored(WATCH_KEY)));
    setNotices(pruneNotices(readStored(NOTICE_KEY), t));
    setNow(t);
    setLoaded(true);

    const tick = window.setInterval(() => {
      const n = Date.now();
      setNow(n);
      setNotices((list) => {
        const kept = pruneNotices(list, n);
        return kept.length === list.length ? list : kept;
      });
    }, TICK_MS);
    // Another tab changed one of them: follow it.
    const onStorage = (e: StorageEvent) => {
      if (e.key === WATCH_KEY) setWatch(parseWatchlist(readStored(WATCH_KEY)));
      if (e.key === NOTICE_KEY) setNotices(pruneNotices(readStored(NOTICE_KEY), Date.now()));
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(tick);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (loaded) writeStored(WATCH_KEY, watch);
  }, [watch, loaded]);
  useEffect(() => {
    if (loaded) writeStored(NOTICE_KEY, notices);
  }, [notices, loaded]);

  /** Watches the stock, or stops watching it. Says what happened, so the caller can tell the person. */
  const toggle = useCallback(
    (stock: { symbol: string; name: string; price?: number | null; roe?: number | null; roce?: number | null }): ToggleResult["result"] => {
      const r = toggleWatch(watch, stock, Date.now());
      if (r.result !== "full") setWatch(r.list);
      return r.result;
    },
    [watch],
  );
  const unwatch = useCallback((symbol: string) => setWatch((l) => removeWatch(l, symbol)), []);
  const dismiss = useCallback((id: string) => setNotices((l) => dismissNotice(l, id)), []);
  const clearNotices = useCallback(() => setNotices([]), []);

  return { watch, notices, now, toggle, unwatch, dismiss, clearNotices };
}
