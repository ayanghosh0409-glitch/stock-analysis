import type { NextRequest } from "next/server";
import { callerKey, createLimiter } from "@/lib/rateLimit";
import { cleanQuery } from "@/lib/yahoo";
import { searchCandidates } from "@/lib/yahoo-client";

// Companies on NSE or BSE that match a name or symbol typed in the search box.
const allow = createLimiter(30, 60_000);
const CACHE = "public, s-maxage=3600, stale-while-revalidate=86400";

const fail = (status: number, error: string) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req: NextRequest) {
  const q = cleanQuery(req.nextUrl.searchParams.get("q"));
  if (!q) return fail(400, "Type at least 2 characters of a company name or symbol.");
  if (!allow(callerKey(req.headers))) return fail(429, "Too many lookups in a short time. Try again in a minute.");
  try {
    const results = await searchCandidates(q);
    return Response.json({ results }, { headers: { "Cache-Control": CACHE } });
  } catch {
    return fail(502, "Yahoo Finance did not respond. Try again in a moment.");
  }
}
