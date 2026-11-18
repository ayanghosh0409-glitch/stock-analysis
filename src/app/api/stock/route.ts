import type { NextRequest } from "next/server";
import data from "../../../../data/stocks.json";
import { callerKey, createLimiter } from "@/lib/rateLimit";
import { cleanTicker } from "@/lib/yahoo";
import { NotIndianListing, NothingFound, fetchPreview } from "@/lib/yahoo-client";

// The screen figures for one NSE or BSE ticker, worked out from Yahoo Finance. Nothing is saved.
const allow = createLimiter(20, 60_000);
const CACHE = "public, s-maxage=21600, stale-while-revalidate=86400";
const SECTORS = data.sectors.map((s) => s.name);

const fail = (status: number, error: string) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req: NextRequest) {
  const ticker = cleanTicker(req.nextUrl.searchParams.get("ticker"));
  if (!ticker) return fail(400, "That is not an NSE or BSE ticker (for example HDFCBANK.NS).");
  if (!allow(callerKey(req.headers))) return fail(429, "Too many lookups in a short time. Try again in a minute.");
  try {
    const preview = await fetchPreview(ticker, SECTORS);
    return Response.json({ preview }, { headers: { "Cache-Control": CACHE } });
  } catch (e) {
    if (e instanceof NotIndianListing) return fail(422, "Only companies listed on NSE or BSE (priced in rupees) can be previewed.");
    if (e instanceof NothingFound) return fail(404, "Yahoo Finance has no data for that ticker.");
    return fail(502, "Yahoo Finance did not respond. Try again in a moment.");
  }
}
