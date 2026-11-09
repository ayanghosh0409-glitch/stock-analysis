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
};

export type Sector = { name: string; title: string; stocks: Stock[] };

export type Dataset = { asOf: string; units: string; sectors: Sector[] };
