"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";

/**
 * The top-right of every page: "Sign in" for a guest, or the person's initial and name with a small menu (who they are, Sign out).
 * While the server has not yet said who is here, it holds the space so the header does not jump.
 */
export default function AccountMenu() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  if (auth.status === "loading") return <span aria-hidden="true" className="inline-block h-11 w-20 lg:h-9" />;

  if (!auth.user) {
    if (!auth.configured) return null; // nothing to offer until the site has sign-in set up; the places that need an account explain why
    return (
      <a
        href={auth.signInPage()}
        onClick={(e) => {
          e.preventDefault();
          window.location.assign(auth.signInPage());
        }}
        className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-accent lg:min-h-9"
      >
        Sign in
      </a>
    );
  }

  const shown = auth.user.name?.trim() || auth.user.email;
  const first = shown.split(/\s+/)[0];
  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Account: ${shown}`}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface pl-1.5 pr-3 text-sm hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-accent lg:min-h-9"
      >
        <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold uppercase text-on-primary lg:size-6">
          {shown.charAt(0)}
        </span>
        <span className="hidden max-w-28 truncate sm:inline">{first}</span>
        <span aria-hidden="true" className="text-muted">
          ▾
        </span>
      </button>
      {open && (
        <div role="group" aria-label="Account" className="absolute right-0 top-full z-40 mt-2 w-64 rounded-xl border border-line bg-surface p-2 shadow-xl">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold">{auth.user.name || "Signed in"}</p>
            <p className="truncate text-xs text-muted">{auth.user.email}</p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await auth.signOut();
              setBusy(false);
              setOpen(false);
            }}
            className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm hover:bg-surface2 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60 lg:min-h-9"
          >
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
