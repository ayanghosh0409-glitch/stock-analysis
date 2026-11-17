"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { RECENT_DAYS, RECENT_STORE, addRecent, pruneRecent, suggestRecent, type RecentSearch as Recent } from "@/lib/recent";

// Storage is the source of truth and state is only a view of it. Each read happens on interaction,
// so server and client render the same first paint and several tabs stay in step. The page works
// without storage: if it is blocked, searching still works and nothing is remembered.
function read(now: number): Recent[] {
  try {
    return pruneRecent(JSON.parse(window.localStorage.getItem(RECENT_STORE) ?? "[]"), now);
  } catch {
    return [];
  }
}

function write(list: Recent[]) {
  try {
    window.localStorage.setItem(RECENT_STORE, JSON.stringify(list));
  } catch {}
}

/** The search box. Clicking it lists the searches from the last few days; choosing one runs it. */
export default function RecentSearch({ value, onChange }: { value: string; onChange: (q: string) => void }) {
  const id = useId();
  const listId = `${id}-list`;
  const wrap = useRef<HTMLDivElement>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const options = suggestRecent(recent, value);
  const showing = open && options.length > 0;

  const openList = () => {
    setRecent(read(Date.now())); // also drops anything that expired while the page sat open
    setOpen(true);
  };

  const remember = (q: string) => {
    const next = addRecent(read(Date.now()), q, Date.now());
    write(next);
    setRecent(next);
  };

  const pick = (q: string) => {
    onChange(q);
    remember(q);
    setOpen(false);
    setActive(-1);
  };

  const clear = () => {
    write([]);
    setRecent([]);
    setActive(-1);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!showing) {
        openList();
        return;
      }
      e.preventDefault();
      const n = options.length;
      setActive((i) => (e.key === "ArrowDown" ? (i + 1) % n : i <= 0 ? n - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (showing && active >= 0 && options[active]) {
        e.preventDefault();
        pick(options[active].q);
      } else {
        remember(value);
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor={`${id}-input`} className="text-muted">
        Search
      </label>
      <div
        ref={wrap}
        className="relative"
        onBlur={(e) => {
          // Leaving the box (not just moving inside it) counts as finishing a search.
          if (wrap.current?.contains(e.relatedTarget as Node | null)) return;
          remember(value);
          setOpen(false);
          setActive(-1);
        }}
      >
        <input
          id={`${id}-input`}
          role="combobox"
          aria-expanded={showing}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showing && active >= 0 ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          value={value}
          placeholder="Name or symbol"
          onChange={(e) => {
            onChange(e.target.value);
            setActive(-1);
            if (!open) openList();
          }}
          onFocus={openList}
          onClick={openList}
          onKeyDown={onKeyDown}
          className="w-40 rounded border border-line bg-surface px-2 py-1"
        />
        {showing && (
          // Keeping the mouse press from taking focus off the input lets a click land before the box closes.
          <div
            onMouseDown={(e) => e.preventDefault()}
            className="absolute left-0 top-full z-20 mt-1 w-56 overflow-hidden rounded border border-line bg-surface shadow-lg"
          >
            <div className="px-2 pb-1 pt-1.5 text-[11px] uppercase tracking-wide text-muted">
              Recent searches · last {RECENT_DAYS} days
            </div>
            <ul id={listId} role="listbox" aria-label="Recent searches">
              {options.map((r, i) => (
                <li
                  key={r.q}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onClick={() => pick(r.q)}
                  onMouseEnter={() => setActive(i)}
                  className={`cursor-pointer truncate px-2 py-1.5 ${i === active ? "bg-surface2" : ""}`}
                >
                  {r.q}
                </li>
              ))}
            </ul>
            <button type="button" onClick={clear} className="w-full border-t border-line px-2 py-1.5 text-left text-xs text-muted hover:bg-surface2">
              Clear recent searches
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
