import { describe, expect, it } from "vitest";
import aliases from "../../data/stock-aliases.json";
import stocks from "../../data/stocks.json";
import { cleanNews, formatFetched, formatNewsDate, safeUrl, tagStocks } from "./news";

const A = aliases as Record<string, string[]>;
const allSymbols = stocks.sectors.flatMap((s) => s.stocks.map((x) => x.symbol));
const tag = (title: string, symbols = allSymbols) => tagStocks(title, symbols, A);

describe("tagStocks", () => {
  it("finds companies by common name or symbol, in the order they appear", () => {
    expect(tag("Infosys and TCS lift guidance as Wipro lags")).toEqual(["INFY", "TCS", "WIPRO"]);
  });

  it("matches whole words only", () => {
    expect(tag("Hulk Hogan sells ITCHY sweaters")).toEqual([]); // not HUL, not ITC
    expect(tag("HUL cuts prices")).toEqual(["HINDUNILVR"]);
    expect(tag("ITC Hotels demerger")).toEqual(["ITC"]);
  });

  it("ignores case, accents, curly apostrophes and ampersands", () => {
    expect(tag("NESTLÉ INDIA raises prices")).toEqual(["NESTLEIND"]);
    expect(tag("Dr. Reddy’s gets USFDA nod")).toEqual(["DRREDDY"]);
    expect(tag("Mahindra & Mahindra EV sales")).toEqual(["M&M"]);
    expect(tag("Tech Mahindra deal")).toEqual(["TECHM"]); // not M&M
  });

  it("does not confuse a company with a finance term", () => {
    expect(tag("LTM revenue rises 8%")).toEqual([]); // "last twelve months", not LTIMindtree
    expect(tag("LTIMindtree wins contract")).toEqual(["LTM"]);
  });

  it("only considers the stocks it is given", () => {
    expect(tag("Infosys beats estimates", ["TCS", "WIPRO"])).toEqual([]);
  });

  it("copes with regex characters in headlines", () => {
    expect(tag("(Exide) [battery] * + ? headline")).toEqual(["EXIDEIND"]);
  });
});

describe("alias data", () => {
  it("covers every stock in the dataset, so a newly added stock is not forgotten", () => {
    expect(allSymbols.filter((s) => !(A[s]?.length > 0))).toEqual([]);
  });

  it("never gives one alias to two stocks", () => {
    const owner = new Map<string, string>();
    for (const [symbol, list] of Object.entries(A)) {
      for (const alias of list) {
        const key = alias.toLowerCase();
        expect(owner.get(key) ?? symbol, `"${alias}" is claimed by two stocks`).toBe(symbol);
        owner.set(key, symbol);
      }
    }
  });
});

describe("safeUrl", () => {
  it("allows web links only", () => {
    expect(safeUrl("https://news.google.com/rss/articles/x")).toBe("https://news.google.com/rss/articles/x");
    expect(safeUrl("http://example.com")).toBe("http://example.com");
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "ftp://x.test", "not a url", "", null, 5, undefined]) expect(safeUrl(bad)).toBeNull();
  });
});

describe("cleanNews", () => {
  const good = { title: " Auto sales jump ", url: "https://x.test/a", source: "Mint", publishedAt: "2026-11-17T05:00:00Z", date: "2026-11-17" };
  it("keeps good items and drops malformed ones", () => {
    const out = cleanNews({
      fetchedAt: "2026-11-18T02:00:00Z",
      windowDays: 7,
      sectors: {
        Auto: {
          status: "ok",
          items: [good, { ...good, url: "javascript:alert(1)" }, { ...good, title: "" }, { ...good, date: "yesterday" }, null, 5, { ...good, source: 9 }],
        },
        Broken: "nope",
      },
    });
    expect(out.sectors.Auto.items.map((i) => [i.title, i.source])).toEqual([["Auto sales jump", "Mint"], ["Auto sales jump", "Unknown source"]]);
    expect(out.sectors.Broken).toBeUndefined();
  });

  it("falls back to an empty file for garbage", () => {
    for (const bad of [null, undefined, "x", 5, [], { sectors: 3 }]) expect(cleanNews(bad).sectors).toEqual({});
    expect(cleanNews({ fetchedAt: 5, windowDays: -1 })).toMatchObject({ fetchedAt: null, windowDays: 7 });
  });

  it("treats an unknown status as an error", () => {
    expect(cleanNews({ sectors: { IT: { status: "weird", items: [] } } }).sectors.IT.status).toBe("error");
  });
});

describe("date formatting", () => {
  it("formats a news date as day and month", () => {
    expect(formatNewsDate("2026-11-17")).toBe("17 Nov");
    expect(formatNewsDate("2026-01-05")).toBe("5 Jan");
    expect(formatNewsDate("garbage")).toBe("");
    expect(formatNewsDate("2026-13-01")).toBe("");
  });

  it("shows the refresh time in IST whatever the viewer's time zone", () => {
    expect(formatFetched("2026-11-18T02:00:00Z")).toBe("18 Nov 2026, 07:30 IST");
    expect(formatFetched("2026-12-31T20:00:00Z")).toBe("1 Jan 2027, 01:30 IST");
    expect(formatFetched(null)).toBeNull();
    expect(formatFetched("nonsense")).toBeNull();
  });
});
