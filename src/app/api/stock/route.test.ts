import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db";

const state = vi.hoisted(() => ({ db: null as Db | null, fetchPreview: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: () => state.db }));
vi.mock("@/lib/yahoo-client", () => {
  class NotIndianListing extends Error {}
  class NothingFound extends Error {}
  class ForeignReporting extends Error {}
  return { NotIndianListing, NothingFound, ForeignReporting, fetchPreview: state.fetchPreview };
});

import { GET } from "./route";
import { ForeignReporting } from "@/lib/yahoo-client";

let pg: PGlite;
let n = 0;
const get = (q: string, from = `10.3.0.${++n}`) => GET(new NextRequest(`http://site.test/api/stock${q}`, { headers: { "x-forwarded-for": from } }));
const preview = (name = "State Bank of India") => ({ ticker: "SBIN.NS", name, stock: { name, symbol: "SBIN" }, figures: {} });

beforeAll(() => {
  pg = new PGlite();
});
afterAll(async () => pg.close());
beforeEach(async () => {
  await pg.query("drop table if exists preview_cache");
  state.db = { query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await pg.query(sql, params)).rows as T[] }) };
  state.fetchPreview.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/stock", () => {
  it("refuses a ticker that is not NSE or BSE", async () => {
    expect((await get("?ticker=AAPL")).status).toBe(400);
    expect(state.fetchPreview).not.toHaveBeenCalled();
  });

  it("fetches from Yahoo the first time and stores it", async () => {
    state.fetchPreview.mockResolvedValue(preview());
    const body = await (await get("?ticker=sbin.ns")).json();
    expect(body).toMatchObject({ preview: { ticker: "SBIN.NS" }, cached: false });
    expect(state.fetchPreview).toHaveBeenCalledTimes(1);
    expect((await pg.query("select count(*)::int as n from preview_cache")).rows[0]).toEqual({ n: 1 });
  });

  it("serves the second request from the database without asking Yahoo", async () => {
    state.fetchPreview.mockResolvedValue(preview());
    await get("?ticker=SBIN.NS");
    const body = await (await get("?ticker=SBIN.NS")).json();
    expect(body).toMatchObject({ cached: true, preview: { name: "State Bank of India" } });
    expect(typeof body.fetchedAt).toBe("string");
    expect(state.fetchPreview).toHaveBeenCalledTimes(1);
  });

  it("asks Yahoo again once the stored copy is a week old", async () => {
    state.fetchPreview.mockResolvedValue(preview());
    await get("?ticker=SBIN.NS");
    await pg.query("update preview_cache set fetched_at = now() - interval '8 days'");
    state.fetchPreview.mockResolvedValue(preview("SBI, refreshed"));
    expect((await (await get("?ticker=SBIN.NS")).json()).preview.name).toBe("SBI, refreshed");
    expect(state.fetchPreview).toHaveBeenCalledTimes(2);
  });

  it("works with no database", async () => {
    state.db = null;
    state.fetchPreview.mockResolvedValue(preview());
    expect(await (await get("?ticker=SBIN.NS")).json()).toMatchObject({ cached: false });
  });

  it("still answers from Yahoo when the database is down, on read and on write", async () => {
    state.db = { query: async () => Promise.reject(new Error("connection refused")) };
    state.fetchPreview.mockResolvedValue(preview());
    const res = await get("?ticker=SBIN.NS");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ cached: false, preview: { ticker: "SBIN.NS" } });
  });

  it("does not store a failure, and explains a foreign-currency reporter", async () => {
    state.fetchPreview.mockRejectedValue(new ForeignReporting("INFY.NS reports in USD"));
    const res = await get("?ticker=INFY.NS");
    expect(res.status).toBe(422);
    expect((await pg.query("select count(*)::int as n from preview_cache")).rows[0]).toEqual({ n: 0 });
  });
});
