import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db";
import type { SectorList } from "@/lib/sectorLists";

const state = vi.hoisted(() => ({
  db: null as Db | null,
  user: { id: "u1", email: "a@b.test", name: "A" } as { id: string; email: string; name: string | null } | null,
  fetchPreview: vi.fn(),
  list: {
    kind: "industry",
    name: "Banks—Regional",
    sector: "Financial Services",
    total: 41,
    stocks: [
      { symbol: "HDFCBANK.NS", name: "HDFC Bank", marketCap: 3 },
      { symbol: "SBIN.NS", name: "State Bank of India", marketCap: 2 },
      { symbol: "CANBK.NS", name: "Canara Bank", marketCap: 1 },
    ],
  } as SectorList,
}));
vi.mock("@/lib/db", () => ({ getDb: () => state.db }));
// The sign-in itself is tested in auth.test.ts and api/auth; here a person is either signed in or a guest.
vi.mock("@/lib/authServer", async (orig) => ({ ...(await orig<typeof import("@/lib/authServer")>()), currentUser: async () => state.user }));
vi.mock("../../../../data/sector-lists.json", () => ({ default: { fetchedAt: "2026-11-19T00:00:00Z", lists: [state.list] } }));
vi.mock("@/lib/yahoo-client", () => {
  class NotIndianListing extends Error {}
  class NothingFound extends Error {}
  class ForeignReporting extends Error {}
  return { NotIndianListing, NothingFound, ForeignReporting, fetchPreview: state.fetchPreview };
});

import { GET, POST } from "./route";
import { ForeignReporting } from "@/lib/yahoo-client";

let pg: PGlite;
let n = 0;
const ip = () => `10.4.0.${++n}`;
const post = (body: unknown, from = ip()) =>
  POST(new NextRequest("http://site.test/api/sectors", { method: "POST", headers: { "x-forwarded-for": from, "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));
const get = (from = ip()) => GET(new NextRequest("http://site.test/api/sectors", { headers: { "x-forwarded-for": from } }));
const preview = (ticker: string, name: string) => ({
  ticker,
  name,
  yahooIndustry: "Banks - Regional",
  stock: { name, symbol: ticker.replace(".NS", ""), roe: 0.16, roce: null, notes: [] },
  figures: {},
});
const yahooOk = () => state.fetchPreview.mockImplementation(async (t: string) => preview(t, t));

beforeAll(() => {
  pg = new PGlite();
});
afterAll(async () => pg.close());
beforeEach(async () => {
  state.user = { id: "u1", email: "a@b.test", name: "A" };
  await pg.query("drop table if exists shared_sectors");
  await pg.query("drop table if exists preview_cache");
  state.db = { query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await pg.query(sql, params)).rows as T[] }) };
  state.fetchPreview.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/sectors", () => {
  it("asks a guest to sign in, before reading the body or touching Yahoo or the database", async () => {
    state.user = null;
    const res = await post({ name: "Banks—Regional" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sign in to build a sector.", reason: "sign-in" });
    expect(state.fetchPreview).not.toHaveBeenCalled();
    expect((await get().then((r) => r.json())).sectors).toEqual([]);
  });

  it("builds the sector on the server, keeps it, and then GET shows it to everyone", async () => {
    yahooOk();
    const res = await post({ name: "Banks—Regional" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(true);
    expect(body.sector.built).toMatchObject({ shared: true, yahooName: "Banks—Regional", listsFetchedAt: "2026-11-19T00:00:00Z" });
    expect(body.sector.stocks.map((s: { symbol: string }) => s.symbol)).toEqual(["HDFCBANK", "SBIN", "CANBK"]);
    expect(body.sector.stocks.every((s: { roceNa?: boolean }) => s.roceNa)).toBe(true); // banks are judged on ROE alone
    const list = await (await get()).json();
    expect(list.sectors.map((s: { name: string }) => s.name)).toEqual(["Banks—Regional"]);
  });

  it("uses what the Yahoo cache already holds and asks Yahoo only for what is missing", async () => {
    yahooOk();
    await pg.query("create table preview_cache (ticker text primary key, payload jsonb not null, fetched_at timestamptz not null default now())");
    for (const t of ["HDFCBANK.NS", "SBIN.NS"]) await pg.query("insert into preview_cache (ticker, payload) values ($1, $2::jsonb)", [t, JSON.stringify(preview(t, t))]);
    await post({ name: "Banks—Regional" });
    expect(state.fetchPreview).toHaveBeenCalledTimes(1);
    expect(state.fetchPreview.mock.calls[0][0]).toBe("CANBK.NS");
  });

  it("never takes figures from the request body", async () => {
    yahooOk();
    const body = await (await post({ name: "Banks—Regional", stocks: [{ symbol: "FAKE", roe: 9 }], sector: { name: "Fake" } })).json();
    expect(JSON.stringify(body)).not.toContain("FAKE");
    expect(body.sector.name).toBe("Banks—Regional");
  });

  it("returns the shared copy without asking Yahoo again while it is fresh", async () => {
    yahooOk();
    await post({ name: "Banks—Regional" });
    state.fetchPreview.mockClear();
    const again = await (await post({ name: "Banks—Regional" })).json();
    expect(again.created).toBe(false);
    expect(state.fetchPreview).not.toHaveBeenCalled();
  });

  it("rebuilds a copy that is more than a week old", async () => {
    yahooOk();
    await post({ name: "Banks—Regional" });
    await pg.query("update shared_sectors set payload = jsonb_set(payload, '{built,builtAt}', to_jsonb((now() - interval '8 days')::text))");
    await pg.query("update preview_cache set fetched_at = now() - interval '8 days'");
    state.fetchPreview.mockClear();
    const body = await (await post({ name: "Banks—Regional" })).json();
    expect(body.created).toBe(false);
    expect(state.fetchPreview).toHaveBeenCalledTimes(3);
    expect(Date.now() - Date.parse(body.sector.built.builtAt)).toBeLessThan(10_000);
  });

  it("leaves out a company Yahoo can never give, and says why", async () => {
    state.fetchPreview.mockImplementation(async (t: string) => {
      if (t === "SBIN.NS") throw new ForeignReporting();
      return preview(t, t);
    });
    const body = await (await post({ name: "Banks—Regional" })).json();
    expect(body.sector.stocks).toHaveLength(2);
    expect(body.sector.built.skipped).toEqual([{ symbol: "SBIN.NS", name: "State Bank of India", reason: expect.stringContaining("foreign currency") }]);
  });

  it("does not keep a sector when Yahoo simply did not answer for some companies", async () => {
    state.fetchPreview.mockImplementation(async (t: string) => {
      if (t === "SBIN.NS") throw new Error("socket hang up");
      return preview(t, t);
    });
    const res = await post({ name: "Banks—Regional" });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/1 of the 3 companies/);
    expect((await (await get()).json()).sectors).toEqual([]);
  });

  it("refuses a name that is not one of the stored sectors", async () => {
    for (const b of [{ name: "Banks" }, { name: "" }, {}, "not json", { name: 5 }]) expect((await post(b)).status).toBe(400);
    expect(state.fetchPreview).not.toHaveBeenCalled();
  });

  it("says plainly that sharing needs the database when there is none", async () => {
    state.db = null;
    const res = await post({ name: "Banks—Regional" });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ reason: "no-database" });
  });

  it("slows a caller who keeps saving sectors", async () => {
    yahooOk();
    const from = ip();
    const codes: number[] = [];
    for (let i = 0; i < 8; i++) codes.push((await post({ name: "Banks—Regional" }, from)).status);
    expect(codes.slice(0, 6).every((c) => c === 200)).toBe(true);
    expect(codes.slice(6)).toEqual([429, 429]);
  });
});

describe("GET /api/sectors", () => {
  it("is an empty list with no database or nothing shared yet", async () => {
    expect(await (await get()).json()).toEqual({ sectors: [] });
    state.db = null;
    expect(await (await get()).json()).toEqual({ sectors: [] });
  });

  it("can be cached for a short while", async () => {
    expect((await get()).headers.get("Cache-Control")).toMatch(/s-maxage=30/);
  });
});
