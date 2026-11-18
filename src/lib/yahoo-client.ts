import YahooFinance from "yahoo-finance2";
import { buildPreview, toCandidates, type Candidate, type Preview, type RawYahoo, type StatementYear } from "./yahoo";

/**
 * The only file that talks to Yahoo Finance (through the open-source yahoo-finance2 package). Server-side only: the
 * browser cannot call Yahoo directly, so the pages go through the routes in src/app/api.
 *
 * Each Yahoo call is made on its own. If one fails, the others still count and the failure is recorded in `errors`,
 * so the preview can say which figures are missing and why instead of failing as a whole.
 */
const yf = new YahooFinance();
// Yahoo's data is checked loosely: an unexpected extra or missing field should not discard the whole answer.
const loose = { validateResult: false } as const;

const num = (x: unknown): number | undefined => (typeof x === "number" && Number.isFinite(x) ? x : undefined);
const str = (x: unknown): string | undefined => (typeof x === "string" && x.trim() ? x.trim() : undefined);
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 160);

/** NSE and BSE equities matching a company name or symbol. */
export async function searchCandidates(query: string): Promise<Candidate[]> {
  const res = await yf.search(query, { quotesCount: 12, newsCount: 0 }, loose);
  return toCandidates((res as { quotes?: unknown }).quotes);
}

type StatementRow = Record<string, unknown> & { date?: unknown };

function toYear(r: StatementRow): StatementYear | null {
  const d = r.date instanceof Date ? r.date : typeof r.date === "string" || typeof r.date === "number" ? new Date(r.date) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return {
    date: d.toISOString().slice(0, 10),
    netIncome: num(r.netIncomeCommonStockholders) ?? num(r.netIncome),
    ebit: num(r.EBIT) ?? num(r.operatingIncome),
    equity: num(r.stockholdersEquity) ?? num(r.commonStockEquity),
    totalAssets: num(r.totalAssets),
    currentLiabilities: num(r.currentLiabilities),
    revenue: num(r.totalRevenue),
  };
}

/** Everything the screen needs for one Indian listing, as Yahoo supplies it. */
export async function fetchRaw(ticker: string): Promise<RawYahoo> {
  const raw: RawYahoo = { ticker, name: ticker, years: [], errors: [] };
  const sixYearsAgo = new Date(Date.now() - 6.5 * 365 * 86_400_000).toISOString().slice(0, 10);

  const [quote, profile, series] = await Promise.allSettled([
    yf.quote(ticker, {}, loose),
    yf.quoteSummary(ticker, { modules: ["summaryProfile", "financialData", "defaultKeyStatistics"] }, loose),
    yf.fundamentalsTimeSeries(ticker, { period1: sixYearsAgo, type: "annual", module: "all" }, loose),
  ]);

  if (quote.status === "fulfilled" && quote.value) {
    const q = quote.value as Record<string, unknown>;
    raw.name = str(q.longName) ?? str(q.shortName) ?? ticker;
    raw.currency = str(q.currency);
    raw.price = num(q.regularMarketPrice);
    raw.marketCap = num(q.marketCap);
    raw.high52 = num(q.fiftyTwoWeekHigh);
    raw.low52 = num(q.fiftyTwoWeekLow);
    raw.pe = num(q.trailingPE);
  } else {
    raw.errors.push(`quote: ${quote.status === "rejected" ? msg(quote.reason) : "empty"}`);
  }

  if (profile.status === "fulfilled" && profile.value) {
    const p = profile.value as Record<string, Record<string, unknown> | undefined>;
    raw.sector = str(p.summaryProfile?.sector);
    raw.industry = str(p.summaryProfile?.industry);
    raw.yahooRoe = num(p.financialData?.returnOnEquity);
    raw.revenueTTM = num(p.financialData?.totalRevenue);
    raw.trailingProfit = num(p.defaultKeyStatistics?.netIncomeToCommon);
  } else {
    raw.errors.push(`profile: ${profile.status === "rejected" ? msg(profile.reason) : "empty"}`);
  }

  if (series.status === "fulfilled" && Array.isArray(series.value)) {
    raw.years = (series.value as StatementRow[]).map(toYear).filter((y): y is StatementYear => y !== null);
  } else {
    raw.errors.push(`statements: ${series.status === "rejected" ? msg(series.reason) : "empty"}`);
  }
  return raw;
}

export class NotIndianListing extends Error {}
/** Yahoo answered but has nothing for this ticker. */
export class NothingFound extends Error {}
/** Every Yahoo call failed, so the problem is reaching Yahoo, not the ticker. */
export class YahooUnreachable extends Error {}

/** The preview for one ticker. Throws NotIndianListing / NothingFound for the two cases the page explains in words. */
export async function fetchPreview(ticker: string, siteSectors: string[]): Promise<Preview> {
  const raw = await fetchRaw(ticker);
  if (raw.errors.length) console.error(`[yahoo] ${ticker}: ${raw.errors.join(" | ")}`); // visible in the host's logs, never sent to the browser
  if (raw.errors.length >= 3) throw new YahooUnreachable(raw.errors.join("; "));
  if (raw.currency && raw.currency !== "INR") throw new NotIndianListing(`${ticker} is priced in ${raw.currency}`);
  const gotNothing = raw.price === undefined && raw.marketCap === undefined && raw.years.length === 0;
  if (gotNothing) throw new NothingFound(raw.errors.join("; ") || "Yahoo returned nothing for this ticker");
  return buildPreview(raw, siteSectors);
}
