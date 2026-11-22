"use client";

import { WATCH_MAX } from "@/lib/watchlist";

export function Star({ filled }: { filled: boolean }) {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" className="shrink-0">
      <polygon
        points="10,1.8 12.6,7.4 18.6,8.1 14.1,12.2 15.4,18.2 10,15.1 4.6,18.2 5.9,12.2 1.4,8.1 7.4,7.4"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The star that watches a stock. It is a toggle button (pressed means watched), and what it shows differs by shape (filled or
 * outline) and not only by colour. `full` is true when the list has no room: a stock already watched can still be removed.
 * `label` shows the word "Watch" beside the star; the word never changes, because the pressed state already says whether it is on.
 */
export default function WatchButton({
  name,
  watching,
  full,
  onToggle,
  label = false,
}: {
  name: string;
  watching: boolean;
  full: boolean;
  onToggle: () => void;
  label?: boolean;
}) {
  const blocked = full && !watching;
  return (
    <button
      type="button"
      aria-pressed={watching}
      aria-label={label ? undefined : `Watch ${name}`}
      disabled={blocked}
      title={blocked ? `You can watch ${WATCH_MAX} stocks. Stop watching one to add another.` : watching ? "Stop watching" : "Watch for notifications"}
      onClick={onToggle}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg text-sm hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 lg:min-h-8 lg:min-w-8 ${
        watching ? "text-accent" : "text-muted hover:text-ink"
      } ${label ? `border px-3 font-medium ${watching ? "border-accent" : "border-line"}` : ""}`}
    >
      <Star filled={watching} />
      {label && (
        <span>
          Watch<span className="sr-only"> {name}</span>
        </span>
      )}
    </button>
  );
}
