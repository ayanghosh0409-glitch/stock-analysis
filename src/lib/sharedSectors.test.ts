import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "./db";
import { FRESH_DAYS, MAX_SHARED, SharedFull, isFresh, listShared, readShared, saveShared } from "./sharedSectors";
import type { Sector } from "./types";

let pg: PGlite;
let db: Db;
const mk = (): Db => ({ query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await pg.query(sql, params)).rows as T[] }) });
const sector = (yahooName: string, over: Partial<Sector> = {}): Sector => ({
  name: yahooName,
  title: yahooName,
  stocks: [{ name: "A", symbol: "A" } as never],
  built: { kind: "industry", yahooName, parentSector: "Financial Services", total: 41, listsFetchedAt: null, oldest: null, skipped: [] },
  ...over,
});

beforeAll(() => {
  pg = new PGlite();
});
afterAll(async () => pg.close());
beforeEach(async () => {
  await pg.query("drop table if exists shared_sectors");
  db = mk(); // a fresh Db makes ensureSchema create the table again
});

describe("shared sectors", () => {
  it("is empty to begin with", async () => {
    expect(await listShared(db)).toEqual([]);
    expect(await readShared(db, "Banks—Regional")).toBeNull();
  });

  it("keeps a sector, marks it shared and stamps when it was built", async () => {
    const saved = await saveShared(db, sector("Banks—Regional"));
    expect(saved.built).toMatchObject({ shared: true, yahooName: "Banks—Regional" });
    expect(Math.abs(Date.now() - Date.parse(saved.built!.builtAt!))).toBeLessThan(10_000);
    expect(await listShared(db)).toEqual([saved]);
    expect(await readShared(db, "Banks—Regional")).toEqual(saved);
  });

  it("replaces the copy of the same Yahoo name instead of adding another", async () => {
    await saveShared(db, sector("Banks—Regional"));
    await saveShared(db, sector("Banks—Regional", { title: "newer" }));
    const all = await listShared(db);
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe("newer");
  });

  it("lists the oldest first", async () => {
    await saveShared(db, sector("Banks—Regional"));
    await new Promise((r) => setTimeout(r, 5));
    await saveShared(db, sector("Airlines"));
    expect((await listShared(db)).map((s) => s.name)).toEqual(["Banks—Regional", "Airlines"]);
  });

  it(`refuses a sector beyond ${MAX_SHARED}, but still lets an existing one be rebuilt`, async () => {
    for (let i = 0; i < MAX_SHARED; i++) await saveShared(db, sector(`Industry ${i}`));
    await expect(saveShared(db, sector("One too many"))).rejects.toBeInstanceOf(SharedFull);
    await expect(saveShared(db, sector("Industry 3", { title: "rebuilt" }))).resolves.toMatchObject({ title: "rebuilt" });
    expect(await listShared(db)).toHaveLength(MAX_SHARED);
  });

  it("only keeps a built sector", async () => {
    await expect(saveShared(db, { name: "Banks", title: "Banks", stocks: [] })).rejects.toThrow(/built sector/);
  });

  it("leaves out a row that does not read back as a sector", async () => {
    await saveShared(db, sector("Banks—Regional"));
    await pg.query(`insert into shared_sectors (yahoo_name, payload) values ('junk', '{"x":1}'::jsonb)`);
    expect((await listShared(db)).map((s) => s.name)).toEqual(["Banks—Regional"]);
    expect(await readShared(db, "junk")).toBeNull();
  });
});

describe("isFresh", () => {
  const now = Date.parse("2026-11-19T10:00:00Z");
  it("is true inside the week and false after it", () => {
    expect(isFresh("2026-11-13T10:00:01Z", now)).toBe(true);
    expect(isFresh(new Date(now - FRESH_DAYS * 86_400_000).toISOString(), now)).toBe(false);
  });
  it("is false when there is no date", () => {
    expect(isFresh(undefined, now)).toBe(false);
    expect(isFresh("not a date", now)).toBe(false);
  });
});
