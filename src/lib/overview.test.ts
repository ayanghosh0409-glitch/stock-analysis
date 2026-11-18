import { describe, expect, it } from "vitest";
import { donutArcs, share, tally } from "./overview";
import type { Consistency, Verdict } from "./screen";

const row = (verdict: Verdict, consistency: Consistency) => ({ verdict, consistency });

describe("tally", () => {
  const rows = [
    row("CONSIDER – Strong", "Consistent"),
    row("CONSIDER – Strong", "Recovering"),
    row("CONSIDER – Moderate", "Mixed"),
    row("SKIP", "Weak"),
    row("SKIP", "Consistent"),
    row("n/a", "Insufficient data"),
  ];

  it("counts each stock once per question", () => {
    const t = tally(rows);
    expect(t).toMatchObject({ n: 6, strong: 2, moderate: 1, skip: 2, na: 1, pass: 3 });
    expect(t).toMatchObject({ consistent: 2, recovering: 1, mixed: 1, weak: 1, nodata: 1 });
  });

  it("always adds up to the number of stocks, so no stock goes missing from a card", () => {
    const t = tally(rows);
    expect(t.strong + t.moderate + t.skip + t.na).toBe(t.n);
    expect(t.consistent + t.recovering + t.mixed + t.weak + t.nodata).toBe(t.n);
  });

  it("handles an empty group", () => {
    expect(tally([])).toMatchObject({ n: 0, pass: 0, strong: 0, na: 0 });
  });
});

describe("share", () => {
  it("is a percentage, and 0 for an empty total", () => {
    expect(share(1, 4)).toBe(25);
    expect(share(0, 0)).toBe(0);
  });
});

describe("donutArcs", () => {
  it("lays arcs end to end around a 100-unit ring", () => {
    const [a, b, c] = donutArcs([6, 0, 5], 0);
    expect(a.dash).toBeCloseTo(54.545, 2);
    expect(a.offset).toBeCloseTo(0);
    expect(b.dash).toBe(0);
    expect(c.offset).toBeCloseTo(-54.545, 2);
    expect(a.dash + b.dash + c.dash).toBeCloseTo(100, 5);
  });

  it("leaves a small gap between arcs when several are visible", () => {
    const [a, b] = donutArcs([1, 1], 1);
    expect(a.dash).toBeCloseTo(49);
    expect(b.dash).toBeCloseTo(49);
  });

  it("draws a single full ring without a gap", () => {
    expect(donutArcs([0, 3, 0])[1].dash).toBe(100);
  });

  it("draws nothing for an empty group", () => {
    expect(donutArcs([0, 0, 0]).every((a) => a.dash === 0)).toBe(true);
  });
});
