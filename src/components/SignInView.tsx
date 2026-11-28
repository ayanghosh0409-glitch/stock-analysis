"use client";

import { useSearchParams } from "next/navigation";
import { safeReturnTo } from "@/lib/returnTo";
import { useAuth } from "./AuthProvider";

const primary =
  "inline-flex min-h-11 w-full items-center justify-center gap-3 rounded-full border border-primary bg-primary px-5 text-sm font-semibold text-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const quiet = "inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent";

const POINTS = [
  ["ROE above the sector", "A stock must beat its own sector, not the whole market."],
  ["Four years of profit", "See at a glance if profit is steady, recovering or weak."],
  ["Every sector, one rule", "Build a sector and screen its top 10 stocks."],
];

/**
 * The sign-in page: what the site is, and "Continue with Google". It also explains the three ways a sign-in can end without one
 * (cancelled at Google, failed, or not set up), and always offers a way back to browsing as a guest.
 */
export default function SignInView() {
  const q = useSearchParams();
  const auth = useAuth();
  const returnTo = safeReturnTo(q.get("returnTo"));
  const error = q.get("error");
  const login = `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
  const unconfigured = error === "unconfigured" || (auth.status === "ready" && !auth.configured);

  const problem =
    error === "cancelled"
      ? { eyebrow: "You closed Google", title: "Sign-in was cancelled", text: "Nothing changed. You are still browsing as a guest." }
      : error === "failed"
        ? { eyebrow: "Google or our side failed", title: "We could not sign you in", text: "Something went wrong on the way back from Google. No account was changed. Try again in a moment." }
        : null;

  return (
    <main className="mx-auto grid min-h-screen max-w-5xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:gap-16">
      <section aria-label="About this site" className="hidden lg:block">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-xl bg-primary text-sm font-bold text-on-primary">
            SA
          </span>
          <span className="text-lg font-bold tracking-tight">Stock Analysis</span>
        </div>
        <h1 className="mt-8 text-4xl">Find the stocks that beat their sector.</h1>
        <p className="mt-3 max-w-md text-muted">A simple screen for Indian listed stocks, sector by sector.</p>
        <ul className="mt-8 space-y-4">
          {POINTS.map(([t, d]) => (
            <li key={t} className="flex gap-3">
              <span aria-hidden="true" className="mt-0.5 font-semibold text-accent">
                ✓
              </span>
              <span>
                <span className="block font-semibold">{t}</span>
                <span className="block text-sm text-muted">{d}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-8 inline-flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm shadow-sm">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted">Sample</span>
          <span>Stock A · ROE 24% vs sector 17%</span>
          <span className="font-semibold" style={{ color: "var(--good)" }}>
            Strong
          </span>
        </p>
      </section>

      <section aria-label="Sign in" className="rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8">
        <div className="mb-5 flex items-center gap-3 lg:hidden">
          <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-xl bg-primary text-xs font-bold text-on-primary">
            SA
          </span>
          <span className="font-bold tracking-tight">Stock Analysis</span>
        </div>

        {auth.status === "ready" && auth.user ? (
          <>
            <h1 className="text-2xl">You are signed in</h1>
            <p className="mt-2 text-sm text-muted">
              Signed in as <span className="font-medium text-ink">{auth.user.name || auth.user.email}</span>. Building a sector and watching a stock are available.
            </p>
            <a href={returnTo} className={`${primary} mt-6`}>
              Continue to the site
            </a>
          </>
        ) : unconfigured ? (
          <>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Not set up yet</p>
            <h1 className="mt-1 text-2xl">Sign-in is not available</h1>
            <p className="mt-2 text-sm text-muted">This site has no Google sign-in set up yet, so building a sector and watching a stock are switched off. Everything else works as a guest.</p>
            <a href={returnTo} className={`${primary} mt-6`}>
              Keep browsing
            </a>
          </>
        ) : problem ? (
          <div role="alert">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{problem.eyebrow}</p>
            <h1 className="mt-1 text-2xl">{problem.title}</h1>
            <p className="mt-2 text-sm text-muted">{problem.text}</p>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <a href={login} className={`${primary} sm:w-auto`}>
                Try again
              </a>
              <a href={returnTo} className={quiet}>
                Keep browsing
              </a>
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-2xl">Sign in</h1>
            <p className="mt-2 text-sm text-muted">Sign in to build sectors and watch stocks. Browsing needs no account.</p>
            <a href={login} className={`${primary} mt-6`}>
              <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-full bg-surface text-xs font-bold text-ink">
                G
              </span>
              Continue with Google
            </a>
            <p className="mt-3 text-xs text-muted">
              What we keep: your email, name and Google ID. No password is stored, and nothing is posted to your Google account.
            </p>
            <div className="my-5 flex items-center gap-3 text-xs text-muted" aria-hidden="true">
              <span className="h-px flex-1 bg-line" />
              or
              <span className="h-px flex-1 bg-line" />
            </div>
            <a href={returnTo} className={`${quiet} w-full border border-line`}>
              Continue as a guest →
            </a>
            <p className="mt-2 text-center text-xs text-muted">Guests can view everything but cannot build a sector or watch a stock.</p>
          </>
        )}
      </section>
    </main>
  );
}
