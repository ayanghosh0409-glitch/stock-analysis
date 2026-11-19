import { describe, expect, it } from "vitest";
import { searchSite, type SiteSector, type SiteStock } from "./siteSearch";

const sectors: SiteSector[] = [
  { name: "IT", n: 11, built: false },
  { name: "Auto", n: 10, built: false },
  { name: "Auto Components", n: 11, built: false },
  { name: "Pharma", n: 10, built: false },
  { name: "Banks—Regional", n: 10, built: true },
];
const stock = (name: string, symbol: string, sector: string, built = false): SiteStock => ({ name, symbol, sector, built });
const stocks: SiteStock[] = [
  stock("Tata Consultancy Services", "TCS", "IT"),
  stock("Infosys", "INFY", "IT"),
  stock("Tata Motors", "TATAMOTORS", "Auto"),
  stock("Maruti Suzuki India", "MARUTI", "Auto"),
  stock("Sun Pharmaceutical", "SUNPHARMA", "Pharma"),
  stock("HDFC Bank", "HDFCBANK", "Banks—Regional", true),
  stock("Tata Consultancy Services", "TCS", "Banks—Regional", true), // the same company in a built sector too
];

const names = (r: { name: string }[]) => r.map((x) => x.name);

describe("searchSite", () => {
  it("finds nothing for an empty or blank search", () => {
    expect(searchSite("", sectors, stocks)).toEqual({ sectors: [], stocks: [] });
    expect(searchSite("   ", sectors, stocks)).toEqual({ sectors: [], stocks: [] });
    expect(searchSite("--", sectors, stocks)).toEqual({ sectors: [], stocks: [] });
  });

  it("finds a stock by the start of its name, a word in it, or its ticker, in any case", () => {
    expect(names(searchSite("infos", sectors, stocks).stocks)).toEqual(["Infosys"]);
    expect(names(searchSite("CONSULTANCY", sectors, stocks).stocks)).toEqual(["Tata Consultancy Services"]);
    expect(names(searchSite("tcs", sectors, stocks).stocks)).toEqual(["Tata Consultancy Services"]);
    expect(names(searchSite("sunpharma", sectors, stocks).stocks)).toEqual(["Sun Pharmaceutical"]);
  });

  it("ignores the exchange ending on a ticker", () => {
    expect(names(searchSite("TCS.NS", sectors, stocks).stocks)).toEqual(["Tata Consultancy Services"]);
    expect(names(searchSite("hdfcbank.bo", sectors, stocks).stocks)).toEqual(["HDFC Bank"]);
  });

  it("needs every typed word to match, in any order", () => {
    expect(names(searchSite("tata motors", sectors, stocks).stocks)).toEqual(["Tata Motors"]);
    expect(names(searchSite("services tata", sectors, stocks).stocks)).toEqual(["Tata Consultancy Services"]);
    expect(searchSite("tata pharma", sectors, stocks).stocks).toEqual([]);
  });

  it("shows a company that sits in two sectors once, under the first sector given", () => {
    const hits = searchSite("tcs", sectors, stocks).stocks;
    expect(hits).toHaveLength(1);
    expect(hits[0].sector).toBe("IT");
  });

  it("puts an exact or leading match before a looser one", () => {
    expect(names(searchSite("tata", sectors, stocks).stocks)).toEqual(["Tata Consultancy Services", "Tata Motors"]);
    // "auto" is the whole name of one sector and the start of another
    expect(names(searchSite("auto", sectors, stocks).sectors)).toEqual(["Auto", "Auto Components"]);
    // a ticker typed in full beats a name that merely starts with it
    expect(names(searchSite("it", sectors, stocks).sectors)[0]).toBe("IT");
  });

  it("finds a built sector across its dash", () => {
    expect(names(searchSite("banks", sectors, stocks).sectors)).toEqual(["Banks—Regional"]);
    expect(names(searchSite("banks regional", sectors, stocks).sectors)).toEqual(["Banks—Regional"]);
    expect(names(searchSite("regional", sectors, stocks).sectors)).toEqual(["Banks—Regional"]);
  });

  it("keeps only the best few", () => {
    const many: SiteStock[] = Array.from({ length: 30 }, (_, i) => stock(`Alpha ${i}`, `ALPHA${i}`, "IT"));
    expect(searchSite("alpha", sectors, many).stocks).toHaveLength(8);
    expect(searchSite("alpha", sectors, many, { sectors: 4, stocks: 3 }).stocks).toHaveLength(3);
  });

  it("does not match by meaning", () => {
    expect(searchSite("lenders", sectors, stocks)).toEqual({ sectors: [], stocks: [] });
  });
});
