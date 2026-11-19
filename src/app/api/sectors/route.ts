import type { NextRequest } from "next/server";
import stocks from "../../../../data/stocks.json";
import stored from "../../../../data/sector-lists.json";
import { buildSector, type Fetched, type Skipped } from "@/lib/builtSector";
import { getDb, type Db } from "@/lib/db";
import { readPreview, savePreview } from "@/lib/previewCache";
import { callerKey, createLimiter } from "@/lib/rateLimit";
import { isSectorFile, type SectorList } from "@/lib/sectorLists";
import { SharedFull, isFresh, listShared, readShared, saveShared } from "@/lib/sharedSectors";
import { describeYahooError } from "@/lib/yahooErrors";
import { fetchPreview } from "@/lib/yahoo-client";

// Sectors built from Yahoo that every visitor sees.
//
//   GET   the shared sectors.
//   POST  { name: "<Yahoo sector or industry name>" } makes the server build that sector and keep it for everyone.
//
// The server builds it itself, from the Yahoo cache (which the visitor's own build has just filled) and from Yahoo for
// whatever is missing. Nothing in the request body becomes part of the sector except the name, and the name must be one of
// the stored lists, so a visitor cannot put figures of their own in front of everyone.
export const maxDuration = 60;

const allowRead = createLimiter(60, 60_000);
const allowWrite = createLimiter(6, 60_000);
const lists: SectorList[] = isSectorFile(stored) ? stored.lists : [];
const listsFetchedAt = (stored as { fetchedAt: string | null }).fetchedAt ?? null;
const LISTED = stocks.sectors.map((s) => s.name);
const CONCURRENCY = 3;

const fail = (status: number, error: string, reason?: string) =>
  Response.json({ error, ...(reason ? { reason } : {}) }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req: NextRequest) {
  if (!allowRead(callerKey(req.headers))) return fail(429, "Too many requests in a short time. Try again in a minute.");
  const db = getDb();
  let sectors: Awaited<ReturnType<typeof listShared>> = [];
  if (db) {
    try {
      sectors = await listShared(db);
    } catch (e) {
      console.error(`[sectors] could not list shared sectors: ${e instanceof Error ? e.message : e}`); // the shared tabs are a bonus
    }
  }
  return Response.json({ sectors }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } });
}

/** One company's figures for the shared sector: from the cache, else from Yahoo (and then cached). */
async function figuresFor(db: Db, ticker: string): Promise<Fetched> {
  try {
    const hit = await readPreview(db, ticker);
    if (hit) return { preview: hit.preview, fetchedAt: hit.fetchedAt };
  } catch (e) {
    console.error(`[sectors] cache read failed for ${ticker}: ${e instanceof Error ? e.message : e}`);
  }
  const preview = await fetchPreview(ticker, LISTED);
  await savePreview(db, preview).catch((e) => console.error(`[sectors] cache write failed for ${ticker}: ${e instanceof Error ? e.message : e}`));
  return { preview, fetchedAt: new Date().toISOString() };
}

export async function POST(req: NextRequest) {
  if (!allowWrite(callerKey(req.headers))) return fail(429, "Too many sectors saved in a short time. Try again in a minute.");
  const body = (await req.json().catch(() => null)) as { name?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const list = name ? lists.find((l) => l.name === name) : undefined;
  if (!list) return fail(400, "That is not one of the sectors or industries the site knows.");
  const db = getDb();
  if (!db) return fail(503, "Showing a sector to everyone needs the shared database, which is not set up here.", "no-database");

  try {
    const have = await readShared(db, list.name);
    if (have && isFresh(have.built?.builtAt)) return Response.json({ sector: have, created: false });

    const got: Fetched[] = [];
    const skipped: Skipped[] = [];
    let transient = 0;
    let next = 0;
    const worker = async () => {
      while (next < list.stocks.length) {
        const s = list.stocks[next++];
        try {
          got.push(await figuresFor(db, s.symbol));
        } catch (e) {
          const d = describeYahooError(e);
          if (!d.permanent) transient++;
          skipped.push({ symbol: s.symbol, name: s.name, reason: d.message });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.stocks.length) }, worker));

    // A sector saved while Yahoo was only half answering would show everyone a thin list for a week. A company Yahoo
    // cannot give (dollar reporting, no data) is left out for good; one it just did not answer for is a reason to wait.
    if (transient > 0) return fail(502, `Yahoo Finance did not answer for ${transient} of the ${list.stocks.length} companies, so the sector was not saved. Build it again in a minute.`);
    if (got.length === 0) return fail(502, "Yahoo Finance gave no figures for this sector, so it was not saved.");

    const sector = buildSector(list, got, skipped, LISTED);
    sector.built!.listsFetchedAt = listsFetchedAt;
    const saved = await saveShared(db, sector);
    return Response.json({ sector: saved, created: !have });
  } catch (e) {
    if (e instanceof SharedFull) return fail(409, e.message, "full");
    console.error(`[sectors] could not save ${name}: ${e instanceof Error ? e.message : e}`);
    return fail(500, "The sector could not be saved. It still works for this visit.");
  }
}
