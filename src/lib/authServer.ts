import type { NextRequest, NextResponse } from "next/server";
import { SESSION_DAYS, userForSession, type User } from "./auth";
import { getDb } from "./db";
import { SESSION_COOKIE, oidcConfig } from "./oidc";

/**
 * The pieces the routes share: who is asking, the address people use to reach the site, and the one answer for "sign in first".
 * Server-side only.
 */

/**
 * The site's own address, as the person's browser sees it. AUTH_URL wins when set (the address registered with Google); otherwise
 * the host the request arrived for, which behind Vercel's proxy is in the forwarded headers.
 */
export function originOf(req: NextRequest): string {
  const fixed = process.env.AUTH_URL?.trim().replace(/\/+$/, "");
  if (fixed) return fixed;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || req.nextUrl.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host") || req.nextUrl.host;
  return `${proto}://${host}`;
}

/** Sign-in works only with a database for the accounts and the three settings; without them every sign-in control says so. */
export function authConfigured(origin: string): boolean {
  return !!getDb() && !!oidcConfig(process.env, origin);
}

/** The signed-in person behind this request, or null for a guest (or a session that has ended). */
export async function currentUser(req: Pick<NextRequest, "cookies">): Promise<User | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const db = getDb();
  if (!token || !db) return null;
  try {
    return await userForSession(db, token);
  } catch (e) {
    console.error("[auth] could not read the session:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** What a route answers a guest who tries something that needs an account. The page shows it where the result would have been. */
export const signInRequired = (what: string): Response =>
  Response.json({ error: `Sign in to ${what}.`, reason: "sign-in" }, { status: 401, headers: { "Cache-Control": "no-store" } });

/** Puts the session token in the browser's cookie: unreadable by scripts, not sent along with requests from other sites. */
export function setSessionCookie(res: NextResponse, token: string, origin: string): void {
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https:"), path: "/", maxAge: SESSION_DAYS * 86_400 });
}

export function clearSessionCookie(res: NextResponse, origin: string): void {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https:"), path: "/", maxAge: 0 });
}
