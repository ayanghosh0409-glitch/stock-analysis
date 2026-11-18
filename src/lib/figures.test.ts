import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "./db";
import { HOURLY_LIMIT, WINDOW, addEntry, applyEntered, enteredFor, ensureSchema, median, recentCount, summarize, validateEntry, type EnteredMap } from "./figures";
import { buildPreview, completeness, type RawYahoo } from "./yahoo";
import { profitTrend, verdict, benchmarks } from "./screen";

const CR = 1e7;
const SECTORS = ["IT", "Auto", "Auto Components", "Auto Batteries", "Pharma", "FMCG"];

describe("validateEntry", () => {
  const ok = (o: object) => validateEntry({ ticker: "hdfcbank.ns", field: "roce", percent: 14.5, ...o });
  it("turns a percentage into a fraction and cleans the ticker", () => {
    expect(ok({})).toEqual({ ok: true, entry: { ticker: "HDFCBANK.NS", field: "roce", value: 0.145 } });
    expect(ok({ percent: 18.55 })).toMatchObject({ entry: { value: 0.1855 } });
    expect(ok({ percent: -12 })).toMatchObject({ entry: { value: -0.12 } });
  });
  it("accepts the ends of the range and refuses beyond them", () => {
    expect(ok({ percent: -100 }).ok).toBe(true);
    expect(ok({ percent: 200 }).ok).toBe(true);
    expect(ok({ percent: 200.01 }).ok).toBe(false);
    expect(ok({ percent: -100.5 }).ok).toBe(false);
  });
  it("refuses anything that is not a plain number, a known figure or an NSE/BSE ticker", () => {
    for (const bad of [{ percent: "18" }, { percent: NaN }, { percent: Infinity }, { percent: null }, { field: "pe" }, { field: "profit" }, { field: undefined }, { ticker: "AAPL" }, { ticker: "X;drop table.NS" }]) {
      expect(ok(bad).ok, JSON.stringify(bad)).toBe(false);
    }
    for (const bad of [null, undefined, "x", 5, []]) expect(validateEntry(bad).ok).toBe(false);
  });
});

describe("median and summarize", () => {
  it("median handles odd, even and single values", () => {
    expect(median([3])).toBe(3);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  const row = (field: string, value: number, at: string) => ({ field, value, entered_at: at });
  it("uses the median of the latest entries, so one wild value does not decide the figure", () => {
    const rows = [row("roce", 0.14, "2026-11-18T10:00:00Z"), row("roce", 5, "2026-11-18T09:00:00Z"), row("roce", 0.15, "2026-11-18T08:00:00Z")];
    expect(summarize(rows).roce).toEqual({ value: 0.15, count: 3, latest: "2026-11-18T10:00:00.000Z" });
  });
  it("only the latest WINDOW entries count, and each figure is separate", () => {
    const old = Array.from({ length: 4 }, (_, i) => row("roe", 9, `2026-11-0${i + 1}T00:00:00Z`));
    const fresh = Array.from({ length: WINDOW }, (_, i) => row("roe", 0.2, `2026-11-1${i}T00:00:00Z`)).reverse();
    const s = summarize([...fresh, ...old, row("roce", 0.1, "2026-11-12T00:00:00Z")]);
    expect(s.roe).toMatchObject({ value: 0.2, count: WINDOW });
    expect(s.roce).toMatchObject({ value: 0.1, count: 1 });
  });
  it("is empty when nobody has entered anything", () => {
    expect(summarize([])).toEqual({});
  });
});

/** A bank-like company: Yahoo gives profit, equity and the quote, but no ROCE. */
function bank(over: Partial<RawYahoo> = {}): RawYahoo {
  const y = (date: string, ni: number, eq: number) => ({ date, netIncome: ni * CR, equity: eq * CR, ebit: undefined, totalAssets: 100 * eq * CR, currentLiabilities: undefined });
  return {
    ticker: "BANK.NS", name: "Bank Ltd", currency: "INR", price: 100, marketCap: 50_000 * CR, trailingProfit: 6_000 * CR,
    sector: "Financial Services", industry: "Banks - Regional", errors: [],
    years: [y("2023-03-31", 4_000, 30_000), y("2024-03-31", 5_000, 35_000), y("2025-03-31", 5_500, 40_000), y("2026-03-31", 6_000, 45_000)],
    ...over,
  };
}

describe("applyEntered", () => {
  const entered: EnteredMap = { roce: { value: 0.18, count: 2, latest: "2026-11-18T10:00:00.000Z" } };

  it("fills a figure Yahoo did not supply, marks it, and the verdict can then be worked out", () => {
    const p = buildPreview(bank(), SECTORS, new Date("2026-11-18"));
    expect(p.figures.roce).toBeNull();
    const q = applyEntered(p, entered);
    expect(q.figures.roce).toBe(0.18);
    expect(q.stock.roce).toBe(0.18);
    expect(q.enteredFields).toEqual(["roce"]);
    const c = q.checks.find((x) => x.key === "roce")!;
    expect(c).toMatchObject({ ok: true });
    expect(c.detail).toContain("entered by visitors (2 entries");
    expect(c.detail).toContain("not verified");
    expect(q.notes[0]).toContain("ROCE came from figures entered by visitors");
    expect(completeness(q).have).toBe(completeness(p).have + 1);
    // with both figures present the screen gives a verdict instead of n/a
    const bench = benchmarks([{ ...q.stock, symbol: "A", roe: 0.1, roce: 0.1 }, { ...q.stock, symbol: "B", roe: 0.12, roce: 0.12 }, { ...q.stock, symbol: "C", roe: 0.2, roce: 0.2 }]);
    expect(verdict(p.stock, bench)).toBe("n/a");
    expect(verdict(q.stock, bench)).not.toBe("n/a");
  });

  it("never replaces a figure Yahoo supplied", () => {
    const p = buildPreview(bank(), SECTORS, new Date("2026-11-18"));
    const yahooRoe = p.figures.roe as number;
    const q = applyEntered(p, { roe: { value: 1.5, count: 5, latest: "2026-11-18T10:00:00.000Z" } });
    expect(q).toBe(p); // nothing to fill, so nothing changes
    expect(q.figures.roe).toBe(yahooRoe);
  });

  it("changes nothing when nobody has entered anything, and does not mutate the original", () => {
    const p = buildPreview(bank(), SECTORS, new Date("2026-11-18"));
    expect(applyEntered(p, undefined)).toBe(p);
    expect(applyEntered(p, {})).toBe(p);
    const before = JSON.stringify(p);
    applyEntered(p, entered);
    expect(JSON.stringify(p)).toBe(before);
  });

  it("does not disturb the profit trend", () => {
    const p = buildPreview(bank(), SECTORS, new Date("2026-11-18"));
    expect(profitTrend(applyEntered(p, entered).stock)).toEqual(profitTrend(p.stock));
  });
});

// The storage code runs on a real (in-process) Postgres, so the SQL itself is tested.
describe("storage on Postgres", () => {
  let pg: PGlite;
  let db: Db;
  beforeAll(async () => {
    pg = new PGlite();
    db = { query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await pg.query(sql, params)).rows as T[] }) };
  });
  afterAll(async () => pg.close());
  beforeEach(async () => {
    await ensureSchema(db);
    await pg.query("truncate entered_figures restart identity");
  });

  it("creates its table once and can be run again safely", async () => {
    await ensureSchema(db);
    const { rows } = await pg.query<{ n: number }>("select count(*)::int as n from information_schema.tables where table_name = 'entered_figures'");
    expect(rows[0].n).toBe(1);
  });

  it("stores an entry and reads it back as the figure to show", async () => {
    await addEntry(db, { ticker: "BANK.NS", field: "roce", value: 0.18 }, "h1");
    const got = await enteredFor(db, "BANK.NS");
    expect(got.roce).toMatchObject({ value: 0.18, count: 1 });
    expect(got.roe).toBeUndefined();
    expect(new Date(got.roce!.latest).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("keeps companies apart and takes the median of the latest five", async () => {
    for (const v of [0.1, 0.12, 9, 0.14, 0.13, 0.11]) await addEntry(db, { ticker: "BANK.NS", field: "roce", value: v }, "h1");
    await addEntry(db, { ticker: "OTHER.NS", field: "roce", value: 0.5 }, "h2");
    const got = await enteredFor(db, "BANK.NS");
    // latest five are 0.12, 9, 0.14, 0.13, 0.11 -> median 0.13; the first 0.1 has dropped out of the window
    expect(got.roce).toMatchObject({ count: WINDOW });
    expect(got.roce!.value).toBeCloseTo(0.13, 10);
    expect((await enteredFor(db, "OTHER.NS")).roce!.value).toBe(0.5);
    expect(await enteredFor(db, "NONE.NS")).toEqual({});
  });

  it("counts a caller's entries in the last hour only", async () => {
    await addEntry(db, { ticker: "A.NS", field: "roe", value: 0.1 }, "h1");
    await addEntry(db, { ticker: "B.NS", field: "roe", value: 0.1 }, "h1");
    await addEntry(db, { ticker: "C.NS", field: "roe", value: 0.1 }, "h2");
    await pg.query("insert into entered_figures (ticker, field, value, client_hash, entered_at) values ('D.NS', 'roe', 0.1, 'h1', now() - interval '2 hours')");
    expect(await recentCount(db, "h1")).toBe(2);
    expect(await recentCount(db, "h2")).toBe(1);
    expect(await recentCount(db, "nobody")).toBe(0);
    expect(HOURLY_LIMIT).toBeGreaterThan(2);
  });

  it("refuses a figure name the table does not allow, whatever the code does", async () => {
    await expect(pg.query("insert into entered_figures (ticker, field, value, client_hash) values ('A.NS', 'pe', 1, 'h')")).rejects.toThrow();
  });

  it("treats a ticker as data, never as SQL", async () => {
    const evil = "X'; drop table entered_figures; --";
    expect(await enteredFor(db, evil)).toEqual({});
    await addEntry(db, { ticker: evil, field: "roe", value: 0.1 }, "h");
    expect((await enteredFor(db, evil)).roe).toBeDefined();
    expect((await pg.query("select count(*)::int as n from entered_figures")).rows).toEqual([{ n: 1 }]);
  });
});
