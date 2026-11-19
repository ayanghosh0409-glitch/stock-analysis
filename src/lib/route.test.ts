import { describe, expect, it } from "vitest";
import { ALL_STOCKS, OVERVIEW, hashForTab, tabFromHash } from "./route";

describe("page addresses", () => {
  it("round-trips the fixed pages and every kind of sector name", () => {
    for (const tab of [OVERVIEW, ALL_STOCKS, "IT", "Auto Components", "Banks—Regional", "Drug Manufacturers—General", "Oil & Gas / E&P", "100% pure"]) {
      expect(tabFromHash(hashForTab(tab))).toBe(tab);
    }
  });

  it("writes readable addresses", () => {
    expect(hashForTab(OVERVIEW)).toBe("#/");
    expect(hashForTab(ALL_STOCKS)).toBe("#/all");
    expect(hashForTab("Auto Components")).toBe("#/sector/Auto%20Components");
  });

  it("opens the Overview for an empty, unknown or broken address", () => {
    for (const h of ["", "#", "#/", "#/nothing", "#/sector/", "#/sector/%E0%A4%A", "#sector=IT", "#/sector/%20%20"]) {
      expect(tabFromHash(h)).toBe(OVERVIEW);
    }
  });

  it("does not let an address name one of the fixed pages as a sector", () => {
    expect(tabFromHash("#/sector/Overview")).toBe(OVERVIEW);
    expect(tabFromHash("#/sector/All%20stocks")).toBe(OVERVIEW);
  });
});
