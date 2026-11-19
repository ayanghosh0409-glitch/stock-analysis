import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const file = vi.hoisted(() => ({
  data: {
    fetchedAt: "2026-11-19",
    lists: [
      { kind: "sector", name: "Financial Services", sector: null, total: 279, stocks: [{ symbol: "HDFCBANK.NS", name: "HDFC Bank Limited", marketCap: 1248124 }] },
      { kind: "industry", name: "Banks—Regional", sector: "Financial Services", total: 41, stocks: [{ symbol: "SBIN.NS", name: "State Bank of India", marketCap: 1054737 }] },
      { kind: "industry", name: "Drug Manufacturers—Specialty & Generic", sector: "Healthcare", total: 104, stocks: [{ symbol: "SUNPHARMA.NS", name: "Sun Pharma", marketCap: 453714 }] },
      { kind: "industry", name: "Drug Manufacturers—General", sector: "Healthcare", total: 14, stocks: [{ symbol: "ABBOTINDIA.NS", name: "Abbott India", marketCap: 1 }] },
    ],
  } as unknown,
}));
vi.mock("../../../../data/sector-lists.json", () => ({ default: file.data }));

import { GET } from "./route";

let n = 0;
const get = (q: string, from = `10.1.0.${++n}`) => GET(new NextRequest(`http://site.test/api/sector${q}`, { headers: { "x-forwarded-for": from } }));

describe("GET /api/sector", () => {
  it("refuses a missing or too short search", async () => {
    expect((await get("")).status).toBe(400);
    expect((await get("?q=a")).status).toBe(400);
    expect((await get("?q=" + "x".repeat(41))).status).toBe(400);
  });

  it("returns the stored top stocks for a sector that exists, with no Yahoo call", async () => {
    const res = await get("?q=banks");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("s-maxage");
    expect(await res.json()).toMatchObject({ status: "found", fetchedAt: "2026-11-19", list: { name: "Banks—Regional", stocks: [{ symbol: "SBIN.NS" }] } });
  });

  it("asks which one when several match", async () => {
    const body = await (await get("?q=pharma")).json();
    expect(body.status).toBe("choose");
    expect(body.options.map((o: { name: string }) => o.name)).toEqual(["Drug Manufacturers—Specialty & Generic", "Drug Manufacturers—General"]);
    expect(body.options[0]).not.toHaveProperty("stocks");
  });

  it("suggests the nearest names, and lists the sectors, when nothing matches", async () => {
    const body = await (await get("?q=financal servics")).json();
    expect(body.status).toBe("none");
    expect(body.suggestions[0].name).toBe("Financial Services");
    expect(body.sectors).toEqual(["Financial Services"]);
    const nothing = await (await get("?q=zzzzqq")).json();
    expect(nothing).toMatchObject({ status: "none", suggestions: [] });
  });

  it("slows a caller who searches too often", async () => {
    const same = "10.9.9.9";
    for (let i = 0; i < 60; i++) expect((await get("?q=banks", same)).status).toBe(200);
    expect((await get("?q=banks", same)).status).toBe(429);
  });
});
