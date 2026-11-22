import { describe, expect, it } from "vitest";
import type { Consistency, Verdict } from "./screen";
import {
  GROUPS,
  PAGE_SIZE,
  against,
  countGroups,
  filterItems,
  groupOf,
  isFiltered,
  sectionsForPage,
  sortGrouped,
  stepsLabel,
  trendSteps,
  type Item,
} from "./sectorPage";
import { bucketCounts } from "./sectorsPage";

let n = 0;
const item = (
  name: string,
  verdict: Verdict,
  o: Partial<{ roe: number | null; roce: number | null; margin: number | null; borderline: boolean; consistency: Consistency; floor: number; history: (number | null)[] }> = {},
): Item => ({
  stock: { name, symbol: `S${n++}`, roe: o.roe === undefined ? 0.2 : o.roe, roce: o.roce === undefined ? 0.2 : o.roce, profitHistory: o.history },
  verdict,
  borderline: o.borderline ?? false,
  consistency: o.consistency ?? "Consistent",
  margin: o.margin === undefined ? 0.05 : o.margin,
  bench: { floor: o.floor ?? 0.15 },
});

describe("groupOf", () => {
  it("puts every stock in exactly one group, and a close Skip in Near cut-off", () => {
    expect(groupOf({ verdict: "CONSIDER – Strong", borderline: true })).toBe("strong");
    expect(groupOf({ verdict: "CONSIDER – Moderate", borderline: true })).toBe("moderate");
    expect(groupOf({ verdict: "SKIP", borderline: true })).toBe("near");
    expect(groupOf({ verdict: "SKIP", borderline: false })).toBe("skip");
    expect(groupOf({ verdict: "n/a", borderline: false })).toBe("na");
  });

  it("agrees with the Sectors page's counts", () => {
    const rows = [
      item("a", "CONSIDER – Strong"),
      item("b", "CONSIDER – Moderate"),
      item("c", "SKIP", { borderline: true }),
      item("d", "SKIP"),
      item("e", "SKIP"),
      item("f", "n/a"),
    ];
    const c = countGroups(rows);
    expect(c).toEqual({ all: 6, strong: 1, moderate: 1, near: 1, skip: 2, na: 1 });
    const b = bucketCounts(rows);
    expect([b.strong, b.moderate, b.near, b.skip, b.na]).toEqual([c.strong, c.moderate, c.near, c.skip, c.na]);
  });

  it("lists the groups in the order the table shows them", () => {
    expect(GROUPS.map((g) => g.key)).toEqual(["strong", "moderate", "near", "skip", "na"]);
  });
});

describe("filters and chip counts", () => {
  const rows = [
    item("a", "CONSIDER – Strong", { consistency: "Consistent" }),
    item("b", "CONSIDER – Strong", { consistency: "Mixed" }),
    item("c", "CONSIDER – Moderate", { consistency: "Consistent" }),
    item("d", "SKIP", { consistency: "Weak" }),
  ];

  it("filters by group and by profit trend, together", () => {
    expect(filterItems(rows, { verdict: "all", trend: "any" })).toHaveLength(4);
    expect(filterItems(rows, { verdict: "strong", trend: "any" }).map((r) => r.stock.name)).toEqual(["a", "b"]);
    expect(filterItems(rows, { verdict: "all", trend: "Consistent" }).map((r) => r.stock.name)).toEqual(["a", "c"]);
    expect(filterItems(rows, { verdict: "strong", trend: "Consistent" }).map((r) => r.stock.name)).toEqual(["a"]);
    expect(filterItems(rows, { verdict: "near", trend: "any" })).toEqual([]);
  });

  it("counts each chip with the profit-trend filter applied, so the number is what the chip shows", () => {
    expect(countGroups(rows)).toEqual({ all: 4, strong: 2, moderate: 1, near: 0, skip: 1, na: 0 });
    expect(countGroups(rows, "Consistent")).toEqual({ all: 2, strong: 1, moderate: 1, near: 0, skip: 0, na: 0 });
  });

  it("knows when a filter is on", () => {
    expect(isFiltered({ verdict: "all", trend: "any" })).toBe(false);
    expect(isFiltered({ verdict: "skip", trend: "any" })).toBe(true);
    expect(isFiltered({ verdict: "all", trend: "Weak" })).toBe(true);
  });
});

describe("against (the benchmark gap in words)", () => {
  const at = (roe: number | null, margin: number | null, floor = 0.15) => against(item("x", "SKIP", { roe, margin, floor }));

  it("says how far above or short", () => {
    expect(at(0.48, 0.24)).toBe("+24.0 pts above");
    expect(at(0.253, 0.012)).toBe("+1.2 pts above");
    expect(at(0.19, -0.05)).toBe("5.0 pts short");
  });

  it("uses 'pt' for exactly one point", () => {
    expect(at(0.23, -0.01)).toBe("1.0 pt short");
    expect(at(0.25, 0.01)).toBe("+1.0 pt above");
    expect(at(0.231, -0.0096)).toBe("1.0 pt short"); // rounds to 1.0
  });

  it("says Below the floor when ROE is under the minimum, whatever the cut-off", () => {
    expect(at(0.14, -0.1)).toBe("Below 15% floor");
    expect(at(-0.05, -0.29)).toBe("Below 15% floor");
    expect(at(0.1, -0.02, 0.125)).toBe("Below 12.5% floor");
  });

  it("is not above when exactly at the cut-off", () => {
    expect(at(0.24, 0)).toBe("At the cut-off");
  });

  it("is honest when there is nothing to compare", () => {
    expect(at(null, null)).toBe("No ROE to compare");
    expect(at(0.2, null)).toBe("No ROE to compare");
  });

  it("shows a pass that rounds to zero as above, not as zero", () => {
    expect(at(0.2401, 0.0001)).toBe("+0.0 pts above");
  });
});

describe("profit moves", () => {
  it("gives three steps from the latest four years, oldest first", () => {
    expect(trendSteps([100, 120, 150, 200])).toEqual(["up", "up", "up"]);
    expect(trendSteps([100, 80, 90, 70])).toEqual(["down", "up", "down"]);
    expect(trendSteps([100, 100, 90, 90])).toEqual(["flat", "down", "flat"]);
  });

  it("uses only the latest four of a longer history", () => {
    expect(trendSteps([1, 2, 3, 100, 90, 95])).toEqual(["up", "down", "up"]);
    expect(trendSteps([5, 10, 20, 15, 25])).toEqual(["up", "down", "up"]);
  });

  it("marks a missing year as unknown and pads a short history", () => {
    expect(trendSteps([100, null, 120, 150])).toEqual(["none", "none", "up"]);
    expect(trendSteps([120, 150])).toEqual(["none", "none", "up"]);
    expect(trendSteps([])).toEqual(["none", "none", "none"]);
    expect(trendSteps(undefined)).toEqual(["none", "none", "none"]);
    expect(trendSteps([100, Number.NaN, 120, 150])).toEqual(["none", "none", "up"]);
  });

  it("describes the steps for a screen reader", () => {
    expect(stepsLabel(["up", "down", "up"])).toBe("Profit rose, then fell, then rose");
    expect(stepsLabel(["none", "none", "up"])).toBe("Profit is unknown, then is unknown, then rose");
    expect(stepsLabel(["none", "none", "none"])).toBe("Profit moves are not known");
  });
});

describe("sortGrouped", () => {
  const rows = [
    item("Skip low", "SKIP", { roe: 0.1, roce: 0.1, margin: -0.14 }),
    item("Strong B", "CONSIDER – Strong", { roe: 0.3, roce: 0.4, margin: 0.06 }),
    item("Near", "SKIP", { roe: 0.23, borderline: true, margin: -0.01 }),
    item("Strong A", "CONSIDER – Strong", { roe: 0.48, roce: 0.5, margin: 0.24 }),
    item("Moderate", "CONSIDER – Moderate", { roe: 0.26, roce: 0.2, margin: 0.02 }),
    item("Unrated", "n/a", { roe: null, roce: null, margin: null }),
    item("Skip high", "SKIP", { roe: 0.19, roce: 0.18, margin: -0.05 }),
  ];
  const names = (key: Parameters<typeof sortGrouped>[1]) => sortGrouped(rows, key).map((r) => r.stock.name);

  it("keeps the groups in order and sorts by ROE inside each, high to low", () => {
    expect(names("roe")).toEqual(["Strong A", "Strong B", "Moderate", "Near", "Skip high", "Skip low", "Unrated"]);
  });

  it("sorts inside each group by the chosen key", () => {
    expect(names("name")).toEqual(["Strong A", "Strong B", "Moderate", "Near", "Skip high", "Skip low", "Unrated"]);
    expect(names("roce")).toEqual(["Strong A", "Strong B", "Moderate", "Near", "Skip high", "Skip low", "Unrated"]);
    expect(names("margin")[0]).toBe("Strong A");
  });

  it("puts a missing figure last inside its group and breaks ties by name", () => {
    const tied = [item("B", "SKIP", { roe: null }), item("A", "SKIP", { roe: null }), item("C", "SKIP", { roe: 0.1 })];
    expect(sortGrouped(tied, "roe").map((r) => r.stock.name)).toEqual(["C", "A", "B"]);
  });

  it("sorts by profit trend, best first, then ROE", () => {
    const t = [
      item("W", "SKIP", { consistency: "Weak", roe: 0.5 }),
      item("C2", "SKIP", { consistency: "Consistent", roe: 0.1 }),
      item("C1", "SKIP", { consistency: "Consistent", roe: 0.2 }),
      item("R", "SKIP", { consistency: "Recovering" }),
    ];
    expect(sortGrouped(t, "trend").map((r) => r.stock.name)).toEqual(["C1", "C2", "R", "W"]);
  });

  it("does not change the list it was given", () => {
    const before = rows.map((r) => r.stock.name);
    sortGrouped(rows, "roe");
    expect(rows.map((r) => r.stock.name)).toEqual(before);
  });
});

describe("sectionsForPage", () => {
  const many = sortGrouped(
    [
      ...Array.from({ length: 30 }, (_, i) => item(`Strong ${String(i).padStart(2, "0")}`, "CONSIDER – Strong", { roe: 0.5 - i / 100 })),
      ...Array.from({ length: 5 }, (_, i) => item(`Skip ${i}`, "SKIP", { roe: 0.1 - i / 100 })),
    ],
    "roe",
  );

  it("splits a page into the groups on it, with each group's full count", () => {
    const p1 = sectionsForPage(many, 0, PAGE_SIZE);
    expect(p1.map((s) => [s.key, s.total, s.rows.length, s.continued])).toEqual([["strong", 30, 25, false]]);
    const p2 = sectionsForPage(many, PAGE_SIZE, PAGE_SIZE * 2);
    expect(p2.map((s) => [s.key, s.total, s.rows.length, s.continued])).toEqual([
      ["strong", 30, 5, true],
      ["skip", 5, 5, false],
    ]);
  });

  it("shows every row exactly once across the pages", () => {
    const seen = [...sectionsForPage(many, 0, 25), ...sectionsForPage(many, 25, 50)].flatMap((s) => s.rows.map((r) => r.stock.symbol));
    expect(seen).toHaveLength(35);
    expect(new Set(seen).size).toBe(35);
  });

  it("returns nothing for an empty list or a range past the end", () => {
    expect(sectionsForPage([], 0, 25)).toEqual([]);
    expect(sectionsForPage(many, 40, 65)).toEqual([]);
  });
});
