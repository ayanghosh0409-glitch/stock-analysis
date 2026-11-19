import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "./db";
import { MAX_AGE_DAYS, ensureSchema, readPreview, savePreview } from "./previewCache";
import type { Preview } from "./yahoo";

let pg: PGlite;
let db: Db;
const mk = (): Db => ({ query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await pg.query(sql, params)).rows as T[] }) });
const preview = (o: Partial<Preview> = {}): Preview =>
  ({ ticker: "SBIN.NS", name: "State Bank of India", stock: { name: "State Bank of India", symbol: "SBIN", roe: 0.18 }, figures: { roe: 0.18, roce: null }, yahooSector: "Financial Services", ...o }) as unknown as Preview;

beforeAll(() => {
  pg = new PGlite();
});
afterAll(async () => pg.close());
beforeEach(async () => {
  await pg.query("drop table if exists preview_cache");
  db = mk(); // a fresh Db makes ensureSchema create the table again
});

describe("preview cache", () => {
  it("returns nothing for a ticker never stored", async () => {
    expect(await readPreview(db, "SBIN.NS")).toBeNull();
  });

  it("stores what Yahoo returned and gives it back with the time it was fetched", async () => {
    await savePreview(db, preview());
    const hit = await readPreview(db, "SBIN.NS");
    expect(hit?.preview).toEqual(preview());
    expect(Math.abs(Date.now() - new Date(hit!.fetchedAt).getTime())).toBeLessThan(10_000);
  });

  it("replaces an older copy of the same ticker", async () => {
    await savePreview(db, preview());
    await savePreview(db, preview({ name: "SBI, newer" }));
    expect((await readPreview(db, "SBIN.NS"))?.preview.name).toBe("SBI, newer");
    expect((await pg.query("select count(*)::int as n from preview_cache")).rows[0]).toEqual({ n: 1 });
  });

  it(`ignores a copy older than ${MAX_AGE_DAYS} days and keeps one just inside`, async () => {
    await savePreview(db, preview());
    await pg.query(`update preview_cache set fetched_at = now() - interval '${MAX_AGE_DAYS} days' - interval '1 minute'`);
    expect(await readPreview(db, "SBIN.NS")).toBeNull();
    await pg.query(`update preview_cache set fetched_at = now() - interval '${MAX_AGE_DAYS} days' + interval '1 hour'`);
    expect(await readPreview(db, "SBIN.NS")).not.toBeNull();
  });

  it("ignores a stored row that is not a preview", async () => {
    await ensureSchema(db);
    await pg.query(`insert into preview_cache (ticker, payload) values ('X.NS', '{"hello": 1}')`);
    expect(await readPreview(db, "X.NS")).toBeNull();
  });

  it("keeps tickers apart", async () => {
    await savePreview(db, preview());
    expect(await readPreview(db, "HDFCBANK.NS")).toBeNull();
  });
});
