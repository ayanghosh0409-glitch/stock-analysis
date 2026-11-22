import { describe, expect, it } from "vitest";
import { WATCH_MAX, isFull, isWatching, parseWatchlist, removeWatch, toggleWatch, type WatchEntry } from "./watchlist";

const entry = (symbol: string, addedAt = 1000): WatchEntry => ({ symbol, name: `Co ${symbol}`, addedAt, seen: null });

describe("parseWatchlist", () => {
  it("returns an empty list for anything that is not a list", () => {
    for (const v of [null, undefined, "x", 5, {}, { symbol: "A" }]) expect(parseWatchlist(v)).toEqual([]);
  });

  it("drops malformed entries and keeps good ones", () => {
    const out = parseWatchlist([
      entry("TCS.NS"),
      null,
      "INFY.NS",
      { symbol: "", name: "x", addedAt: 1 },
      { symbol: "A", name: "", addedAt: 1 },
      { symbol: "B", name: "b", addedAt: "yesterday" },
      { symbol: "C", name: "c", addedAt: Number.NaN },
      { symbol: 5, name: "d", addedAt: 1 },
      { symbol: "X".repeat(40), name: "long", addedAt: 1 },
    ]);
    expect(out.map((w) => w.symbol)).toEqual(["TCS.NS"]);
  });

  it("keeps one entry per ticker and puts the newest first", () => {
    const out = parseWatchlist([entry("A", 100), entry("B", 300), entry("A", 200), entry("C", 200)]);
    expect(out.map((w) => w.symbol)).toEqual(["B", "C", "A"]);
    expect(out.find((w) => w.symbol === "A")?.addedAt).toBe(100); // the first one listed wins
  });

  it("keeps at most WATCH_MAX entries, newest first", () => {
    const many = Array.from({ length: WATCH_MAX + 5 }, (_, i) => entry(`S${i}`, i));
    const out = parseWatchlist(many);
    expect(out).toHaveLength(WATCH_MAX);
    expect(out[0].symbol).toBe(`S${WATCH_MAX + 4}`);
  });

  it("trims names and ignores a broken snapshot", () => {
    const [w] = parseWatchlist([{ symbol: " A ", name: "  Acme  Ltd ", addedAt: 5, seen: { price: "x" } }]);
    expect(w.symbol).toBe("A");
    expect(w.name).toBe("Acme  Ltd");
    expect(w.seen).toBeNull();
  });

  it("keeps a good snapshot and nulls bad figures inside it", () => {
    const [w] = parseWatchlist([{ symbol: "A", name: "a", addedAt: 5, seen: { price: 100, roe: "x", roce: 0.2, at: 7 } }]);
    expect(w.seen).toEqual({ price: 100, roe: null, roce: 0.2, at: 7 });
  });
});

describe("toggleWatch", () => {
  const stock = { symbol: "TCS.NS", name: "TCS", price: 3500, roe: 0.4, roce: 0.5 };

  it("adds a stock at the top with a snapshot of its figures", () => {
    const { list, result } = toggleWatch([entry("A", 1)], stock, 99);
    expect(result).toBe("added");
    expect(list.map((w) => w.symbol)).toEqual(["TCS.NS", "A"]);
    expect(list[0]).toEqual({ symbol: "TCS.NS", name: "TCS", addedAt: 99, seen: { price: 3500, roe: 0.4, roce: 0.5, at: 99 } });
    expect(isWatching(list, "TCS.NS")).toBe(true);
  });

  it("takes a watched stock off", () => {
    const start = toggleWatch([], stock, 1).list;
    const { list, result } = toggleWatch(start, stock, 2);
    expect(result).toBe("removed");
    expect(list).toEqual([]);
  });

  it("stores missing figures as null", () => {
    const { list } = toggleWatch([], { symbol: "B", name: "Bank", roe: null }, 5);
    expect(list[0].seen).toEqual({ price: null, roe: null, roce: null, at: 5 });
  });

  it("refuses a new stock when the list is full, but still lets one be removed", () => {
    const full = Array.from({ length: WATCH_MAX }, (_, i) => entry(`S${i}`, i));
    expect(isFull(full)).toBe(true);
    const refused = toggleWatch(full, stock, 1);
    expect(refused.result).toBe("full");
    expect(refused.list).toBe(full);
    const removed = toggleWatch(full, { symbol: "S3", name: "x" }, 1);
    expect(removed.result).toBe("removed");
    expect(removed.list).toHaveLength(WATCH_MAX - 1);
  });

  it("does not change the list it was given", () => {
    const start = [entry("A")];
    toggleWatch(start, stock, 1);
    expect(start).toEqual([entry("A")]);
  });
});

describe("removeWatch", () => {
  it("removes one ticker and leaves the rest", () => {
    expect(removeWatch([entry("A"), entry("B")], "A").map((w) => w.symbol)).toEqual(["B"]);
    expect(removeWatch([entry("A")], "Z")).toHaveLength(1);
  });
});
