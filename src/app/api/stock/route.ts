import type { NextRequest } from "next/server";
import data from "../../../../data/stocks.json";
import { getDb } from "@/lib/db";
import { readPreview, savePreview } from "@/lib/previewCache";
import { callerKey, createLimiter } from "@/lib/rateLimit";
import { cleanTicker } from "@/lib/yahoo";
import { ForeignReporting, NotIndianListing, NothingFound, fetchPreview } from "@/lib/yahoo-client";

// The screen figures for one NSE or BSE ticker, worked out from Yahoo Finance. With a database, the answer is kept for
// a week and served from there, so a company that was already looked up costs Yahoo nothing.
// A sector is ten of these at once, so the limit allows a couple of sectors a minute.
const allow = createLimiter(30, 60_000);
const CACHE = "public, s-maxage=21600, stale-while-revalidate=86400";
const SECTORS = data.sectors.map((s) => s.name);

const fail = (status: number, error: string) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req: NextRequest) {
  const ticker = cleanTicker(req.nextUrl.searchParams.get("ticker"));
  if (!ticker) return fail(400, "That is not an NSE or BSE ticker (for example HDFCBANK.NS).");
  if (!allow(callerKey(req.headers))) return fail(429, "Too many lookups in a short time. Try again in a minute.");
  const db = getDb();
  if (db) {
    try {
      const hit = await readPreview(db, ticker);
      if (hit) return Response.json({ preview: hit.preview, fetchedAt: hit.fetchedAt, cached: true }, { headers: { "Cache-Control": CACHE } });
    } catch (e) {
      console.error(`[stock] cache read failed for ${ticker}: ${e instanceof Error ? e.message : e}`); // the cache is a bonus: carry on to Yahoo
    }
  }
  try {
    const preview = await fetchPreview(ticker, SECTORS);
    if (db) await savePreview(db, preview).catch((e) => console.error(`[stock] cache write failed for ${ticker}: ${e instanceof Error ? e.message : e}`));
    return Response.json({ preview, fetchedAt: new Date().toISOString(), cached: false }, { headers: { "Cache-Control": CACHE } });
  } catch (e) {
    if (e instanceof ForeignReporting) return fail(422, "This company reports its accounts in a foreign currency, so its amounts cannot be shown in rupees yet.");
    if (e instanceof NotIndianListing) return fail(422, "Only companies listed on NSE or BSE (priced in rupees) can be previewed.");
    if (e instanceof NothingFound) return fail(404, "Yahoo Finance has no data for that ticker.");
    return fail(502, "Yahoo Finance did not respond. Try again in a moment.");
  }
}
