import type { NextRequest } from "next/server";
import stored from "../../../../data/sector-lists.json";
import { callerKey, createLimiter } from "@/lib/rateLimit";
import { isSectorFile } from "@/lib/sectorLists";
import { matchSector, sectorNames } from "@/lib/sectorMatch";
import { cleanQuery } from "@/lib/yahoo";

// Finds the sector or industry a person typed, from the lists the weekly job stored. It never calls Yahoo.
const allow = createLimiter(60, 60_000);
const CACHE = "public, s-maxage=3600, stale-while-revalidate=86400";
const lists = isSectorFile(stored) ? stored.lists : [];

const fail = (status: number, error: string) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req: NextRequest) {
  const q = cleanQuery(req.nextUrl.searchParams.get("q"));
  if (!q) return fail(400, "Type at least 2 characters of a sector or industry, for example banks.");
  if (!allow(callerKey(req.headers))) return fail(429, "Too many searches in a short time. Try again in a minute.");
  if (lists.length === 0) return Response.json({ status: "unavailable", fetchedAt: null, sectors: [] }, { headers: { "Cache-Control": "public, s-maxage=60" } });
  const match = matchSector(q, lists);
  const body = match.status === "none" ? { ...match, sectors: sectorNames(lists) } : match;
  return Response.json({ ...body, fetchedAt: (stored as { fetchedAt: string | null }).fetchedAt }, { headers: { "Cache-Control": CACHE } });
}
