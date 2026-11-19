import { describe, expect, it } from "vitest";
import { ROE_ONLY_NOTE, buildSector, isRoeOnly, toStock } from "./builtSector";
import type { SectorList } from "./sectorLists";
import { benchmarkFor, verdict } from "./screen";
import type { Preview } from "./yahoo";

const prev = (ticker: string, o: { roe?: number | null; roce?: number | null; industry?: string | null } = {}): Preview =>
  ({
    ticker,
    name: ticker,
    yahooIndustry: o.industry ?? "Banks—Regional",
    yahooSector: "Financial Services",
    stock: { name: ticker, symbol: ticker.replace(".NS", ""), marketCap: 1, revenue: 1, profit: 1, roe: o.roe ?? 0.2, roce: o.roce ?? 0.4, pe: 10, price: 1, high52: 2, low52: 1, profitHistory: [1, 2, 3, 4], roe5y: 0.2, roceHistory: [0.4, 0.4, 0.4, 0.4], notes: ["from Yahoo"] },
    figures: {},
  }) as unknown as Preview;

const list = (symbols: string[]): SectorList => ({
  kind: "industry",
  name: "Banks—Regional",
  sector: "Financial Services",
  total: 41,
  stocks: symbols.map((symbol) => ({ symbol, name: symbol, marketCap: 1 })),
});
const at = (t: string) => ({ fetchedAt: t });

describe("isRoeOnly", () => {
  it("covers banks, lenders and insurers, not everything in Financial Services", () => {
    for (const i of ["Banks—Regional", "Banks—Diversified", "Insurance—Life", "Insurance Brokers", "Credit Services", "Mortgage Finance", "Financial Conglomerates"]) expect(isRoeOnly(i), i).toBe(true);
    for (const i of ["Asset Management", "Financial Data & Stock Exchanges", "Capital Markets", "Information Technology Services", null, undefined]) expect(isRoeOnly(i), String(i)).toBe(false);
  });
});

describe("toStock", () => {
  it("marks a bank ROE-only, drops its ROCE and adds the note", () => {
    const s = toStock(prev("SBIN.NS"));
    expect(s).toMatchObject({ roceNa: true, roce: null, roceHistory: null });
    expect(s.notes).toEqual(["from Yahoo", ROE_ONLY_NOTE]);
  });
  it("leaves other companies alone, and does not change the preview it was given", () => {
    const p = prev("INFY.NS", { industry: "Information Technology Services" });
    const s = toStock(p);
    expect(s.roceNa).toBeUndefined();
    expect(s.roce).toBe(0.4);
    toStock(prev("SBIN.NS"));
    expect(p.stock.notes).toEqual(["from Yahoo"]);
  });
});

describe("buildSector", () => {
  const l = list(["HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS", "KOTAKBANK.NS"]);
  const fetched = [
    { preview: prev("SBIN.NS", { roe: 0.17 }), ...at("2026-11-19T08:00:00Z") },
    { preview: prev("HDFCBANK.NS", { roe: 0.14 }), ...at("2026-11-18T08:00:00Z") },
    { preview: prev("ICICIBANK.NS", { roe: 0.18 }), ...at("2026-11-19T09:00:00Z") },
  ];
  const skipped = [{ symbol: "KOTAKBANK.NS", name: "Kotak", reason: "Yahoo has no data" }];

  it("keeps the list's order, not the order the answers arrived in", () => {
    const s = buildSector(l, fetched, skipped, []);
    expect(s.stocks.map((x) => x.symbol)).toEqual(["HDFCBANK", "ICICIBANK", "SBIN"]);
  });
  it("records where it came from, what was skipped and how old the oldest figure is", () => {
    const s = buildSector(l, fetched, skipped, []);
    expect(s.built).toMatchObject({ kind: "industry", yahooName: "Banks—Regional", parentSector: "Financial Services", total: 41, oldest: "2026-11-18T08:00:00Z", skipped });
    expect(s.name).toBe("Banks—Regional");
  });
  it("avoids the name of a sector already on the page", () => {
    expect(buildSector(l, fetched, [], ["Banks—Regional"]).name).toBe("Banks—Regional (Yahoo)");
  });
  it("shows the same screen result as a listed sector: ROE against the median of the others, Moderate at best", () => {
    const s = buildSector(l, fetched, [], []);
    const v = Object.fromEntries(s.stocks.map((x) => [x.symbol, verdict(x, benchmarkFor(x, s.stocks))]));
    // peers' median ROE is below the 15% floor for each, so the floor is the bar: 14% fails, 17% and 18% pass
    expect(v).toEqual({ HDFCBANK: "SKIP", ICICIBANK: "CONSIDER – Moderate", SBIN: "CONSIDER – Moderate" });
  });
  it("copes with nothing fetched", () => {
    const s = buildSector(l, [], skipped, []);
    expect(s.stocks).toEqual([]);
    expect(s.built?.oldest).toBeNull();
  });
});
