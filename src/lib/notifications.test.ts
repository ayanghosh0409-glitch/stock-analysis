import { describe, expect, it } from "vitest";
import {
  ALERT_RULES,
  MNA_DAYS,
  NOTICE_HOURS,
  NOTICE_MAX,
  addNotices,
  countByFilter,
  dismissNotice,
  expiresAt,
  filterNotices,
  lifetimeMs,
  pruneNotices,
  timeLeft,
  type Notice,
} from "./notifications";

const H = 60 * 60 * 1000;
const D = 24 * H;
const NOW = 1_700_000_000_000;

const notice = (id: string, kind: Notice["kind"] = "price", ago = 0, extra: Partial<Notice> = {}): Notice => ({
  id,
  kind,
  symbol: "TCS.NS",
  name: "TCS",
  detail: "Up 6.4% over the last 5 days",
  at: NOW - ago,
  ...extra,
});

describe("how long a notification lives", () => {
  it("is 24 hours, or 7 days for a merger or acquisition headline", () => {
    expect(lifetimeMs("price")).toBe(NOTICE_HOURS * H);
    expect(lifetimeMs("roe")).toBe(24 * H);
    expect(lifetimeMs("roce")).toBe(24 * H);
    expect(lifetimeMs("mna")).toBe(MNA_DAYS * D);
    expect(expiresAt(notice("a", "mna"))).toBe(NOW + 7 * D);
  });

  it("is still shown one minute before its time and gone at its time", () => {
    expect(pruneNotices([notice("a", "price", 24 * H - 60_000)], NOW)).toHaveLength(1);
    expect(pruneNotices([notice("a", "price", 24 * H)], NOW)).toHaveLength(0);
    expect(pruneNotices([notice("m", "mna", 6 * D)], NOW)).toHaveLength(1);
    expect(pruneNotices([notice("m", "mna", 7 * D)], NOW)).toHaveLength(0);
  });
});

describe("timeLeft", () => {
  it("counts down in hours, then minutes, and uses days for the long ones", () => {
    expect(timeLeft(notice("a", "price", 3 * H), NOW)).toBe("21h left");
    expect(timeLeft(notice("a", "price", 0), NOW)).toBe("24h left");
    expect(timeLeft(notice("a", "price", 3 * H + 5000), NOW)).toBe("21h left"); // a few seconds later it still says 21h
    expect(timeLeft(notice("m", "mna", 1 * D + 5000), NOW)).toBe("6d left");
    expect(timeLeft(notice("a", "price", 23 * H + 10 * 60_000), NOW)).toBe("50 min left");
    expect(timeLeft(notice("a", "price", 24 * H - 1000), NOW)).toBe("1 min left");
    expect(timeLeft(notice("a", "price", 25 * H), NOW)).toBe("expired");
    expect(timeLeft(notice("m", "mna", 1 * D), NOW)).toBe("6d left");
    expect(timeLeft(notice("m", "mna", 6 * D), NOW)).toBe("24h left");
    expect(timeLeft(notice("m", "mna", 5 * D + 1 * H), NOW)).toBe("47h left");
  });
});

describe("pruneNotices", () => {
  it("returns an empty list for anything that is not a list", () => {
    for (const v of [null, undefined, "x", 1, {}]) expect(pruneNotices(v, NOW)).toEqual([]);
  });

  it("drops malformed items and keeps good ones, newest first", () => {
    const out = pruneNotices(
      [
        notice("old", "price", 5 * H),
        notice("new", "price", 1 * H),
        null,
        { ...notice("x"), kind: "weather" },
        { ...notice("y"), detail: "" },
        { ...notice("z"), symbol: 5 },
        { ...notice("w"), at: "now" },
        { ...notice("v"), id: "" },
      ],
      NOW,
    );
    expect(out.map((n) => n.id)).toEqual(["new", "old"]);
  });

  it("keeps one notification per id", () => {
    const out = pruneNotices([notice("a", "price", 1 * H), notice("a", "price", 2 * H)], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].at).toBe(NOW - 1 * H);
  });

  it("pulls a time in the future back to now, so it cannot outlive its time", () => {
    const [n] = pruneNotices([{ ...notice("a"), at: NOW + 100 * D }], NOW);
    expect(n.at).toBe(NOW);
    // once pulled back, it ages like any other: gone 24 hours later
    expect(pruneNotices([n], NOW + 25 * H)).toHaveLength(0);
  });

  it("keeps only http and https source links", () => {
    const withUrl = (url: string) => pruneNotices([notice("a", "mna", 0, { source: { name: "Mint", url } })], NOW)[0].source;
    expect(withUrl("https://example.com/story")?.url).toBe("https://example.com/story");
    expect(withUrl("http://example.com/")?.name).toBe("Mint");
    expect(withUrl("javascript:alert(1)")).toBeUndefined();
    expect(withUrl("data:text/html,hi")).toBeUndefined();
    expect(withUrl("not a url")).toBeUndefined();
    expect(pruneNotices([notice("a", "mna", 0, { source: { name: "", url: "https://example.com" } })], NOW)[0].source).toBeUndefined();
  });

  it("limits long text and the number kept", () => {
    const [n] = pruneNotices([notice("a", "price", 0, { detail: "x".repeat(1000), extra: "y".repeat(1000) })], NOW);
    expect(n.detail).toHaveLength(300);
    expect(n.extra).toHaveLength(200);
    const many = Array.from({ length: NOTICE_MAX + 10 }, (_, i) => notice(`n${i}`, "price", i * 1000));
    expect(pruneNotices(many, NOW)).toHaveLength(NOTICE_MAX);
  });
});

describe("addNotices and dismissNotice", () => {
  it("adds new ones at the top and does not add an id twice", () => {
    const start = [notice("a", "price", 2 * H)];
    const out = addNotices(start, [notice("b", "roe", 0), notice("a", "price", 0)], NOW);
    expect(out.map((n) => n.id)).toEqual(["b", "a"]);
    expect(out.find((n) => n.id === "a")?.at).toBe(NOW - 2 * H);
  });

  it("drops an incoming notification that is already out of time", () => {
    expect(addNotices([], [notice("a", "price", 30 * H)], NOW)).toEqual([]);
  });

  it("opening one removes only that one", () => {
    const list = [notice("a"), notice("b")];
    expect(dismissNotice(list, "a").map((n) => n.id)).toEqual(["b"]);
    expect(dismissNotice(list, "zzz")).toHaveLength(2);
    expect(list).toHaveLength(2);
  });
});

describe("filters", () => {
  const list = [notice("1", "price"), notice("2", "roe"), notice("3", "roce"), notice("4", "mna"), notice("5", "price")];

  it("groups ROE and ROCE together", () => {
    expect(filterNotices(list, "all")).toHaveLength(5);
    expect(filterNotices(list, "price").map((n) => n.id)).toEqual(["1", "5"]);
    expect(filterNotices(list, "fundamentals").map((n) => n.id)).toEqual(["2", "3"]);
    expect(filterNotices(list, "mna").map((n) => n.id)).toEqual(["4"]);
  });

  it("counts each filter", () => {
    expect(countByFilter(list)).toEqual({ all: 5, price: 2, fundamentals: 2, mna: 1 });
    expect(countByFilter([])).toEqual({ all: 0, price: 0, fundamentals: 0, mna: 0 });
  });
});

describe("alert rules", () => {
  it("name all three alerts, none switched on yet", () => {
    expect(ALERT_RULES.map((r) => r.kind)).toEqual(["price", "fundamentals", "mna"]);
    expect(ALERT_RULES.every((r) => r.live === false)).toBe(true);
  });
});
