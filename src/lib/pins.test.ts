import { describe, expect, it } from "vitest";
import { MAX_PINS, defaultPins, effectivePins, parsePins, recentlyBuilt, togglePin } from "./pins";

const sectors = [
  { name: "IT", n: 11, built: false },
  { name: "Auto", n: 10, built: false },
  { name: "Auto Components", n: 11, built: false },
  { name: "Pharma", n: 10, built: false },
  { name: "FMCG", n: 10, built: false },
  { name: "Airlines", n: 30, built: true }, // built sectors are never a default pin
];

describe("defaultPins", () => {
  it("takes the three listed sectors with the most stocks, ties by name", () => {
    expect(defaultPins(sectors)).toEqual(["Auto Components", "IT", "Auto"]);
  });
  it("does not run short or break with fewer sectors", () => {
    expect(defaultPins(sectors.slice(0, 2))).toEqual(["IT", "Auto"]);
    expect(defaultPins([])).toEqual([]);
  });
  it("does not reorder the list it was given", () => {
    const names = sectors.map((s) => s.name);
    defaultPins(sectors);
    expect(sectors.map((s) => s.name)).toEqual(names);
  });
});

describe("parsePins", () => {
  it("reads a stored list and drops repeats", () => {
    expect(parsePins('["IT","Auto","IT"]')).toEqual(["IT", "Auto"]);
    expect(parsePins("[]")).toEqual([]);
  });
  it("is null for nothing or for anything that is not a list of names", () => {
    for (const raw of [null, undefined, "", "not json", "{}", '"IT"', "[1,2]", '["IT",null]']) expect(parsePins(raw)).toBeNull();
  });
});

describe("effectivePins", () => {
  const exists = new Set(["IT", "Auto", "Pharma", "FMCG", "Airlines"]);
  it("uses the defaults until something is stored", () => {
    expect(effectivePins(null, ["IT", "Auto"], exists)).toEqual(["IT", "Auto"]);
  });
  it("uses an empty stored list as is: the person unpinned everything", () => {
    expect(effectivePins([], ["IT", "Auto"], exists)).toEqual([]);
  });
  it("leaves out sectors that are not on the site, and caps the list", () => {
    expect(effectivePins(["Gone", "IT", "Pharma"], [], exists)).toEqual(["IT", "Pharma"]);
    expect(effectivePins(["IT", "Auto", "Pharma", "FMCG"], [], exists)).toHaveLength(MAX_PINS);
  });
});

describe("togglePin", () => {
  const exists = new Set(["IT", "Auto", "Pharma", "FMCG"]);
  it("pins a sector and unpins it again", () => {
    expect(togglePin(["IT"], "Auto", exists, true)).toEqual(["IT", "Auto"]);
    expect(togglePin(["IT", "Auto"], "IT", exists, true)).toEqual(["Auto"]);
  });
  it("refuses a fourth pin", () => {
    expect(togglePin(["IT", "Auto", "Pharma"], "FMCG", exists, true)).toBeNull();
  });
  it("still lets a full list be unpinned", () => {
    expect(togglePin(["IT", "Auto", "Pharma"], "Auto", exists, true)).toEqual(["IT", "Pharma"]);
  });
  it("keeps a pin for a sector that has not loaded yet, until the sectors have all arrived", () => {
    expect(togglePin(["Airlines", "IT"], "Auto", exists, false)).toEqual(["Airlines", "IT", "Auto"]);
    expect(togglePin(["Airlines", "IT"], "Auto", exists, true)).toEqual(["IT", "Auto"]);
  });
  it("does not count a sector that is not loaded against the limit", () => {
    expect(togglePin(["Airlines", "IT", "Auto"], "Pharma", exists, false)).toEqual(["Airlines", "IT", "Auto", "Pharma"]);
  });
});

describe("recentlyBuilt", () => {
  const s = (name: string, built: boolean, builtAt: string | null) => ({ name, built, builtAt });
  it("lists the newest built sectors first and ignores listed ones", () => {
    const list = [
      s("IT", false, null),
      s("Steel", true, "2026-11-09T05:00:00Z"),
      s("Banks", true, "2026-11-12T05:00:00Z"),
      s("Airlines", true, "2026-11-14T05:00:00Z"),
      s("Software", true, "2026-11-15T05:00:00Z"),
    ];
    expect(recentlyBuilt(list)).toEqual(["Software", "Airlines", "Banks"]);
  });
  it("puts a sector the visitor has just built, with no build time yet, first", () => {
    const list = [s("Steel", true, "2026-11-09T05:00:00Z"), s("Mine", true, null), s("Bad", true, "garbage")];
    expect(recentlyBuilt(list)).toEqual(["Bad", "Mine", "Steel"]);
  });
  it("is empty when nothing has been built", () => {
    expect(recentlyBuilt([s("IT", false, null)])).toEqual([]);
  });
});
