import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { currentUser, signInRequired } from "@/lib/authServer";
import { getDb } from "@/lib/db";
import { HOURLY_LIMIT, addEntry, enteredFor, recentCount, validateEntry } from "@/lib/figures";
import { callerKey, createLimiter } from "@/lib/rateLimit";
import { cleanTicker } from "@/lib/yahoo";

// Figures that visitors enter when Yahoo Finance has none (ROE or ROCE), shared by everyone who previews that company.
// GET reads them, POST (signed-in people only) adds one. Without a database both say so and the page hides the entry boxes.
const allow = createLimiter(40, 60_000);
const SALT = process.env.FIGURES_SALT || "stock-analysis";

const json = (body: object, status = 200, cache = "no-store") => Response.json(body, { status, headers: { "Cache-Control": cache } });
const hashOf = (req: NextRequest) => createHash("sha256").update(`${callerKey(req.headers)}|${SALT}`).digest("hex").slice(0, 32);

export async function GET(req: NextRequest) {
  const ticker = cleanTicker(req.nextUrl.searchParams.get("ticker"));
  if (!ticker) return json({ error: "That is not an NSE or BSE ticker." }, 400);
  const db = getDb();
  if (!db) return json({ configured: false, entered: {} }, 200, "public, s-maxage=60");
  if (!allow(callerKey(req.headers))) return json({ error: "Too many requests. Try again in a minute." }, 429);
  try {
    return json({ configured: true, entered: await enteredFor(db, ticker) }, 200, "public, s-maxage=30, stale-while-revalidate=60");
  } catch (e) {
    console.error("[figures] read failed:", e instanceof Error ? e.message : e);
    return json({ configured: true, entered: {}, unavailable: true });
  }
}

export async function POST(req: NextRequest) {
  // A browser form on another site cannot send JSON without our consent, so requiring it blocks cross-site posts.
  if (!req.headers.get("content-type")?.includes("application/json")) return json({ error: "Send JSON." }, 415);
  if (!(await currentUser(req))) return signInRequired("add a figure");
  const body = await req.json().catch(() => null);
  const v = validateEntry(body);
  if (!v.ok) return json({ error: v.error }, 400);
  const db = getDb();
  if (!db) return json({ error: "Entering figures is not switched on for this site yet." }, 503);
  if (!allow(callerKey(req.headers))) return json({ error: "Too many requests. Try again in a minute." }, 429);
  try {
    const hash = hashOf(req);
    if ((await recentCount(db, hash)) >= HOURLY_LIMIT) return json({ error: `You have entered ${HOURLY_LIMIT} figures in the last hour. Try again later.` }, 429);
    await addEntry(db, v.entry, hash);
    return json({ configured: true, entered: await enteredFor(db, v.entry.ticker) }, 201);
  } catch (e) {
    console.error("[figures] write failed:", e instanceof Error ? e.message : e);
    return json({ error: "The figure could not be saved. Try again in a moment." }, 502);
  }
}
