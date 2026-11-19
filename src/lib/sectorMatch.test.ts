import { describe, expect, it } from "vitest";
import type { SectorList } from "./sectorLists";
import { ALIASES, distance, matchSector, norm, sectorNames } from "./sectorMatch";

const L = (kind: "sector" | "industry", name: string, sector: string | null, total: number): SectorList => ({
  kind,
  name,
  sector,
  total,
  stocks: [{ symbol: "A.NS", name: "A", marketCap: 1 }],
});
const LISTS: SectorList[] = [
  L("sector", "Financial Services", null, 279),
  L("sector", "Healthcare", null, 189),
  L("sector", "Technology", null, 211),
  L("sector", "Real Estate", null, 110),
  L("sector", "Consumer Defensive", null, 188),
  L("industry", "Banks—Regional", "Financial Services", 41),
  L("industry", "Drug Manufacturers—Specialty & Generic", "Healthcare", 104),
  L("industry", "Drug Manufacturers—General", "Healthcare", 14),
  L("industry", "Information Technology Services", "Technology", 79),
  L("industry", "Software—Application", "Technology", 40),
  L("industry", "Software—Infrastructure", "Technology", 12),
  L("industry", "Auto Parts", "Consumer Cyclical", 102),
  L("industry", "Auto Manufacturers", "Consumer Cyclical", 17),
  L("industry", "Auto & Truck Dealerships", "Consumer Cyclical", 4),
  L("industry", "Insurance—Life", "Financial Services", 9),
  L("industry", "Insurance Brokers", "Financial Services", 3),
  L("industry", "Packaged Foods", "Consumer Defensive", 60),
];
const name = (m: ReturnType<typeof matchSector>) => (m.status === "found" ? m.list.name : m.status === "choose" ? m.options.map((o) => o.name) : m.suggestions.map((o) => o.name));

describe("norm", () => {
  it("ignores case, dashes and punctuation", () => {
    expect(norm("Banks—Regional")).toBe("banks regional");
    expect(norm("  Drug Manufacturers—Specialty & Generic ")).toBe("drug manufacturers specialty and generic");
    expect(norm("Banks - Regional")).toBe("banks regional");
  });
});

describe("matchSector: the name exactly", () => {
  it("finds a sector or an industry however it is typed", () => {
    expect(matchSector("healthcare", LISTS)).toMatchObject({ status: "found", list: { name: "Healthcare", kind: "sector" } });
    expect(matchSector("BANKS - REGIONAL", LISTS)).toMatchObject({ status: "found", list: { name: "Banks—Regional" } });
  });
});

describe("matchSector: everyday words", () => {
  it("maps banking and bank to the one bank industry that has stocks", () => {
    expect(name(matchSector("Banking", LISTS))).toBe("Banks—Regional");
    expect(name(matchSector("bank", LISTS))).toBe("Banks—Regional");
  });
  it("offers a choice when an everyday word points at several", () => {
    const m = matchSector("pharma", LISTS);
    expect(m.status).toBe("choose");
    expect(name(m)).toEqual(["Drug Manufacturers—Specialty & Generic", "Drug Manufacturers—General"]);
    expect(name(matchSector("IT", LISTS))).toEqual(["Information Technology Services", "Software—Application", "Software—Infrastructure"]);
  });
  it("ignores alias targets that are not in the stored lists", () => {
    expect(name(matchSector("cement", LISTS))).not.toContain("Building Materials");
  });
  it("only points at names that exist in Yahoo's taxonomy", async () => {
    const tax = (await import("../../data/yahoo-taxonomy.json")).default.sectors as Record<string, string[]>;
    const all = new Set([...Object.keys(tax), ...Object.values(tax).flat()]);
    for (const [word, targets] of Object.entries(ALIASES)) for (const t of targets) expect(all.has(t), `${word} -> ${t}`).toBe(true);
  });
});

describe("matchSector: words that start the name", () => {
  it("matches the start of each word typed", () => {
    expect(name(matchSector("real est", LISTS))).toBe("Real Estate");
    expect(name(matchSector("insur", LISTS))).toEqual(["Insurance—Life", "Insurance Brokers"]);
  });
  it("offers a choice, largest first, when several match", () => {
    expect(name(matchSector("auto", LISTS))).toEqual(["Auto Parts", "Auto Manufacturers", "Auto & Truck Dealerships"]);
  });
  it("lets an everyday word and a name word be typed together", () => {
    // Found by the live check: "it services" used to return only suggestions.
    expect(name(matchSector("it services", LISTS))).toBe("Information Technology Services");
    expect(name(matchSector("bank regional", LISTS))).toBe("Banks—Regional");
    expect(name(matchSector("pharma generic", LISTS))).toBe("Drug Manufacturers—Specialty & Generic");
  });
  it("does not match a word from the middle of another word", () => {
    expect(matchSector("ealth", LISTS).status).toBe("none");
  });
});

describe("matchSector: nothing matches", () => {
  it("suggests the nearest names for a misspelling", () => {
    expect(name(matchSector("helthcare", LISTS))[0]).toBe("Healthcare");
    expect(name(matchSector("farma", LISTS))).toContain("Drug Manufacturers—Specialty & Generic");
    expect(name(matchSector("technolgy", LISTS))[0]).toBe("Technology");
  });
  it("gives no suggestion when nothing is near, and never invents a sector", () => {
    const m = matchSector("zzzzqq", LISTS);
    expect(m).toEqual({ status: "none", suggestions: [] });
    expect(matchSector("", LISTS)).toEqual({ status: "none", suggestions: [] });
    expect(matchSector("banks", [])).toEqual({ status: "none", suggestions: [] });
  });
  it("suggests at most three", () => {
    expect(name(matchSector("servics", LISTS)).length).toBeLessThanOrEqual(3);
  });
});

describe("helpers", () => {
  it("measures edit distance", () => {
    expect(distance("farma", "pharma")).toBe(2);
    expect(distance("same", "same")).toBe(0);
    expect(distance("", "abc")).toBe(3);
  });
  it("lists the sector names", () => {
    expect(sectorNames(LISTS)).toEqual(["Financial Services", "Healthcare", "Technology", "Real Estate", "Consumer Defensive"]);
  });
});
