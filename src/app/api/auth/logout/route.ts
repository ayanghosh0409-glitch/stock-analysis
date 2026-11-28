import { NextResponse, type NextRequest } from "next/server";
import { endSession } from "@/lib/auth";
import { clearSessionCookie, originOf } from "@/lib/authServer";
import { getDb } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/oidc";

// Signing out is a POST from the site's own page, so another site cannot sign a person out with a link or an image.
export async function POST(req: NextRequest) {
  const origin = originOf(req);
  const site = req.headers.get("sec-fetch-site");
  const from = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host") || req.nextUrl.host;
  const fromHost = (() => {
    try {
      return from ? new URL(from).host : null;
    } catch {
      return "invalid";
    }
  })();
  if ((site && site !== "same-origin") || (fromHost && fromHost !== host)) return Response.json({ error: "Not allowed." }, { status: 403, headers: { "Cache-Control": "no-store" } });

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const db = getDb();
  if (token && db) {
    try {
      await endSession(db, token); // the token stops working everywhere, not just in this browser
    } catch (e) {
      console.error("[auth] could not end the session:", e instanceof Error ? e.message : e);
    }
  }
  const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  clearSessionCookie(res, origin);
  return res;
}
