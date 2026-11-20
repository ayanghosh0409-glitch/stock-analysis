/**
 * The one place the watchlist and the notifications touch the browser's storage. Both are kept in this browser only, so
 * moving them to the server later means changing this file and the hook that calls it, not the screens.
 *
 * Storage can be missing or throw (private windows, blocked site data), so every call is wrapped and the page works without it.
 */

/** What is stored under `key`, parsed, or null when there is nothing, it is not JSON, or storage is unavailable. */
export function readStored(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
