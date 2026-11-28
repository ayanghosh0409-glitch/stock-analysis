"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

/**
 * Who is using the site, for every part of the page that cares. The pages are built once and shared, so who is signed in is asked
 * from the server when the page opens (GET /api/auth/session) rather than baked into the page. Hiding a button for a guest is only a
 * courtesy: the server refuses the same action from a guest (401), which is the real check.
 */
export type Me = { email: string; name: string | null };

type Auth = {
  /** "loading" until the server has answered. Nothing that needs an account runs while loading. */
  status: "loading" | "ready";
  /** False when the site has no Google sign-in set up (or no database for accounts). */
  configured: boolean;
  user: Me | null;
  /** The address that starts sign-in and brings the person back to the page they are on now. */
  signInUrl: () => string;
  /** The sign-in page, which explains what an account is for. */
  signInPage: () => string;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Shows the "sign in to …" prompt beside `anchor`, for a guest who tried something that needs an account. */
  ask: (anchor: HTMLElement, what: string) => void;
};

const here = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;

const GUEST: Auth = {
  status: "ready",
  configured: true,
  user: null,
  signInUrl: () => "/api/auth/login",
  signInPage: () => "/sign-in",
  signOut: async () => {},
  refresh: async () => {},
  ask: () => {},
};

const Ctx = createContext<Auth>(GUEST);
export const useAuth = () => useContext(Ctx);

type Session = { status: "loading" | "ready"; configured: boolean; user: Me | null };

async function readSession(): Promise<Session> {
  try {
    const res = await fetch("/api/auth/session", { cache: "no-store" });
    const body = await res.json();
    return { status: "ready", configured: body?.configured !== false, user: body?.user && typeof body.user.email === "string" ? { email: body.user.email, name: body.user.name ?? null } : null };
  } catch {
    return { status: "ready", configured: true, user: null }; // could not ask: carry on as a guest; the server still decides
  }
}

type Prompt = { what: string; anchor: HTMLElement; top: number; left: number };
const WIDTH = 288;

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Session>({ status: "loading", configured: true, user: null });
  const [prompt, setPrompt] = useState<Prompt | null>(null);

  const refresh = useCallback(() => readSession().then(setState), []);

  useEffect(() => {
    let live = true;
    const load = () => void readSession().then((r) => live && setState(r));
    load();
    // Signing out in another tab, or coming back to a long-open tab, should not leave a stale header.
    const again = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", again);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", again);
    };
  }, []);

  const value = useMemo<Auth>(
    () => ({
      ...state,
      signInUrl: () => `/api/auth/login?returnTo=${encodeURIComponent(here())}`,
      signInPage: () => `/sign-in?returnTo=${encodeURIComponent(here())}`,
      signOut: async () => {
        try {
          await fetch("/api/auth/logout", { method: "POST" });
        } finally {
          await refresh();
        }
      },
      refresh,
      ask: (anchor, what) => {
        const r = anchor.getBoundingClientRect();
        setPrompt({ what, anchor, top: r.bottom + 8, left: Math.max(8, Math.min(r.left, window.innerWidth - WIDTH - 8)) });
      },
    }),
    [state, refresh],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {prompt && <SignInPrompt prompt={prompt} auth={value} onClose={() => setPrompt(null)} />}
    </Ctx.Provider>
  );
}

/**
 * "Sign in to watch a stock": a small card beside the star a guest tapped (a sheet at the bottom on a phone). It closes on Escape,
 * on a tap elsewhere, or when the page scrolls, and puts focus back on the star.
 */
function SignInPrompt({ prompt, auth, onClose }: { prompt: Prompt; auth: Auth; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const link = useRef<HTMLAnchorElement>(null);
  const { anchor } = prompt;

  useEffect(() => {
    link.current?.focus();
    const close = (restore: boolean) => {
      onClose();
      if (restore && anchor.isConnected) anchor.focus();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(true);
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && !anchor.contains(e.target as Node) && close(false);
    const onScroll = () => close(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", onScroll);
    };
  }, [anchor, onClose]);

  const unavailable = !auth.configured;
  return (
    <div
      ref={box}
      role="dialog"
      aria-label={`Sign in to ${prompt.what}`}
      style={{ top: prompt.top, left: prompt.left, width: WIDTH }}
      className="fixed z-50 rounded-xl border border-line bg-surface p-4 shadow-xl max-sm:!inset-x-3 max-sm:!bottom-3 max-sm:!top-auto max-sm:!w-auto"
    >
      <p className="text-sm font-semibold">Sign in to {prompt.what}</p>
      <p className="mt-1 text-xs text-muted">
        {unavailable ? "Sign-in is not set up on this site yet, so this is not available right now." : "A watchlist belongs to your account, so it follows you to any device. Browsing needs no account."}
      </p>
      <div className="mt-3 flex items-center gap-2">
        {!unavailable && (
          <a
            ref={link}
            href={auth.signInUrl()}
            onClick={(e) => {
              e.preventDefault();
              window.location.assign(auth.signInUrl()); // the address is read now, so it carries the page as it is at this moment
            }}
            className="inline-flex min-h-11 items-center rounded-full border border-primary bg-primary px-4 text-sm font-semibold text-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:min-h-9"
          >
            Sign in
          </a>
        )}
        <button
          type="button"
          ref={unavailable ? (el) => el?.focus() : undefined}
          onClick={() => {
            onClose();
            if (anchor.isConnected) anchor.focus();
          }}
          className="inline-flex min-h-11 items-center rounded-full px-3 text-sm text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent lg:min-h-9"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
