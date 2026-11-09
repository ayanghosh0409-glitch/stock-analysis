import { describe, expect, it } from "vitest";
import data from "../../data/stocks.json";
import type { Dataset, Stock } from "./types";
import { benchmarks, median, profitTrend, verdict } from "./screen";

const stock = (o: Partial<Stock> = {}): Stock => ({
  name: "X",
  symbol: "X",
  marketCap: 1,
  revenue: 1,
  profit: 1,
  roe: 0.2,
  roce: 0.2,
  pe: 10,
  price: 1,
  high52: 1,
  low52: 1,
  profitHistory: null,
  roe5y: null,
  roceHistory: null,
  notes: [],
  ...o,
});

describe("median", () => {
  it("handles odd and even lengths", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  it("ignores null and non-finite values, and returns null when nothing is left", () => {
    expect(median([null, 5, undefined, 1])).toBe(3);
    expect(median([null, undefined])).toBeNull();
  });
});

describe("profitTrend", () => {
  it("rates steady growth as Consistent", () => {
    const t = profitTrend(stock({ profitHistory: [100, 120, 140, 160, 180] }));
    expect(t.consistency).toBe("Consistent");
    expect(t.growthYears).toBe(4);
    expect(t.hasLoss).toBe(false);
  });
  it("rates an early loss followed by growth every year as Recovering", () => {
    expect(profitTrend(stock({ profitHistory: [-10, 20, 40, 60, 80] })).consistency).toBe("Recovering");
  });
  it("rates a loss year without steady recovery as Weak", () => {
    expect(profitTrend(stock({ profitHistory: [100, -5, 50, 40, 60] })).consistency).toBe("Weak");
  });
  it("rates uneven growth with no loss as Mixed", () => {
    expect(profitTrend(stock({ profitHistory: [100, 90, 120, 110, 130] })).consistency).toBe("Mixed");
  });
  it("needs at least four annual values", () => {
    expect(profitTrend(stock({ profitHistory: [100, null, null, null, 120] })).consistency).toBe("Insufficient data");
    expect(profitTrend(stock({ profitHistory: null })).consistency).toBe("Insufficient data");
  });
  it("reports growth as not meaningful when the first or last year is not positive", () => {
    expect(profitTrend(stock({ profitHistory: [-10, 20, 40, 60, 80] })).cagr).toBe("n/m");
  });
});

describe("current rule (baseline before the benchmark redesign)", () => {
  it("compares strictly, so a stock exactly at the benchmark is skipped", () => {
    const b = benchmarks([stock({ roe: 0.1 }), stock({ roe: 0.2 }), stock({ roe: 0.3 })]);
    expect(b.roe).toBeCloseTo(0.2);
    expect(verdict(stock({ roe: 0.2, roce: 0.5 }), b)).toBe("SKIP");
  });

  it("passes roughly half of every sector on the real data, however weak the sector is", () => {
    const counts = (data as Dataset).sectors.map((sec) => {
      const b = benchmarks(sec.stocks);
      const v = sec.stocks.map((s) => verdict(s, b));
      return [
        sec.name,
        v.filter((x) => x === "CONSIDER – Strong").length,
        v.filter((x) => x === "CONSIDER – Moderate").length,
        v.filter((x) => x === "SKIP").length,
      ];
    });
    expect(counts).toEqual([
      ["IT", 5, 0, 6],
      ["Auto", 4, 1, 5],
      ["Auto Components", 4, 1, 6],
      ["Auto Batteries", 4, 1, 5],
      ["Pharma", 4, 1, 5],
      ["FMCG", 4, 1, 5],
    ]);
  });
});
