import { beforeEach, describe, expect, it, vi } from "vitest";

// Yahoo is replaced by canned answers shaped like the ones yahoo-finance2 returns, so the client's field mapping,
// partial-failure handling and error classes are tested without the network.
const yf = vi.hoisted(() => ({ search: vi.fn(), quote: vi.fn(), quoteSummary: vi.fn(), fundamentalsTimeSeries: vi.fn(), _fetch: vi.fn() }));
vi.mock("yahoo-finance2", () => ({ default: class { search = yf.search; quote = yf.quote; quoteSummary = yf.quoteSummary; fundamentalsTimeSeries = yf.fundamentalsTimeSeries; _fetch = yf._fetch; } }));

import { ForeignReporting, NotIndianListing, NothingFound, YahooUnreachable, fetchPreview, fetchRaw, fetchTopStocks, searchCandidates } from "./yahoo-client";

const CR = 1e7;
const SECTORS = ["IT", "Auto", "Auto Components", "Auto Batteries", "Pharma", "FMCG"];
const row = (date: string, o: Record<string, number>) => ({ date: new Date(date), TYPE: "ALL", periodType: "12M", ...o });

const goodQuote = { longName: "ABC Industries Limited", currency: "INR", regularMarketPrice: 250.5, marketCap: 50_000 * CR, fiftyTwoWeekHigh: 300, fiftyTwoWeekLow: 200, trailingPE: 20 };
const goodProfile = {
  summaryProfile: { sector: "Technology", industry: "Information Technology Services" },
  financialData: { returnOnEquity: 0.2, totalRevenue: 20_000 * CR },
  defaultKeyStatistics: { netIncomeToCommon: 2_500 * CR },
};
const goodSeries = [
  row("2025-03-31", { netIncomeCommonStockholders: 2_100 * CR, EBIT: 2_800 * CR, stockholdersEquity: 11_000 * CR, totalAssets: 16_000 * CR, currentLiabilities: 5_000 * CR }),
  row("2026-03-31", { netIncomeCommonStockholders: 2_400 * CR, EBIT: 3_300 * CR, stockholdersEquity: 12_000 * CR, totalAssets: 17_000 * CR, currentLiabilities: 5_000 * CR, totalRevenue: 19_000 * CR }),
];

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  for (const f of Object.values(yf)) f.mockReset();
});

describe("searchCandidates", () => {
  it("returns NSE and BSE equities from Yahoo's quotes", async () => {
    yf.search.mockResolvedValue({ quotes: [{ symbol: "HDFCBANK.NS", longname: "HDFC Bank Limited", quoteType: "EQUITY" }, { symbol: "HDB", longname: "HDFC Bank Limited", quoteType: "EQUITY" }], news: [] });
    expect(await searchCandidates("hdfc")).toEqual([{ ticker: "HDFCBANK.NS", name: "HDFC Bank Limited", exchange: "NSE" }]);
    expect(yf.search).toHaveBeenCalledWith("hdfc", expect.objectContaining({ newsCount: 0 }), expect.anything());
  });
});

describe("fetchRaw", () => {
  it("maps Yahoo's quote, profile and statement fields", async () => {
    yf.quote.mockResolvedValue(goodQuote);
    yf.quoteSummary.mockResolvedValue(goodProfile);
    yf.fundamentalsTimeSeries.mockResolvedValue(goodSeries);
    const r = await fetchRaw("ABC.NS");
    expect(r).toMatchObject({ name: "ABC Industries Limited", currency: "INR", price: 250.5, pe: 20, sector: "Technology", industry: "Information Technology Services", yahooRoe: 0.2, errors: [] });
    expect(r.trailingProfit).toBe(2_500 * CR);
    expect(r.years).toEqual([
      expect.objectContaining({ date: "2025-03-31", netIncome: 2_100 * CR, ebit: 2_800 * CR, equity: 11_000 * CR }),
      expect.objectContaining({ date: "2026-03-31", revenue: 19_000 * CR, currentLiabilities: 5_000 * CR }),
    ]);
  });

  it("asks for annual statements covering six or more years", async () => {
    yf.quote.mockResolvedValue(goodQuote);
    yf.quoteSummary.mockResolvedValue(goodProfile);
    yf.fundamentalsTimeSeries.mockResolvedValue([]);
    await fetchRaw("ABC.NS");
    const [, opts] = yf.fundamentalsTimeSeries.mock.calls[0];
    expect(opts).toMatchObject({ type: "annual", module: "all" });
    expect(Date.now() - new Date(opts.period1).getTime()).toBeGreaterThan(6 * 365 * 86_400_000);
  });

  it("falls back to operating income and common equity when the first names are absent", async () => {
    yf.quote.mockResolvedValue(goodQuote);
    yf.quoteSummary.mockResolvedValue(goodProfile);
    yf.fundamentalsTimeSeries.mockResolvedValue([row("2026-03-31", { netIncome: 5 * CR, operatingIncome: 7 * CR, commonStockEquity: 40 * CR })]);
    expect((await fetchRaw("ABC.NS")).years[0]).toMatchObject({ netIncome: 5 * CR, ebit: 7 * CR, equity: 40 * CR });
  });

  it("keeps what the other calls returned when one fails, and records the failure", async () => {
    yf.quote.mockResolvedValue(goodQuote);
    yf.quoteSummary.mockRejectedValue(new Error("crumb expired"));
    yf.fundamentalsTimeSeries.mockResolvedValue(goodSeries);
    const r = await fetchRaw("ABC.NS");
    expect(r.price).toBe(250.5);
    expect(r.years).toHaveLength(2);
    expect(r.errors).toEqual(["profile: crumb expired"]);
  });

  it("ignores rows with no usable date and values that are not numbers", async () => {
    yf.quote.mockResolvedValue(goodQuote);
    yf.quoteSummary.mockResolvedValue({ financialData: { returnOnEquity: "n/a" } });
    yf.fundamentalsTimeSeries.mockResolvedValue([{ netIncome: 1 }, row("2026-03-31", { netIncome: Number.NaN })]);
    const r = await fetchRaw("ABC.NS");
    expect(r.yahooRoe).toBeUndefined();
    expect(r.years).toEqual([expect.objectContaining({ date: "2026-03-31", netIncome: undefined })]);
  });
});

describe("fetchPreview", () => {
  it("builds the preview with the sector suggestion", async () => {
    yf.quote.mockResolvedValue(goodQuote);
    yf.quoteSummary.mockResolvedValue(goodProfile);
    yf.fundamentalsTimeSeries.mockResolvedValue(goodSeries);
    const p = await fetchPreview("ABC.NS", SECTORS);
    expect(p.suggestedSector).toBe("IT");
    expect(p.figures.marketCap).toBe(50_000);
  });

  it("refuses a company that is not priced in rupees", async () => {
    yf.quote.mockResolvedValue({ ...goodQuote, currency: "USD" });
    yf.quoteSummary.mockResolvedValue(goodProfile);
    yf.fundamentalsTimeSeries.mockResolvedValue(goodSeries);
    await expect(fetchPreview("ABC.NS", SECTORS)).rejects.toBeInstanceOf(NotIndianListing);
  });

  it("refuses a rupee-listed company whose statements are in dollars, because its amounts would be ~90x too small", async () => {
    yf.quote.mockResolvedValue(goodQuote);
    yf.quoteSummary.mockResolvedValue({ ...goodProfile, financialData: { ...goodProfile.financialData, financialCurrency: "USD" } });
    yf.fundamentalsTimeSeries.mockResolvedValue(goodSeries);
    await expect(fetchPreview("ABC.NS", SECTORS)).rejects.toBeInstanceOf(ForeignReporting);
  });

  it("says Yahoo was unreachable when every call fails, not that the ticker has no data", async () => {
    for (const f of [yf.quote, yf.quoteSummary, yf.fundamentalsTimeSeries]) f.mockRejectedValue(new Error("ECONNRESET"));
    await expect(fetchPreview("ABC.NS", SECTORS)).rejects.toBeInstanceOf(YahooUnreachable);
  });

  it("says there is no data when Yahoo answers but has nothing", async () => {
    yf.quote.mockResolvedValue(undefined);
    yf.quoteSummary.mockResolvedValue({});
    yf.fundamentalsTimeSeries.mockResolvedValue([]);
    await expect(fetchPreview("ABC.NS", SECTORS)).rejects.toBeInstanceOf(NothingFound);
  });

  it("still returns a preview when only the statements failed, listing what is missing", async () => {
    yf.quote.mockResolvedValue(goodQuote);
    yf.quoteSummary.mockResolvedValue(goodProfile);
    yf.fundamentalsTimeSeries.mockRejectedValue(new Error("timeout"));
    const p = await fetchPreview("ABC.NS", SECTORS);
    expect(p.figures.roce).toBeNull();
    expect(p.checks.find((c) => c.key === "history")!.ok).toBe(false);
    expect(p.checks.find((c) => c.key === "history")!.detail).toContain("request failed");
  });
});

describe("fetchTopStocks", () => {
  const reply = (quotes: unknown[], total = 41) => ({ finance: { result: [{ total, quotes }] } });
  it("sends the screener query as a POST with the crumb, after warming the cookie with an ordinary call", async () => {
    yf.quote.mockResolvedValue({});
    yf._fetch.mockResolvedValue(reply([{ symbol: "HDFCBANK.NS", longName: "HDFC Bank Limited", marketCap: 1_248_124 * CR }]));
    const r = await fetchTopStocks("industry", "Banks\u2014Regional");
    expect(r).toEqual({ total: 41, stocks: [{ symbol: "HDFCBANK.NS", name: "HDFC Bank Limited", marketCap: 1248124 }] });
    const [url, , opts, kind, crumb] = yf._fetch.mock.calls[0];
    expect(url).toContain("/v1/finance/screener");
    expect(kind).toBe("json");
    expect(crumb).toBe(true);
    expect(opts.fetchOptions.method).toBe("POST");
    expect(JSON.parse(opts.fetchOptions.body).query.operands.at(-1)).toEqual({ operator: "eq", operands: ["industry", "Banks\u2014Regional"] });
    expect(yf.quote.mock.invocationCallOrder[0]).toBeLessThan(yf._fetch.mock.invocationCallOrder[0]);
  });
  it("treats an unknown name as zero stocks, which is what Yahoo answers", async () => {
    yf.quote.mockResolvedValue({});
    yf._fetch.mockResolvedValue(reply([], 0));
    expect(await fetchTopStocks("industry", "Banks")).toEqual({ total: 0, stocks: [] });
  });
  it("says Yahoo was unreachable when the call fails", async () => {
    yf.quote.mockResolvedValue({});
    yf._fetch.mockRejectedValue(new Error("Failed to get crumb, status 429"));
    await expect(fetchTopStocks("sector", "Healthcare")).rejects.toBeInstanceOf(YahooUnreachable);
  });
});
