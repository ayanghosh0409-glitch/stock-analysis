import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db";
import { HOURLY_LIMIT } from "@/lib/figures";

// The route runs against an in-process Postgres, or against "no database", or against a database that is down.
const state = vi.hoisted(() => ({ db: null as Db | null, user: { id: "u1", email: "a@b.test", name: "A" } as { id: string; email: string; name: string | null } | null }));
vi.mock("@/lib/db", () => ({ getDb: () => state.db }));
// The sign-in itself is tested in auth.test.ts and api/auth; here a person is either signed in or a guest.
vi.mock("@/lib/authServer", async (orig) => ({ ...(await orig<typeof import("@/lib/authServer")>()), currentUser: async () => state.user }));

import { GET, POST } from "./route";

let pg: PGlite;
let n = 0;
const ip = () => `10.0.0.${++n}`; // a fresh caller per test, so the per-minute limiter does not carry over

const get = (q: string, from = ip()) => GET(new NextRequest(`http://site.test/api/figures${q}`, { headers: { "x-forwarded-for": from } }));
const post = (body: unknown, from = ip(), type = "application/json") =>
  POST(new NextRequest("http://site.test/api/figures", { method: "POST", headers: { "content-type": type, "x-forwarded-for": from }, body: typeof body === "string" ? body : JSON.stringify(body) }));
const entry = (percent: number, over: object = {}) => ({ ticker: "BANK.NS", field: "roce", percent, ...over });

beforeAll(() => {
  pg = new PGlite();
});
afterAll(async () => pg.close());
beforeEach(async () => {
  state.user = { id: "u1", email: "a@b.test", name: "A" };
  state.db = { query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await pg.query(sql, params)).rows as T[] }) };
  await pg.query("drop table if exists entered_figures");
  vi.spyOn(console, "error").mockImplementation(() => {});
  // a fresh Db object each time makes the route create the table again
});

describe("GET /api/figures", () => {
  it("refuses a missing or non-NSE/BSE ticker", async () => {
    expect((await get("")).status).toBe(400);
    expect((await get("?ticker=AAPL")).status).toBe(400);
  });

  it("says the feature is not configured when there is no database", async () => {
    state.db = null;
    const res = await get("?ticker=BANK.NS");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ configured: false, entered: {} });
  });

  it("returns nothing for a company nobody has entered figures for", async () => {
    const res = await get("?ticker=BANK.NS");
    expect(await res.json()).toEqual({ configured: true, entered: {} });
  });

  it("keeps working, flagged unavailable, when the database is down", async () => {
    state.db = { query: async () => Promise.reject(new Error("connection refused")) };
    const res = await get("?ticker=BANK.NS");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ unavailable: true, entered: {} });
  });
});

describe("POST /api/figures", () => {
  it("asks a guest to sign in and saves nothing, while reading stays open", async () => {
    state.user = null;
    const res = await post(entry(12));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sign in to add a figure.", reason: "sign-in" });
    expect(await (await get("?ticker=BANK.NS")).json()).toEqual({ configured: true, entered: {} });
  });

  it("saves a figure and then GET returns it for everyone", async () => {
    const res = await post(entry(18.5));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.entered.roce).toMatchObject({ value: 0.185, count: 1 });
    const again = await (await get("?ticker=BANK.NS")).json();
    expect(again.entered.roce.value).toBeCloseTo(0.185, 10);
  });

  it("returns the median once several entries exist, so one wild value does not win", async () => {
    for (const p of [14, 15, 150]) await post(entry(p));
    const body = await (await get("?ticker=BANK.NS")).json();
    expect(body.entered.roce).toMatchObject({ count: 3 });
    expect(body.entered.roce.value).toBeCloseTo(0.15, 10);
  });

  it("rejects bad input before touching the database", async () => {
    state.db = { query: async () => Promise.reject(new Error("must not be called")) };
    for (const bad of [entry(500), entry(-101), entry(Number.NaN), { ...entry(10), field: "pe" }, { ...entry(10), ticker: "AAPL" }, {}]) {
      expect((await post(bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect((await post("not json")).status).toBe(400);
  });

  it("requires a JSON body, which blocks cross-site form posts", async () => {
    expect((await post(entry(10), ip(), "application/x-www-form-urlencoded")).status).toBe(415);
    expect((await post(entry(10), ip(), "text/plain")).status).toBe(415);
  });

  it("says plainly that entering is off when there is no database", async () => {
    state.db = null;
    const res = await post(entry(10));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("not switched on");
  });

  it("limits how many figures one caller can enter in an hour", async () => {
    const me = ip();
    for (let i = 0; i < HOURLY_LIMIT; i++) expect((await post(entry(10 + (i % 5)), me)).status).toBe(201);
    const over = await post(entry(12), me);
    expect(over.status).toBe(429);
    expect((await over.json()).error).toContain(String(HOURLY_LIMIT));
    expect((await post(entry(12), ip())).status).toBe(201); // someone else is unaffected
  });

  it("reports a failed save without leaking the database error", async () => {
    state.db = { query: async () => Promise.reject(new Error("password authentication failed for user neondb_owner")) };
    const res = await post(entry(10));
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("neondb_owner");
  });
});
