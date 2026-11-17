import { describe, expect, it } from "vitest";
import { RECENT_DAYS, RECENT_MAX, addRecent, pruneRecent, suggestRecent, type RecentSearch } from "./recent";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 17, 12, 0, 0);
const at = (daysAgo: number) => NOW - daysAgo * DAY;
const qs = (l: RecentSearch[]) => l.map((r) => r.q);

describe("retention", () => {
  it("keeps searches from the last 7 days and drops older ones", () => {
    const list = [
      { q: "tcs", at: at(0) },
      { q: "infosys", at: at(6.9) },
      { q: "hul", at: at(7) }, // exactly 7 days old is still kept
      { q: "itc", at: at(7) - 1 }, // one millisecond older is not
      { q: "wipro", at: at(30) },
    ];
    expect(qs(pruneRecent(list, NOW))).toEqual(["tcs", "infosys", "hul"]);
    expect(RECENT_DAYS).toBe(7);
  });

  it("lets a search expire as time passes", () => {
    const list = addRecent([], "tcs", NOW);
    expect(qs(pruneRecent(list, NOW + 6 * DAY))).toEqual(["tcs"]);
    expect(qs(pruneRecent(list, NOW + 8 * DAY))).toEqual([]);
  });

  it("does not let a future timestamp outlive the window", () => {
    const list = pruneRecent([{ q: "tcs", at: NOW + 400 * DAY }], NOW);
    expect(list).toEqual([{ q: "tcs", at: NOW }]);
    expect(pruneRecent(list, NOW + 8 * DAY)).toEqual([]);
  });
});

describe("adding", () => {
  it("puts the newest first", () => {
    let l = addRecent([], "tcs", at(2));
    l = addRecent(l, "infosys", at(1));
    l = addRecent(l, "wipro", at(0));
    expect(qs(l)).toEqual(["wipro", "infosys", "tcs"]);
  });

  it("moves a repeated search to the top instead of duplicating it, ignoring letter case and spacing", () => {
    let l = addRecent([], "tcs", at(2));
    l = addRecent(l, "infosys", at(1));
    l = addRecent(l, "  TCS ", at(0));
    expect(qs(l)).toEqual(["TCS", "infosys"]);
    expect(addRecent(l, "info   sys", at(0)).length).toBe(3);
  });

  it("ignores empty and one-letter searches", () => {
    expect(addRecent([], "", NOW)).toEqual([]);
    expect(addRecent([], "   ", NOW)).toEqual([]);
    expect(addRecent([], "a", NOW)).toEqual([]);
    expect(qs(addRecent([], "ab", NOW))).toEqual(["ab"]);
  });

  it("keeps only the most recent few", () => {
    let l: RecentSearch[] = [];
    for (let i = 0; i < RECENT_MAX + 4; i++) l = addRecent(l, `stock ${i}`, at(5) + i * 1000);
    expect(l.length).toBe(RECENT_MAX);
    expect(l[0].q).toBe(`stock ${RECENT_MAX + 3}`);
    expect(qs(l)).not.toContain("stock 0");
  });

  it("clears expired entries on the way", () => {
    const l = addRecent([{ q: "old one", at: at(20) }], "fresh", NOW);
    expect(qs(l)).toEqual(["fresh"]);
  });
});

describe("untrusted storage", () => {
  it("returns an empty list for anything that is not a list", () => {
    for (const bad of [null, undefined, "x", 5, {}, { q: "tcs", at: NOW }]) expect(pruneRecent(bad, NOW)).toEqual([]);
  });

  it("skips malformed entries but keeps the good ones", () => {
    const list = [null, 3, "tcs", { q: 5, at: NOW }, { q: "tcs" }, { q: "hul", at: "yesterday" }, { q: "itc", at: NaN }, { q: "good one", at: at(1) }];
    expect(qs(pruneRecent(list, NOW))).toEqual(["good one"]);
  });
});

describe("suggestions", () => {
  const list: RecentSearch[] = [
    { q: "Infosys", at: at(0) },
    { q: "info edge", at: at(1) },
    { q: "tcs", at: at(2) },
  ];
  it("shows everything while the box is empty", () => {
    expect(qs(suggestRecent(list, ""))).toEqual(["Infosys", "info edge", "tcs"]);
    expect(qs(suggestRecent(list, "   "))).toEqual(["Infosys", "info edge", "tcs"]);
  });
  it("narrows to matching searches while typing, and drops an exact match", () => {
    expect(qs(suggestRecent(list, "inf"))).toEqual(["Infosys", "info edge"]);
    expect(qs(suggestRecent(list, "INFOSYS"))).toEqual([]);
    expect(qs(suggestRecent(list, "zzz"))).toEqual([]);
  });
});
