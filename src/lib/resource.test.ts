import { describe, expect, it } from "vitest";
import { cleanNotes, compare, mergeStock, report, tickersFor } from "./resource";
import type { Dataset, Stock } from "./types";
import { buildPreview, type RawYahoo, type StatementYear } from "./yahoo";

const CR = 1e7;
const SECTORS = ["IT", "Pharma"];
const NOW = new Date("2026-11-18T00:00:00Z");
const yr = (date: string, o: Partial<StatementYear>): StatementYear => ({ date, ...o });

function raw(over: Partial<RawYahoo> = {}, ni = [1500, 1800, 2100, 2400]): RawYahoo {
  const eq = [9000, 10000, 11000, 12000];
  const ebit = [2000, 2400, 2800, 3300];
  const dates = ["2023-03-31", "2024-03-31", "2025-03-31", "2026-03-31"];
  return {
    ticker: "ABC.NS", name: "ABC Industries Limited", currency: "INR", price: 250.5, marketCap: 50_000 * CR, high52: 300, low52: 200, pe: 20,
    trailingProfit: 2500 * CR, yahooRoe: 0.2, revenueTTM: 20_000 * CR, sector: "Technology", industry: "Information Technology Services", errors: [],
    years: dates.map((d, i) => yr(d, { netIncome: ni[i] * CR, ebit: ebit[i] * CR, equity: eq[i] * CR, totalAssets: (14000 + i * 1000) * CR, currentLiabilities: 4000 * CR })),
    ...over,
  };
}
const old = (o: Partial<Stock> = {}): Stock => ({
  name: "ABC Industries", symbol: "ABC", marketCap: 1, revenue: 1, profit: 1, roe: 0.3, roce: 0.3, pe: 10, price: 1, high52: 2, low52: 1,
  profitHistory: [1, 2, 3, 4, 5], roe5y: 0.3, roceHistory: [0.3, 0.3, 0.3, 0.3, 0.3], notes: ["Price is intraday 9 Nov 2026."], ...o,
});

describe("tickersFor", () => {
  it("uses .NS by default, .BO for BSE codes, and the overrides where the default is wrong", () => {
    expect(tickersFor("TCS")).toEqual(["TCS.NS"]);
    expect(tickersFor("M&M")).toEqual(["M&M.NS"]);
    expect(tickersFor("540005")).toEqual(["540005.BO"]);
    expect(tickersFor("LTM")).toEqual(["LTM.NS", "LTIM.NS"]);
    expect(tickersFor("504093")).toEqual(["PANAENERG.BO"]);
  });
});

describe("cleanNotes", () => {
  it("removes sentences that only described the Screener page and keeps what is about the company", () => {
    const r = cleanNotes([
      "Price is intraday 9 Nov 2026; others are the last close shown (6-8 Nov).",
      "Standalone figures. History: December year-end - FY22..FY26 columns show CY2021..CY2025.",
      "Other income is ~22% of TTM pre-tax profit, which lifts reported profit above operating profit.",
      "Formerly LTIMindtree (same BSE code 540005).",
      "Dry-cell batteries. Micro-cap. Price is 26 Oct close, TTM to Jun 2026, basis not stated. NSE symbol not confirmed - BSE code shown.",
    ]);
    expect(r.kept).toEqual([
      "History: December year-end - FY22..FY26 columns show CY2021..CY2025.",
      "Other income is ~22% of TTM pre-tax profit, which lifts reported profit above operating profit.",
      "Formerly LTIMindtree (same BSE code 540005).",
      "Dry-cell batteries. Micro-cap.",
    ]);
    expect(r.dropped).toHaveLength(4);
  });
  it("flags kept notes that name specific years", () => {
    const r = cleanNotes(["History: FY22 profit includes one-off other income.", "Makes cables."]);
    expect(r.recheck).toEqual(["History: FY22 profit includes one-off other income."]);
  });
});

describe("mergeStock", () => {
  it("takes Yahoo's figures, keeps the site's name and symbol, and drops notes about the old source", () => {
    const m = mergeStock(old(), buildPreview(raw(), SECTORS, NOW));
    expect(m.fromYahoo).toBe(true);
    expect(m.stock).toMatchObject({ name: "ABC Industries", symbol: "ABC", price: 250.5, marketCap: 50000, notes: [] });
    expect(m.stock.roe).toBeCloseTo(2400 / 11500, 6); // latest profit over the average of the last two equities
    expect(m.stock.profitHistory).toEqual([1500, 1800, 2100, 2400]);
    expect(m.stock.historyLabels).toEqual(["FY23", "FY24", "FY25", "FY26"]);
  });
  it("works out yearly ROCE and average ROE over the years Yahoo allows", () => {
    const s = mergeStock(old(), buildPreview(raw(), SECTORS, NOW)).stock;
    expect(s.roceHistory).toHaveLength(4);
    expect(s.roceHistory![0]).toBeNull(); // the first year has no earlier year to average with
    expect(s.roceHistory!.slice(1).every((x) => typeof x === "number")).toBe(true);
    expect(s.roe5y).toBeGreaterThan(0.15);
  });
  it("keeps the old stock whole, and says why, when Yahoo lacks a figure the screen needs", () => {
    const noCapital = raw({ years: raw().years.map((y) => ({ ...y, currentLiabilities: undefined })) });
    const m = mergeStock(old(), buildPreview(noCapital, SECTORS, NOW));
    expect(m.fromYahoo).toBe(false);
    expect(m.stock).toEqual(old());
    expect(m.missing.join(" ")).toContain("ROCE");
  });
  it("keeps the old stock when there are fewer than four years of profit", () => {
    const m = mergeStock(old(), buildPreview(raw({ years: raw().years.slice(-3) }), SECTORS, NOW));
    expect(m.fromYahoo).toBe(false);
    expect(m.missing.join(" ")).toContain("annual profit");
  });
  it("keeps the old stock when Yahoo could not be reached", () => {
    const m = mergeStock(old(), null, "ABC.NS: YahooUnreachable: timed out");
    expect(m).toMatchObject({ fromYahoo: false, missing: ["ABC.NS: YahooUnreachable: timed out"] });
    expect(m.stock).toEqual(old());
  });
});

describe("compare and report", () => {
  const sec = (name: string, stocks: Stock[]) => ({ name, title: name, stocks });
  const peers = (roes: number[]) => roes.map((roe, i) => old({ symbol: `P${i}`, name: `Peer ${i}`, roe, roce: 0.2, profit: 10 }));
  const before: Dataset = { asOf: "2026-11-01", units: "", sectors: [sec("IT", [old({ symbol: "ABC", roe: 0.3, roce: 0.3 }), ...peers([0.18, 0.2, 0.22, 0.24, 0.26])])] };
  const afterStock = old({ symbol: "ABC", roe: 0.12, roce: 0.3, profitHistory: [1, 2, 3, 4] });
  const after: Dataset = { ...before, sectors: [sec("IT", [afterStock, ...peers([0.18, 0.2, 0.22, 0.24, 0.26])])] };

  it("judges each dataset against its own peers and flags a verdict that changes", () => {
    const { rows } = compare(before, after, new Set(["ABC"]));
    const abc = rows.find((r) => r.symbol === "ABC")!;
    expect(abc.before.verdict).toBe("CONSIDER – Strong");
    expect(abc.after.verdict).toBe("SKIP");
    expect(abc.changed).toBe(true);
    // a stock leaving the peer group also moves the cut-off its peers face, so other verdicts may shift too
    expect(rows.filter((r) => r.changed).map((r) => r.symbol)).toContain("ABC");
  });
  it("counts verdicts per sector before and after", () => {
    const { sectors } = compare(before, after, new Set(["ABC"]));
    expect(sectors[0].before["CONSIDER – Strong"]).toBeGreaterThan(sectors[0].after["CONSIDER – Strong"]);
  });
  it("writes a report that names the change, the kept stocks and the notes", () => {
    const { rows, sectors } = compare(before, after, new Set(["ABC"]));
    const merges = new Map([
      ["ABC", { stock: afterStock, fromYahoo: true, missing: [], dropped: ["Price is intraday."], recheck: ["History: FY22 one-off."] }],
      ["P0", { stock: before.sectors[0].stocks[1], fromYahoo: false, missing: ["ROCE (Yahoo gives no current liabilities)"], dropped: [], recheck: [] }],
    ]);
    const text = report({ rows, sectors, merges, total: rows.length, when: "now" });
    expect(text).toContain("1 of 6 stocks now use Yahoo's figures");
    expect(text).toContain("| ABC | IT | 30.0% → 12.0% | 30.0% → 30.0% | Strong → **Skip** |");
    expect(text).toContain("**P0** (IT): ROCE (Yahoo gives no current liabilities)");
    expect(text).toContain("Price is intraday.");
    expect(text).toContain("History: FY22 one-off.");
  });
});
