import { NextResponse, type NextRequest } from "next/server";
import { createSession, upsertUser } from "@/lib/auth";
import { authConfigured, originOf, setSessionCookie } from "@/lib/authServer";
import { getDb } from "@/lib/db";
import { FLOW_COOKIE, completeLogin, oidcConfig } from "@/lib/oidc";

// Where Google sends the person back. Checks the sign-in against the cookie set at the start, makes or finds the account,
// starts a session and returns the person to the page they left. Any failure lands on the sign-in page; no account is touched.
export async function GET(req: NextRequest) {
  const origin = originOf(req);
  const clearFlow = (res: NextResponse) => {
    res.cookies.set(FLOW_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https:"), path: "/api/auth", maxAge: 0 }); // one use only
    return res;
  };
  const toPage = (returnTo: string) => clearFlow(NextResponse.redirect(new URL(returnTo, origin), { headers: { "Cache-Control": "no-store" } }));
  const toSignIn = (error: string, returnTo = "/") => {
    const u = new URL("/sign-in", origin);
    u.searchParams.set("error", error);
    if (returnTo !== "/") u.searchParams.set("returnTo", returnTo);
    return clearFlow(NextResponse.redirect(u, { headers: { "Cache-Control": "no-store" } }));
  };

  const db = getDb();
  const cfg = db && authConfigured(origin) ? oidcConfig(process.env, origin) : null;
  if (!db || !cfg) return toSignIn("unconfigured");

  const q = req.nextUrl.searchParams;
  const result = await completeLogin(cfg, { code: q.get("code"), state: q.get("state"), error: q.get("error") }, req.cookies.get(FLOW_COOKIE)?.value);
  if (!result.ok) return toSignIn(result.reason, result.returnTo);

  try {
    const user = await upsertUser(db, result.identity);
    const { token } = await createSession(db, user.id);
    const res = toPage(result.returnTo);
    setSessionCookie(res, token, origin);
    return res;
  } catch (e) {
    console.error("[auth] could not finish sign-in:", e instanceof Error ? e.message : e);
    return toSignIn("failed", result.returnTo);
  }
}
