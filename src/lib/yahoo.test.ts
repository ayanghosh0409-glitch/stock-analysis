import { describe, expect, it } from "vitest";
import { buildPreview, cleanQuery, cleanTicker, completeness, mapSector, toCandidates, yearLabel, type RawYahoo, type StatementYear } from "./yahoo";

const CR = 1e7;
const SECTORS = ["IT", "Auto", "Auto Components", "Auto Batteries", "Pharma", "FMCG"];
const NOW = new Date("2026-11-18T00:00:00Z");

const year = (date: string, o: Partial<StatementYear> = {}): StatementYear => ({ date, ...o });

/** A healthy non-financial company: four annual statements, profit and equity growing. */
function healthy(over: Partial<RawYahoo> = {}): RawYahoo {
  return {
    ticker: "ABC.NS",
    name: "ABC Industries Ltd",
    currency: "INR",
    price: 250.5,
    marketCap: 50_000 * CR,
    high52: 300,
    low52: 200,
    pe: 20,
    trailingProfit: 2_500 * CR,
    yahooRoe: 0.2,
    revenueTTM: 20_000 * CR,
    sector: "Technology",
    industry: "Information Technology Services",
    errors: [],
    years: [
      year("2023-03-31", { netIncome: 1_500 * CR, ebit: 2_000 * CR, equity: 9_000 * CR, totalAssets: 14_000 * CR, currentLiabilities: 4_000 * CR }),
      year("2024-03-31", { netIncome: 1_800 * CR, ebit: 2_400 * CR, equity: 10_000 * CR, totalAssets: 15_000 * CR, currentLiabilities: 4_500 * CR }),
      year("2025-03-31", { netIncome: 2_100 * CR, ebit: 2_800 * CR, equity: 11_000 * CR, totalAssets: 16_000 * CR, currentLiabilities: 5_000 * CR }),
      year("2026-03-31", { netIncome: 2_400 * CR, ebit: 3_300 * CR, equity: 12_000 * CR, totalAssets: 17_000 * CR, currentLiabilities: 5_000 * CR, revenue: 19_000 * CR }),
    ],
    ...over,
  };
}

describe("cleanTicker and cleanQuery", () => {
  it("accepts only NSE and BSE tickers, upper-cased", () => {
    expect(cleanTicker(" hdfcbank.ns ")).toBe("HDFCBANK.NS");
    expect(cleanTicker("M&M.NS")).toBe("M&M.NS");
    expect(cleanTicker("PANAENERG.BO")).toBe("PANAENERG.BO");
  });
  it("refuses anything else before it reaches Yahoo", () => {
    for (const bad of ["AAPL", "AAPL.US", "../etc", "A B.NS", "X.NS?y=1", "", ".NS", "A".repeat(30) + ".NS", null, 5, undefined]) {
      expect(cleanTicker(bad)).toBeNull();
    }
  });
  it("trims a search phrase, strips control characters and limits its length", () => {
    expect(cleanQuery("  hdfc   bank ")).toBe("hdfc bank");
    expect(cleanQuery("hd\nfc")).toBe("hd fc");
    expect(cleanQuery("a")).toBeNull();
    expect(cleanQuery("x".repeat(41))).toBeNull();
    expect(cleanQuery(7)).toBeNull();
  });
});

describe("toCandidates", () => {
  const q = (symbol: string, name: string, quoteType = "EQUITY") => ({ symbol, longname: name, quoteType });
  it("keeps NSE and BSE equities only, and prefers NSE when a company is on both", () => {
    const out = toCandidates([q("HDFCBANK.BO", "HDFC Bank Limited"), q("HDFCBANK.NS", "HDFC Bank Limited"), q("HDB", "HDFC Bank Limited"), q("HDFCBANK.NS", "HDFC Bank ETF", "ETF"), q("HDFCLIFE.NS", "HDFC Life Insurance Company Limited")]);
    expect(out).toEqual([
      { ticker: "HDFCBANK.NS", name: "HDFC Bank Limited", exchange: "NSE" },
      { ticker: "HDFCLIFE.NS", name: "HDFC Life Insurance Company Limited", exchange: "NSE" },
    ]);
  });
  it("leaves out exchange-traded funds that Yahoo files under equities", () => {
    const out = toCandidates([q("HDFCSILVER.NS", "HDFC Silver ETF"), q("NIFTYBEES.NS", "Nippon India ETF Nifty 50 BeES"), q("HDFCBANK.NS", "HDFC Bank Limited")]);
    expect(out.map((c) => c.ticker)).toEqual(["HDFCBANK.NS"]);
  });
  it("falls back to the short name, caps the list and survives junk", () => {
    expect(toCandidates([{ symbol: "ABC.NS", shortname: "ABC", quoteType: "EQUITY" }])[0].name).toBe("ABC");
    expect(toCandidates(Array.from({ length: 20 }, (_, i) => q(`S${i}.NS`, `Company ${i}`)), 3)).toHaveLength(3);
    expect(toCandidates(null)).toEqual([]);
    expect(toCandidates([null, 4, "x", {}])).toEqual([]);
  });
});

describe("mapSector", () => {
  it("maps Yahoo industries onto the site's sectors, whatever the letter case", () => {
    expect(mapSector("Information Technology Services", SECTORS)).toBe("IT");
    expect(mapSector("auto parts", SECTORS)).toBe("Auto Components");
    expect(mapSector("Drug Manufacturers - Specialty & Generic", SECTORS)).toBe("Pharma");
    expect(mapSector("Household & Personal Products", SECTORS)).toBe("FMCG");
  });
  it("returns null for an industry the site has no sector for, or when the sector was removed", () => {
    expect(mapSector("Banks - Regional", SECTORS)).toBeNull();
    expect(mapSector("Electrical Equipment & Parts", SECTORS)).toBeNull();
    expect(mapSector("Auto Manufacturers", ["IT"])).toBeNull();
    expect(mapSector(undefined, SECTORS)).toBeNull();
  });
});

describe("yearLabel", () => {
  it("labels a March year end as an Indian financial year and other year ends by month", () => {
    expect(yearLabel("2026-03-31")).toBe("FY26");
    expect(yearLabel("2025-12-31")).toBe("Dec 25");
  });
});

describe("buildPreview: a normal company", () => {
  const p = buildPreview(healthy(), SECTORS, NOW);

  it("converts rupees to crore and keeps profit history oldest first", () => {
    expect(p.figures.marketCap).toBe(50_000);
    expect(p.figures.profit).toBe(2_500);
    expect(p.figures.profitHistory).toEqual([1_500, 1_800, 2_100, 2_400]);
    expect(p.figures.historyLabels).toEqual(["FY23", "FY24", "FY25", "FY26"]);
    expect(p.stock.symbol).toBe("ABC");
  });

  it("works ROE out from latest annual profit over average equity", () => {
    expect(p.figures.roe).toBeCloseTo(2_400 / ((12_000 + 11_000) / 2), 6);
  });

  it("works ROCE out from operating profit over average capital employed", () => {
    expect(p.figures.roce).toBeCloseTo(3_300 / (((17_000 - 5_000) + (16_000 - 5_000)) / 2), 6);
  });

  it("suggests the sector and reports every needed figure as present", () => {
    expect(p.suggestedSector).toBe("IT");
    expect(completeness(p)).toEqual({ have: 6, total: 6 });
    expect(p.latestYear).toBe("FY26");
  });

  it("builds a stock the screen can use", () => {
    expect(p.stock.roe).toBeCloseTo(p.figures.roe as number, 9);
    expect(p.stock.profitHistory).toHaveLength(4);
    expect(p.stock.historyLabels).toEqual(p.figures.historyLabels);
  });

  it("always says the figures are not Screener's", () => {
    expect(p.notes.some((n) => n.includes("Screener"))).toBe(true);
  });
  it("mentions the shorter history, since the listed stocks have five years", () => {
    expect(p.notes.some((n) => n.includes("4 years"))).toBe(true);
  });
});

describe("buildPreview: gaps", () => {
  it("a bank has no capital employed, so ROCE is missing and the reason is given", () => {
    const bank = healthy({
      sector: "Financial Services",
      industry: "Banks - Regional",
      years: healthy().years.map((y) => ({ ...y, totalAssets: y.totalAssets, currentLiabilities: undefined })),
    });
    const p = buildPreview(bank, SECTORS, NOW);
    expect(p.figures.roce).toBeNull();
    const roce = p.checks.find((c) => c.key === "roce")!;
    expect(roce.ok).toBe(false);
    expect(roce.detail).toContain("current liabilities");
    expect(p.checks.find((c) => c.key === "sector")!.ok).toBe(false);
    expect(p.notes.some((n) => n.includes("Banks and lenders"))).toBe(true);
  });

  it("falls back to year-end equity with one year of statements and says so", () => {
    const p = buildPreview(healthy({ years: [healthy().years[3]] }), SECTORS, NOW);
    expect(p.figures.roe).toBeCloseTo(2_400 / 12_000, 6);
    expect(p.checks.find((c) => c.key === "roe")!.detail).toContain("only one year of equity");
    expect(p.checks.find((c) => c.key === "history")!.ok).toBe(false);
  });

  it("uses Yahoo's own ROE only when the statements give nothing, and labels it", () => {
    const p = buildPreview(healthy({ years: [], yahooRoe: 0.18 }), SECTORS, NOW);
    expect(p.figures.roe).toBe(0.18);
    expect(p.checks.find((c) => c.key === "roe")!.detail).toContain("Yahoo's own");
  });

  it("separates a failed Yahoo call from a figure Yahoo does not have", () => {
    const failed = buildPreview(healthy({ years: [], yahooRoe: undefined, errors: ["statements: timeout"] }), SECTORS, NOW);
    expect(failed.checks.find((c) => c.key === "roe")!.detail).toContain("request failed");
    const absent = buildPreview(healthy({ years: [], yahooRoe: undefined }), SECTORS, NOW);
    expect(absent.checks.find((c) => c.key === "roe")!.detail).toContain("did not supply");
  });

  it("a loss-maker gets a negative ROE and a profit history with the loss in it", () => {
    const loss = healthy({
      trailingProfit: -300 * CR,
      years: healthy().years.map((y, i) => ({ ...y, netIncome: (i === 3 ? -300 : 200) * CR })),
    });
    const p = buildPreview(loss, SECTORS, NOW);
    expect(p.figures.profit).toBe(-300);
    expect(p.figures.roe as number).toBeLessThan(0);
    expect(p.figures.profitHistory).toEqual([200, 200, 200, -300]);
  });

  it("leaves a year without a profit figure as a hole, not a zero", () => {
    const y = healthy().years.slice();
    y[1] = { ...y[1], netIncome: undefined };
    expect(buildPreview(healthy({ years: y }), SECTORS, NOW).figures.profitHistory).toEqual([1_500, null, 2_100, 2_400]);
  });

  it("does not divide by zero or negative equity, and says why ROE is missing", () => {
    const y = healthy().years.map((s) => ({ ...s, equity: -5 * CR }));
    const p = buildPreview(healthy({ years: y, yahooRoe: undefined }), SECTORS, NOW);
    expect(p.figures.roe).toBeNull();
    expect(p.checks.find((c) => c.key === "roe")!.detail).toContain("equity is negative");
  });

  it("uses the latest annual profit when there is no trailing figure", () => {
    const p = buildPreview(healthy({ trailingProfit: undefined }), SECTORS, NOW);
    expect(p.figures.profit).toBe(2_400);
    expect(p.checks.find((c) => c.key === "profit")!.detail).toContain("latest annual");
  });

  it("warns when the latest annual results are old", () => {
    const old = healthy({ years: healthy().years.slice(0, 2) });
    expect(buildPreview(old, SECTORS, NOW).notes.some((n) => n.includes("out of date"))).toBe(true);
    expect(buildPreview(healthy(), SECTORS, NOW).notes.some((n) => n.includes("out of date"))).toBe(false);
  });

  it("notes a big gap between Yahoo's own ROE and the annual figure", () => {
    const p = buildPreview(healthy({ yahooRoe: 0.09 }), SECTORS, NOW); // annual figure is about 20.9%
    expect(p.notes.some((n) => n.includes("Yahoo's own ROE is 9.0%"))).toBe(true);
  });

  it("sorts statements into order and keeps at most five years", () => {
    const many = ["2020-03-31", "2021-03-31", "2022-03-31", "2023-03-31", "2024-03-31", "2025-03-31", "2026-03-31"].map((d, i) => year(d, { netIncome: (i + 1) * 100 * CR }));
    const p = buildPreview(healthy({ years: [...many].reverse() }), SECTORS, NOW);
    expect(p.figures.profitHistory).toEqual([300, 400, 500, 600, 700]);
  });
});
