import { describe, expect, it } from "vitest";
import taxonomy from "../../data/yahoo-taxonomy.json";
import { TOP_N, isSectorFile, screenerBody, toListedStocks } from "./sectorLists";

const CR = 1e7;

describe("screenerBody", () => {
  it("asks for Indian NSE equities in the one sector or industry, largest first", () => {
    const b = screenerBody("industry", "Banks—Regional");
    expect(b.size).toBe(TOP_N);
    expect(b.sortField).toBe("intradaymarketcap");
    expect(b.sortType).toBe("DESC");
    expect(b.query.operands).toEqual([
      { operator: "eq", operands: ["region", "in"] },
      { operator: "eq", operands: ["exchange", "NSI"] },
      { operator: "eq", operands: ["industry", "Banks—Regional"] },
    ]);
  });
});

describe("toListedStocks", () => {
  const row = (o: object) => ({ symbol: "HDFCBANK.NS", longName: "HDFC Bank Limited", marketCap: 1_248_124 * CR, ...o });
  it("converts rupees to crore and keeps the order", () => {
    expect(toListedStocks([row({}), row({ symbol: "SBIN.NS", longName: "State Bank of India", marketCap: 1_054_737 * CR })])).toEqual([
      { symbol: "HDFCBANK.NS", name: "HDFC Bank Limited", marketCap: 1248124 },
      { symbol: "SBIN.NS", name: "State Bank of India", marketCap: 1054737 },
    ]);
  });
  it("drops BSE tickers, duplicates, and rows without a usable market cap", () => {
    const out = toListedStocks([row({}), row({}), row({ symbol: "500180.BO" }), row({ symbol: "A.NS", marketCap: undefined }), row({ symbol: "B.NS", marketCap: 0 }), null, "x"]);
    expect(out.map((s) => s.symbol)).toEqual(["HDFCBANK.NS"]);
  });
  it("falls back to the short name, then the symbol", () => {
    expect(toListedStocks([row({ longName: undefined, shortName: "HDFC BANK" })])[0].name).toBe("HDFC BANK");
    expect(toListedStocks([row({ longName: undefined })])[0].name).toBe("HDFCBANK.NS");
  });
  it("returns nothing for a non-list", () => {
    expect(toListedStocks(undefined)).toEqual([]);
    expect(toListedStocks({})).toEqual([]);
  });
});

describe("isSectorFile", () => {
  const list = (o: object = {}) => ({ kind: "industry", name: "Banks—Regional", sector: "Financial Services", total: 41, stocks: [{ symbol: "SBIN.NS", name: "SBI", marketCap: 1 }], ...o });
  it("accepts a well-formed file and an empty one", () => {
    expect(isSectorFile({ fetchedAt: "2026-11-19", lists: [list()] })).toBe(true);
    expect(isSectorFile({ fetchedAt: null, lists: [] })).toBe(true);
  });
  it("refuses malformed lists, and more than the top ten", () => {
    expect(isSectorFile(null)).toBe(false);
    expect(isSectorFile({ lists: "x" })).toBe(false);
    expect(isSectorFile({ lists: [list({ kind: "other" })] })).toBe(false);
    expect(isSectorFile({ lists: [list({ stocks: Array.from({ length: TOP_N + 1 }, (_, i) => ({ symbol: `A${i}.NS`, name: "A", marketCap: 1 })) })] })).toBe(false);
  });
});

describe("the stored taxonomy", () => {
  it("has Yahoo's 11 sectors, 145 industries, and the long-dash spelling Yahoo's screener needs", () => {
    const t = taxonomy.sectors as Record<string, string[]>;
    expect(Object.keys(t)).toHaveLength(11);
    expect(Object.values(t).flat()).toHaveLength(145);
    expect(t["Financial Services"]).toContain("Banks—Regional");
    expect(Object.values(t).flat().some((n) => n.includes(" - "))).toBe(false);
  });
});
