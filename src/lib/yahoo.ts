import type { Stock } from "./types";

/**
 * Turns what Yahoo Finance returns into the figures the screen uses. Nothing here touches the network:
 * yahoo-client.ts fetches and hands over a `RawYahoo`, this file works out ROE, ROCE, profit history and the
 * sector, and reports which of the needed figures Yahoo did and did not supply.
 *
 * Yahoo does not publish ROCE and its own ROE is a trailing figure that can sit far from the annual one, so both
 * are worked out from the annual statements. They will not match Screener.in to the decimal; the preview says so.
 */

const CRORE = 1e7; // Yahoo reports rupees; the site shows rupees crore
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const toCrore = (x: number | null | undefined): number | null => (isNum(x) ? Math.round((x / CRORE) * 10) / 10 : null);

// ---- search ---------------------------------------------------------------------------------------------------

export type Candidate = { ticker: string; name: string; exchange: "NSE" | "BSE" };

const TICKER = /^[A-Z0-9&-]{1,20}\.(NS|BO)$/;
const FUND_NAME = /\b(ETF|FOF|BeES|Index Fund|Mutual Fund|Liquid Fund)\b/i;

/** A Yahoo ticker for an Indian listing, upper-cased, or null. Anything else is refused before it reaches Yahoo. */
export function cleanTicker(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const t = input.trim().toUpperCase();
  return TICKER.test(t) ? t : null;
}

/** A search phrase that is safe to forward: trimmed, control characters removed, 2 to 40 characters. */
export function cleanQuery(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const q = input.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return q.length >= 2 && q.length <= 40 ? q : null;
}

/** Equities listed on NSE or BSE from a Yahoo search result. One entry per company, preferring NSE. */
export function toCandidates(quotes: unknown, max = 6): Candidate[] {
  if (!Array.isArray(quotes)) return [];
  const out: Candidate[] = [];
  const seen = new Map<string, number>(); // company name -> index in out
  for (const q of quotes) {
    if (!q || typeof q !== "object") continue;
    const r = q as Record<string, unknown>;
    const ticker = cleanTicker(r.symbol);
    if (!ticker || r.quoteType !== "EQUITY") continue;
    const name = String(r.longname ?? r.shortname ?? ticker).trim();
    if (FUND_NAME.test(name)) continue; // Yahoo files some NSE exchange-traded funds under EQUITY
    const exchange = ticker.endsWith(".NS") ? "NSE" : "BSE";
    const key = name.toLowerCase();
    const at = seen.get(key);
    if (at !== undefined) {
      if (out[at].exchange === "BSE" && exchange === "NSE") out[at] = { ticker, name, exchange }; // NSE wins
      continue;
    }
    seen.set(key, out.length);
    out.push({ ticker, name, exchange });
  }
  return out.slice(0, max);
}

// ---- sector ---------------------------------------------------------------------------------------------------

/**
 * Yahoo industries that belong in each of the site's sectors. A suggestion only: the person can pick another sector.
 * Auto Batteries has no Yahoo industry of its own, so it is never suggested.
 */
const INDUSTRY_TO_SECTOR: Record<string, string> = {
  "information technology services": "IT",
  "software - application": "IT",
  "software - infrastructure": "IT",
  "auto manufacturers": "Auto",
  "auto parts": "Auto Components",
  "drug manufacturers - specialty & generic": "Pharma",
  "drug manufacturers - general": "Pharma",
  biotechnology: "Pharma",
  "household & personal products": "FMCG",
  "packaged foods": "FMCG",
  tobacco: "FMCG",
  confectioners: "FMCG",
  "beverages - non-alcoholic": "FMCG",
  "beverages - brewers": "FMCG",
  "beverages - wineries & distilleries": "FMCG",
};

/** The site sector for a Yahoo industry, only if the site actually has that sector. */
export function mapSector(industry: string | null | undefined, siteSectors: string[]): string | null {
  const s = industry ? INDUSTRY_TO_SECTOR[industry.trim().toLowerCase()] : undefined;
  return s && siteSectors.includes(s) ? s : null;
}

// ---- derive ---------------------------------------------------------------------------------------------------

/** One fiscal year of statements, in rupees as Yahoo reports them. Missing items are left out. */
export type StatementYear = {
  date: string; // fiscal year end, yyyy-mm-dd
  netIncome?: number;
  ebit?: number;
  equity?: number;
  totalAssets?: number;
  currentLiabilities?: number;
  revenue?: number;
};

export type RawYahoo = {
  ticker: string;
  name: string;
  currency?: string;
  price?: number;
  marketCap?: number; // rupees
  high52?: number;
  low52?: number;
  pe?: number;
  trailingProfit?: number; // rupees
  yahooRoe?: number; // Yahoo's own figure, a fraction
  revenueTTM?: number; // rupees
  sector?: string;
  industry?: string;
  years: StatementYear[]; // any order
  /** Which of Yahoo's calls failed, so a gap can be told apart from a figure Yahoo simply does not have. */
  errors: string[];
};

export type FieldCheck = {
  key: string;
  label: string;
  ok: boolean;
  /** Where the figure came from, or why it is missing. */
  detail: string;
};

export type Figures = {
  price: number | null;
  marketCap: number | null; // crore
  revenue: number | null;
  profit: number | null;
  roe: number | null;
  roce: number | null;
  pe: number | null;
  high52: number | null;
  low52: number | null;
  profitHistory: (number | null)[];
  historyLabels: string[];
};

export type Preview = {
  ticker: string;
  name: string;
  stock: Stock;
  figures: Figures;
  yahooSector: string | null;
  yahooIndustry: string | null;
  suggestedSector: string | null;
  latestYear: string | null; // e.g. "FY26"
  checks: FieldCheck[];
  notes: string[];
};

const MAX_YEARS = 5;

/** "FY26" for a 31 March year end, otherwise "Dec 25" style, so the label never claims a year it is not. */
export function yearLabel(date: string): string {
  const [y, m] = date.split("-").map(Number);
  if (!y || !m) return date;
  if (m === 3) return `FY${String(y).slice(-2)}`;
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
  return `${mon} ${String(y).slice(-2)}`;
}

const ratio = (num: number | null | undefined, den: number | null | undefined): number | null =>
  isNum(num) && isNum(den) && den > 0 ? num / den : null;

const avg2 = (a: number | undefined, b: number | undefined): number | null => (isNum(a) && isNum(b) ? (a + b) / 2 : null);

/**
 * Builds the preview. `siteSectors` are the sector names on the site, used for the sector suggestion.
 * `now` is only used to say whether the latest annual results look out of date.
 */
export function buildPreview(raw: RawYahoo, siteSectors: string[], now: Date = new Date()): Preview {
  const years = raw.years
    .filter((y) => y && typeof y.date === "string")
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_YEARS);
  const last = years[years.length - 1];
  const prev = years[years.length - 2];
  const notes: string[] = [];

  // Profit history: oldest first, in crore, a hole where Yahoo has no figure for that year.
  const profitHistory = years.map((y) => toCrore(y.netIncome));
  const historyLabels = years.map((y) => yearLabel(y.date));
  const profitYears = profitHistory.filter(isNum).length;

  // ROE: latest annual profit over the average of the last two year-end equities. One year of equity is used as is.
  let roe: number | null = null;
  let roeDetail = "";
  const avgEquity = avg2(last?.equity, prev?.equity);
  if (isNum(last?.netIncome) && isNum(avgEquity)) {
    roe = ratio(last.netIncome, avgEquity);
    roeDetail = "latest annual profit over average equity";
  } else if (isNum(last?.netIncome) && isNum(last?.equity)) {
    roe = ratio(last.netIncome, last.equity);
    roeDetail = "latest annual profit over year-end equity (only one year of equity)";
  } else if (isNum(raw.yahooRoe)) {
    roe = raw.yahooRoe;
    roeDetail = "Yahoo's own trailing figure (the statements were not enough)";
  }

  // ROCE: operating profit over capital employed (total assets less current liabilities), averaged over two years.
  const capital = (y?: StatementYear) =>
    y && isNum(y.totalAssets) && isNum(y.currentLiabilities) ? y.totalAssets - y.currentLiabilities : undefined;
  const ebit = last?.ebit;
  const avgCapital = avg2(capital(last), capital(prev));
  let roce: number | null = null;
  let roceDetail = "";
  if (isNum(ebit) && isNum(avgCapital)) {
    roce = ratio(ebit, avgCapital);
    roceDetail = "operating profit over average capital employed";
  } else if (isNum(ebit) && isNum(capital(last))) {
    roce = ratio(ebit, capital(last));
    roceDetail = "operating profit over year-end capital employed (only one year)";
  }

  const trailing = toCrore(raw.trailingProfit);
  const latestProfit = toCrore(last?.netIncome);
  const profit = trailing ?? latestProfit;
  const profitDetail = trailing !== null ? "trailing twelve months, from Yahoo" : latestProfit !== null ? "latest annual figure (no trailing figure from Yahoo)" : "";

  const figures: Figures = {
    price: isNum(raw.price) ? raw.price : null,
    marketCap: toCrore(raw.marketCap),
    revenue: toCrore(raw.revenueTTM ?? last?.revenue),
    profit,
    roe,
    roce,
    pe: isNum(raw.pe) ? raw.pe : null,
    high52: isNum(raw.high52) ? raw.high52 : null,
    low52: isNum(raw.low52) ? raw.low52 : null,
    profitHistory,
    historyLabels,
  };

  const suggestedSector = mapSector(raw.industry, siteSectors);
  const latestYear = last ? yearLabel(last.date) : null;

  const failed = (what: string) => raw.errors.some((e) => e.startsWith(what));
  const missing = (what: string, call: string) => (failed(call) ? `Yahoo's ${what} request failed` : "Yahoo did not supply it");

  const checks: FieldCheck[] = [
    { key: "price", label: "Price and market cap", ok: figures.price !== null && figures.marketCap !== null, detail: figures.price !== null && figures.marketCap !== null ? "from Yahoo's quote" : missing("quote", "quote") },
    {
      key: "roe",
      label: "ROE",
      ok: roe !== null,
      detail: roe !== null ? roeDetail : isNum(last?.equity) && last.equity <= 0 ? "shareholders' equity is negative, so ROE is not meaningful" : missing("statements", "statements"),
    },
    {
      key: "roce",
      label: "ROCE",
      ok: roce !== null,
      detail: roce !== null ? roceDetail : isNum(ebit) ? "Yahoo gives no current liabilities for this company, so capital employed cannot be worked out" : missing("statements", "statements"),
    },
    { key: "profit", label: "Profit (trailing)", ok: profit !== null, detail: profit !== null ? profitDetail : missing("profile", "profile") },
    {
      key: "history",
      label: "Annual profit history",
      ok: profitYears >= 4,
      detail: profitYears >= 4 ? `${profitYears} years (${historyLabels[0]} to ${historyLabels[historyLabels.length - 1]})${profitYears < MAX_YEARS ? `; the listed stocks have ${MAX_YEARS}` : ""}` : profitYears > 0 ? `only ${profitYears} year${profitYears === 1 ? "" : "s"}, too few to rate consistency` : missing("statements", "statements"),
    },
    {
      key: "sector",
      label: "Sector",
      ok: suggestedSector !== null,
      detail: suggestedSector ? `Yahoo: ${raw.industry} → ${suggestedSector}` : raw.industry ? `Yahoo calls it ${raw.sector ?? "?"} / ${raw.industry}, which is not one of the site's sectors` : missing("profile", "profile"),
    },
  ];

  // Notes the reader should see next to the numbers.
  if (raw.sector === "Financial Services") notes.push("Banks and lenders do not report capital employed the way other companies do, so ROCE is usually missing and the screen cannot give a verdict.");
  if (profitYears > 0 && profitYears < MAX_YEARS && profitYears >= 4) notes.push(`Yahoo returned ${profitYears} years of annual profit; the listed stocks have ${MAX_YEARS}, so growth is measured over a shorter span.`);
  if (roe !== null && isNum(raw.yahooRoe) && Math.abs(raw.yahooRoe - roe) > 0.05 && !roeDetail.startsWith("Yahoo")) {
    notes.push(`Yahoo's own ROE is ${(raw.yahooRoe * 100).toFixed(1)}% against ${(roe * 100).toFixed(1)}% worked out from the annual figures. The annual figure is used because it matches how the listed stocks are measured.`);
  }
  if (last) {
    const ageDays = (now.getTime() - new Date(last.date + "T00:00:00Z").getTime()) / 86_400_000;
    if (ageDays > 460) notes.push(`The latest annual results Yahoo has are for ${latestYear}, so the figures may be out of date.`);
  }
  notes.push("Worked out from Yahoo Finance's annual statements, not Screener.in. ROE and ROCE can differ from Screener's by around 10%, enough to move a stock that is near the cut-off.");

  const stock: Stock = {
    name: raw.name,
    symbol: raw.ticker.replace(/\.(NS|BO)$/, ""),
    marketCap: figures.marketCap ?? 0,
    revenue: figures.revenue ?? 0,
    profit: figures.profit ?? 0,
    roe,
    roce,
    pe: figures.pe,
    price: figures.price ?? 0,
    high52: figures.high52 ?? 0,
    low52: figures.low52 ?? 0,
    profitHistory: profitHistory.length ? profitHistory : null,
    roe5y: null,
    roceHistory: null,
    notes: [],
    historyLabels,
  };

  return { ticker: raw.ticker, name: raw.name, stock, figures, yahooSector: raw.sector ?? null, yahooIndustry: raw.industry ?? null, suggestedSector, latestYear, checks, notes };
}

/** Plain-language one-liner for how complete the data is, e.g. "5 of 6 needed figures". */
export function completeness(p: Preview): { have: number; total: number } {
  return { have: p.checks.filter((c) => c.ok).length, total: p.checks.length };
}
