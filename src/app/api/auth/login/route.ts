import { NextResponse, type NextRequest } from "next/server";
import { authConfigured, originOf } from "@/lib/authServer";
import { FLOW_COOKIE, FLOW_MAX_AGE, oidcConfig, safeReturnTo, startLogin } from "@/lib/oidc";
import { callerKey, createLimiter } from "@/lib/rateLimit";

// "Continue with Google" is a plain link to this route: it sets the one-time sign-in cookie and sends the browser to Google.
// Anything that goes wrong sends the person to the sign-in page with a reason, never to a blank error.
const allow = createLimiter(20, 60_000);

export async function GET(req: NextRequest) {
  const origin = originOf(req);
  const returnTo = safeReturnTo(req.nextUrl.searchParams.get("returnTo"));
  const back = (error: string) => {
    const u = new URL("/sign-in", origin);
    u.searchParams.set("error", error);
    if (returnTo !== "/") u.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(u, { headers: { "Cache-Control": "no-store" } });
  };
  const cfg = authConfigured(origin) ? oidcConfig(process.env, origin) : null;
  if (!cfg) return back("unconfigured");
  if (!allow(callerKey(req.headers))) return back("failed");

  const { url, cookie } = startLogin(cfg, returnTo);
  const res = NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } });
  // Lax, not Strict: Google sends the person back with a top-level navigation, and Strict cookies are not sent on that.
  res.cookies.set(FLOW_COOKIE, cookie, { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https:"), path: "/api/auth", maxAge: FLOW_MAX_AGE });
  return res;
}
