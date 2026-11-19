export type Stock = {
  name: string;
  symbol: string;
  marketCap: number;
  revenue: number;
  profit: number;
  roe: number | null;
  roce: number | null;
  pe: number | null;
  price: number;
  high52: number;
  low52: number;
  /** Net profit, oldest to newest (FY22..FY26 unless historyLabels says otherwise). */
  profitHistory: (number | null)[] | null;
  roe5y: number | null;
  roceHistory: (number | null)[] | null;
  notes: string[];
  historyLabels?: string[];
  /** ROCE is not meaningful for banks, lenders and insurers, so the verdict looks at ROE alone (best result: Moderate). */
  roceNa?: boolean;
};

/** Where a sector built on the fly from Yahoo Finance came from. Listed sectors in data/stocks.json do not have this. */
export type BuiltInfo = {
  kind: "sector" | "industry";
  yahooName: string; // exactly as Yahoo spells it
  parentSector: string | null;
  total: number; // NSE stocks Yahoo has under it
  listsFetchedAt: string | null; // when the stored top-ten list was fetched
  oldest: string | null; // when the oldest figure used was fetched from Yahoo
  skipped: { symbol: string; name: string; reason: string }[];
  shared?: boolean; // true when the server keeps this sector and shows it to every visitor
  builtAt?: string; // when the server built the shared copy
};

export type Sector = { name: string; title: string; stocks: Stock[]; built?: BuiltInfo };

export type Dataset = { asOf: string; units: string; sectors: Sector[] };
