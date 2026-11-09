import { describe, expect, it } from "vitest";
import data from "../../data/stocks.json";
import type { Dataset, Stock } from "./types";
import {
  benchmarkFor,
  benchmarks,
  explain,
  isBorderline,
  isLossMaking,
  median,
  peerHealth,
  profitTrend,
  roeMargin,
  verdict,
  type Verdict,
} from "./screen";

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

/** Builds a sector from ROE values, with a unique symbol each. ROCE defaults to ROE. */
const sector = (roes: number[], roce?: number[]): Stock[] =>
  roes.map((roe, i) => stock({ symbol: `S${i}`, name: `S${i}`, roe, roce: roce ? roce[i] : roe }));

const verdicts = (stocks: Stock[], o?: Parameters<typeof benchmarkFor>[2]): Verdict[] =>
  stocks.map((s) => verdict(s, benchmarkFor(s, stocks, o)));

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

describe("benchmark", () => {
  it("leaves the stock out of its own benchmark", () => {
    const peers = sector([0.16, 0.18, 0.2, 0.22, 0.6]);
    expect(benchmarks(peers).medianRoe).toBeCloseTo(0.2); // whole sector
    const b = benchmarkFor(peers[0], peers); // 0.16 judged against 0.18, 0.20, 0.22, 0.60
    expect(b.medianRoe).toBeCloseTo(0.21);
    expect(b.peers).toBe(4);
    expect(benchmarkFor(peers[4], peers).medianRoe).toBeCloseTo(0.19); // the outlier no longer lifts its own bar
  });

  it("leaves loss-making companies out of the median", () => {
    expect(isLossMaking(stock({ roe: -0.1, profit: -5 }))).toBe(true);
    expect(isLossMaking(stock({ roe: 0.1, profit: 0 }))).toBe(true);
    expect(isLossMaking(stock({ roe: 0.1, profit: 5 }))).toBe(false);
    const peers = [
      ...sector([0.2, 0.2, 0.2]),
      stock({ symbol: "L1", roe: -0.4, roce: -0.3, profit: -10 }),
      stock({ symbol: "L2", roe: -0.5, roce: -0.4, profit: -20 }),
    ];
    expect(benchmarks(peers).medianRoe).toBeCloseTo(0.2);
    expect(benchmarks(peers).peers).toBe(3);
  });

  it("is only as high as the floor when peers are weak", () => {
    const b = benchmarks(sector([0.03, 0.05, 0.07]));
    expect(b.roe).toBeCloseTo(0.05);
    expect(b.threshold).toBeCloseTo(0.15);
  });

  it("uses an override in place of the median, and an override floor in place of the default", () => {
    const peers = sector([0.1, 0.12, 0.14]);
    expect(benchmarks(peers, { roe: 0.25, roce: null }).threshold).toBeCloseTo(0.25);
    expect(benchmarks(peers, { roe: null, roce: null, floor: 0.05 }).threshold).toBeCloseTo(0.12);
  });
});

describe("verdict", () => {
  it("skips every stock in a weak sector, instead of passing the better half", () => {
    const weak = sector([0.03, 0.04, 0.05, 0.06, 0.07, 0.08]);
    expect(verdicts(weak).every((v) => v === "SKIP")).toBe(true);
    // With the floor removed the old behaviour returns: the better half pass.
    expect(verdicts(weak, { roe: null, roce: null, floor: 0 }).filter((v) => v !== "SKIP")).toHaveLength(3);
  });

  it("compares strictly, so a stock exactly at the cut-off is skipped", () => {
    const peers = sector([0.2, 0.2, 0.2]);
    const b = benchmarkFor(peers[0], peers);
    expect(b.threshold).toBeCloseTo(0.2);
    expect(verdict(peers[0], b)).toBe("SKIP");
  });

  it("separates Strong from Moderate on ROCE", () => {
    const peers = sector([0.3, 0.2, 0.2, 0.2], [0.5, 0.2, 0.2, 0.2]);
    const [top, ...rest] = peers;
    expect(verdict(top, benchmarkFor(top, peers))).toBe("CONSIDER – Strong");
    const lowRoce = stock({ symbol: "M", roe: 0.3, roce: 0.1 });
    expect(verdict(lowRoce, benchmarkFor(lowRoce, [...rest, lowRoce]))).toBe("CONSIDER – Moderate");
  });

  it("returns n/a when ROE or ROCE is missing, or when there is nothing to compare with", () => {
    const peers = sector([0.2, 0.25, 0.3]);
    const noRoe = stock({ symbol: "N", roe: null });
    expect(verdict(noRoe, benchmarkFor(noRoe, peers))).toBe("n/a");
    const alone = stock({ symbol: "A" });
    expect(verdict(alone, benchmarkFor(alone, [alone]))).toBe("n/a");
  });
});

describe("margin and borderline", () => {
  it("reports ROE minus the cut-off", () => {
    const b = benchmarks([], { roe: 0.2, roce: null });
    expect(roeMargin(stock({ roe: 0.232 }), b)).toBeCloseTo(0.032);
    expect(roeMargin(stock({ roe: 0.18 }), b)).toBeCloseTo(-0.02);
    expect(roeMargin(stock({ roe: null }), b)).toBeNull();
  });

  it("marks anything within 2 points of the cut-off, on either side, as borderline", () => {
    const b = benchmarks([], { roe: 0.211, roce: null });
    expect(isBorderline(stock({ roe: 0.231 }), b)).toBe(true); // exactly 2.0 points above
    expect(isBorderline(stock({ roe: 0.191 }), b)).toBe(true); // exactly 2.0 points below
    expect(isBorderline(stock({ roe: 0.2311 }), b)).toBe(false);
    expect(isBorderline(stock({ roe: 0.4 }), b)).toBe(false);
  });

  it("explains a close call and names the floor when it is what binds", () => {
    const b = benchmarks([], { roe: 0.1, roce: 0.1 });
    const text = explain(stock({ roe: 0.14, roce: 0.2 }), b);
    expect(text).toContain("15.0% minimum ROE");
    expect(text).toContain("skipped");
    expect(text).toContain("close");
    expect(explain(stock({ roe: 0.4, roce: 0.4 }), b)).not.toContain("close");
  });
});

describe("peer health", () => {
  it("is ok for a deep, profitable and compact peer set", () => {
    const h = peerHealth(sector([0.15, 0.16, 0.17, 0.18, 0.19, 0.2, 0.21, 0.22, 0.23, 0.24]));
    expect(h.level).toBe("ok");
    expect(h.reasons).toHaveLength(0);
  });

  it("is poor when the set is thin and has loss-making companies", () => {
    const peers = [
      ...sector([0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4]),
      stock({ symbol: "L1", roe: -0.2, profit: -1 }),
      stock({ symbol: "L2", roe: -0.3, profit: -1 }),
    ];
    const h = peerHealth(peers);
    expect(h.level).toBe("poor");
    expect(h.lossMaking).toBe(2);
    expect(h.reasons).toHaveLength(2);
  });

  it("is caution when ROE varies widely, and poor with fewer than 5 peers", () => {
    expect(peerHealth(sector([0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.5, 0.6, 0.7, 0.8])).level).toBe("caution");
    expect(peerHealth(sector([0.2, 0.21, 0.22, 0.23])).level).toBe("poor");
  });
});

describe("real data", () => {
  const sectors = (data as Dataset).sectors;

  it("no longer passes about half of every sector by construction", () => {
    const counts = sectors.map((sec) => {
      const v = verdicts(sec.stocks);
      return [
        sec.name,
        v.filter((x) => x === "CONSIDER – Strong").length,
        v.filter((x) => x === "CONSIDER – Moderate").length,
        v.filter((x) => x === "SKIP").length,
      ];
    });
    // Before the redesign this was IT 5/0/6, Auto 4/1/5, Auto Components 4/1/6,
    // Auto Batteries 4/1/5, Pharma 4/1/5, FMCG 4/1/5 (30 of 62 passed).
    expect(counts).toEqual([
      ["IT", 6, 0, 5],
      ["Auto", 4, 1, 5],
      ["Auto Components", 3, 0, 8],
      ["Auto Batteries", 3, 0, 7],
      ["Pharma", 4, 1, 5],
      ["FMCG", 4, 1, 5],
    ]);
  });

  it("grades the Auto Batteries peer set as poor and FMCG as a caution", () => {
    const level = Object.fromEntries(sectors.map((s) => [s.name, peerHealth(s.stocks).level]));
    expect(level).toEqual({
      IT: "ok",
      Auto: "ok",
      "Auto Components": "ok",
      "Auto Batteries": "poor",
      Pharma: "ok",
      FMCG: "caution",
    });
  });
});
