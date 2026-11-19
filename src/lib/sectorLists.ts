/**
 * The stored "top stocks by sector" lists: types, the Yahoo screener query, and the checks on what comes back.
 * Pure functions only. The Yahoo call itself lives in yahoo-client.ts and the weekly job that fills the file in
 * scripts/refresh-sector-lists.ts.
 */

export type ListedStock = { symbol: string; name: string; marketCap: number }; // marketCap in rupees crore

/** A Yahoo sector (11 of them) or industry (about 145) and its largest NSE stocks by market cap. */
export type SectorList = {
  kind: "sector" | "industry";
  name: string; // exactly as Yahoo spells it, e.g. "Banks—Regional"
  sector: string | null; // the sector an industry belongs to
  total: number; // how many NSE stocks Yahoo has under it
  stocks: ListedStock[]; // at most TOP_N, largest first
};

export type SectorFile = { fetchedAt: string | null; lists: SectorList[] };

export type Taxonomy = { sectors: Record<string, string[]> };

export const TOP_N = 10;
const CRORE = 1e7;
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** The body Yahoo's screener expects: Indian NSE equities in one sector or industry, largest market cap first. */
export function screenerBody(field: "sector" | "industry", value: string, size: number = TOP_N) {
  const eq = (f: string, v: string) => ({ operator: "eq", operands: [f, v] });
  return {
    offset: 0,
    size,
    sortField: "intradaymarketcap",
    sortType: "DESC",
    quoteType: "EQUITY",
    query: { operator: "AND", operands: [eq("region", "in"), eq("exchange", "NSI"), eq(field, value)] },
    userId: "",
    userIdType: "guid",
  };
}

/** NSE stocks from the screener's rows: a symbol ending .NS, a name and a market cap, each company once. */
export function toListedStocks(rows: unknown): ListedStock[] {
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const out: ListedStock[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const symbol = typeof r?.symbol === "string" ? r.symbol.trim().toUpperCase() : "";
    const name = (typeof r?.longName === "string" && r.longName.trim()) || (typeof r?.shortName === "string" && r.shortName.trim()) || symbol;
    if (!/^[A-Z0-9&-]{1,20}\.NS$/.test(symbol) || seen.has(symbol) || !isNum(r.marketCap) || r.marketCap <= 0) continue;
    seen.add(symbol);
    out.push({ symbol, name, marketCap: Math.round(r.marketCap / CRORE) });
  }
  return out;
}

/** True for a file that can be shown: well-formed lists, each with at most TOP_N stocks. Refuses anything else. */
export function isSectorFile(x: unknown): x is SectorFile {
  if (!x || typeof x !== "object") return false;
  const f = x as SectorFile;
  return (
    Array.isArray(f.lists) &&
    f.lists.every(
      (l) =>
        l &&
        (l.kind === "sector" || l.kind === "industry") &&
        typeof l.name === "string" &&
        isNum(l.total) &&
        Array.isArray(l.stocks) &&
        l.stocks.length <= TOP_N &&
        l.stocks.every((s) => typeof s.symbol === "string" && typeof s.name === "string" && isNum(s.marketCap)),
    )
  );
}
