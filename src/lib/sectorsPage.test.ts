import { describe, expect, it } from "vitest";
import {
  NO_FILTERS,
  barLabel,
  bucketCounts,
  buildSectorRows,
  countBySource,
  countsText,
  filterSectors,
  fmtDay,
  isFiltered,
  pageNumbers,
  paginate,
  sortSectors,
  type SectorRow,
} from "./sectorsPage";
import type { PeerHealth, Verdict } from "./screen";
import type { Sector, Stock } from "./types";

const health = (level: PeerHealth["level"]): PeerHealth => ({ level, peers: 8, lossMaking: 0, spread: null, reasons: [] });

const row = (name: string, o: Partial<SectorRow> = {}): SectorRow => ({
  name,
  built: false,
  builtOn: null,
  n: 10,
  strong: 0,
  moderate: 0,
  near: 0,
  skip: 10,
  na: 0,
  passShare: 0,
  medianRoe: 0.15,
  grade: "Good",
  health: health("ok"),
  ...o,
});

const v = (verdict: Verdict, borderline = false) => ({ verdict, borderline });

describe("bucketCounts", () => {
  it("puts every stock in exactly one bucket", () => {
    const rows = [
      v("CONSIDER – Strong"),
      v("CONSIDER – Strong", true), // a close pass is still a pass
      v("CONSIDER – Moderate"),
      v("SKIP", true), // a near miss
      v("SKIP"),
      v("SKIP"),
      v("n/a"),
    ];
    const b = bucketCounts(rows);
    expect(b).toEqual({ strong: 2, moderate: 1, near: 1, skip: 2, na: 1 });
    expect(b.strong + b.moderate + b.near + b.skip + b.na).toBe(rows.length);
  });

  it("is all zero for no stocks", () => {
    expect(bucketCounts([])).toEqual({ strong: 0, moderate: 0, near: 0, skip: 0, na: 0 });
  });
});

describe("buildSectorRows", () => {
  const stock = { symbol: "X" } as Stock;
  const sectors: Sector[] = [
    { name: "IT", title: "IT", stocks: [stock, stock, stock, stock] },
    { name: "Steel", title: "Steel", stocks: [stock, stock], built: { builtAt: "2026-11-09T05:00:00Z" } as Sector["built"] },
  ];
  const info = {
    IT: { bench: { roe: 0.24 } as never, health: health("ok") },
    Steel: { bench: { roe: null } as never, health: health("caution") },
  };

  it("counts each sector's own stocks and works out the share that pass", () => {
    const rows = buildSectorRows(
      sectors,
      [
        { sector: "IT", ...v("CONSIDER – Strong") },
        { sector: "IT", ...v("CONSIDER – Moderate") },
        { sector: "IT", ...v("SKIP") },
        { sector: "IT", ...v("SKIP", true) },
        { sector: "Steel", ...v("SKIP") },
      ],
      info,
    );
    const it = rows[0];
    expect([it.strong, it.moderate, it.near, it.skip, it.n]).toEqual([1, 1, 1, 1, 4]);
    expect(it.passShare).toBe(0.5);
    expect(it.medianRoe).toBe(0.24);
    expect(it.grade).toBe("Good");
    expect(it.built).toBe(false);
    const steel = rows[1];
    expect(steel.passShare).toBe(0);
    expect(steel.medianRoe).toBeNull();
    expect(steel.grade).toBe("Fair");
    expect(steel.built).toBe(true);
    expect(steel.builtOn).toBe("2026-11-09T05:00:00Z");
  });

  it("copes with a sector that has no stocks or no benchmark yet", () => {
    const rows = buildSectorRows([{ name: "Empty", title: "Empty", stocks: [] }], [], {});
    expect(rows[0].passShare).toBe(0);
    expect(rows[0].grade).toBe("Weak");
  });
});

describe("text for the bar", () => {
  const b = { strong: 6, moderate: 1, near: 1, skip: 3, na: 0 };
  it("writes the counts, adding Not rated only when there are some", () => {
    expect(countsText(b)).toBe("6 Strong · 1 Moderate · 1 Near · 3 Skip");
    expect(countsText({ ...b, na: 2 })).toBe("6 Strong · 1 Moderate · 1 Near · 3 Skip · 2 Not rated");
  });
  it("gives a screen reader full words", () => {
    expect(barLabel("IT", b)).toBe("IT: 6 strong, 1 moderate, 1 near the cut-off, 3 skip");
  });
});

describe("fmtDay", () => {
  it("writes day and month in India's time zone", () => {
    expect(fmtDay("2026-11-12T08:00:00Z")).toBe("12 Nov");
    expect(fmtDay("2026-11-12T20:00:00Z")).toBe("13 Nov"); // already the 13th in India
  });
  it("is empty for nothing or nonsense", () => {
    expect(fmtDay(null)).toBe("");
    expect(fmtDay(undefined)).toBe("");
    expect(fmtDay("not a date")).toBe("");
  });
});

describe("filterSectors", () => {
  const rows = [
    row("IT"),
    row("Auto Components", { grade: "Fair" }),
    row("Banks—Regional", { built: true, grade: "Good" }),
    row("Steel", { built: true, grade: "Weak" }),
  ];
  const names = (r: SectorRow[]) => r.map((x) => x.name);

  it("returns everything when nothing is set", () => {
    expect(names(filterSectors(rows, NO_FILTERS))).toEqual(["IT", "Auto Components", "Banks—Regional", "Steel"]);
  });
  it("finds a sector by words in any order, ignoring case and dashes", () => {
    expect(names(filterSectors(rows, { ...NO_FILTERS, q: "components auto" }))).toEqual(["Auto Components"]);
    expect(names(filterSectors(rows, { ...NO_FILTERS, q: "BANKS" }))).toEqual(["Banks—Regional"]);
    expect(names(filterSectors(rows, { ...NO_FILTERS, q: "banks regional" }))).toEqual(["Banks—Regional"]);
    expect(names(filterSectors(rows, { ...NO_FILTERS, q: "zzz" }))).toEqual([]);
  });
  it("narrows to listed or built sectors", () => {
    expect(names(filterSectors(rows, { ...NO_FILTERS, source: "listed" }))).toEqual(["IT", "Auto Components"]);
    expect(names(filterSectors(rows, { ...NO_FILTERS, source: "built" }))).toEqual(["Banks—Regional", "Steel"]);
  });
  it("narrows to a peer-set grade, and combines with the other filters", () => {
    expect(names(filterSectors(rows, { ...NO_FILTERS, grade: "Weak" }))).toEqual(["Steel"]);
    expect(names(filterSectors(rows, { q: "", source: "built", grade: "Good" }))).toEqual(["Banks—Regional"]);
    expect(names(filterSectors(rows, { q: "steel", source: "listed", grade: "any" }))).toEqual([]);
  });
  it("says whether any filter is on", () => {
    expect(isFiltered(NO_FILTERS)).toBe(false);
    expect(isFiltered({ ...NO_FILTERS, q: "  " })).toBe(false);
    expect(isFiltered({ ...NO_FILTERS, q: "it" })).toBe(true);
    expect(isFiltered({ ...NO_FILTERS, grade: "Fair" })).toBe(true);
  });
  it("counts listed and built for the chips", () => {
    expect(countBySource(rows)).toEqual({ all: 4, listed: 2, built: 2 });
  });
});

describe("sortSectors", () => {
  const rows = [
    row("B", { passShare: 0.5, n: 10, medianRoe: 0.1, grade: "Weak" }),
    row("A", { passShare: 0.5, n: 20, medianRoe: null, grade: "Good" }),
    row("C", { passShare: 0.9, n: 5, medianRoe: 0.3, grade: "Fair" }),
    row("D", { passShare: 0.5, n: 10, medianRoe: 0.1, grade: "Good" }),
  ];
  const order = (key: Parameters<typeof sortSectors>[1]) => sortSectors(rows, key).map((r) => r.name);

  it("sorts by share that pass, highest first, then more stocks, then name", () => {
    expect(order("pass")).toEqual(["C", "A", "B", "D"]);
  });
  it("sorts by median ROE, highest first, with gaps last", () => {
    expect(order("roe")).toEqual(["C", "B", "D", "A"]);
  });
  it("sorts by number of stocks, then by name", () => {
    expect(order("stocks")).toEqual(["A", "B", "D", "C"]);
  });
  it("sorts by name", () => {
    expect(order("name")).toEqual(["A", "B", "C", "D"]);
  });
  it("sorts by peer set, best first, then by share that pass", () => {
    expect(order("peer")).toEqual(["A", "D", "C", "B"]);
  });
  it("does not change the list it was given", () => {
    const before = rows.map((r) => r.name);
    sortSectors(rows, "name");
    expect(rows.map((r) => r.name)).toEqual(before);
  });
});

describe("paginate", () => {
  it("gives the rows of the first page", () => {
    expect(paginate(50, 1, 10)).toEqual({ page: 1, pages: 5, start: 0, end: 10, from: 1, to: 10, total: 50 });
  });
  it("gives a short last page", () => {
    expect(paginate(23, 3, 10)).toMatchObject({ page: 3, pages: 3, start: 20, end: 23, from: 21, to: 23 });
  });
  it("pulls a page number back inside the range after a filter shrinks the list", () => {
    expect(paginate(23, 9, 10).page).toBe(3);
    expect(paginate(5, 4, 10).page).toBe(1);
    expect(paginate(5, 0, 10).page).toBe(1);
    expect(paginate(5, Number.NaN, 10).page).toBe(1);
  });
  it("copes with an empty list", () => {
    expect(paginate(0, 1, 10)).toEqual({ page: 1, pages: 1, start: 0, end: 0, from: 0, to: 0, total: 0 });
  });
  it("works for every page size the table offers", () => {
    for (const size of [10, 25, 50]) {
      const p = paginate(50, 2, size);
      expect(p.end - p.start).toBeLessThanOrEqual(size);
    }
    expect(paginate(50, 1, 50)).toMatchObject({ pages: 1, from: 1, to: 50 });
  });
});

describe("pageNumbers", () => {
  it("shows every page when there are few", () => {
    expect(pageNumbers(1, 1)).toEqual([1]);
    expect(pageNumbers(3, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageNumbers(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  it("shortens a long run with dots, keeping the ends and the neighbours", () => {
    expect(pageNumbers(1, 20)).toEqual([1, 2, "…", 20]);
    expect(pageNumbers(10, 20)).toEqual([1, "…", 9, 10, 11, "…", 20]);
    expect(pageNumbers(20, 20)).toEqual([1, "…", 19, 20]);
  });
  it("fills a gap of one page instead of dotting it", () => {
    expect(pageNumbers(4, 20)).toEqual([1, 2, 3, 4, 5, "…", 20]);
    expect(pageNumbers(17, 20)).toEqual([1, "…", 16, 17, 18, 19, 20]);
  });
});
