import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SESSION_DAYS, createSession, endSession, upsertUser, userForSession } from "./auth";
import type { Db } from "./db";

let pg: PGlite;
let db: Db;
const mk = (): Db => ({ query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await pg.query(sql, params)).rows as T[] }) });
const ayan = { sub: "g-1", email: "ayan@example.com", name: "Ayan" };

beforeAll(() => {
  pg = new PGlite();
});
afterAll(async () => pg.close());
beforeEach(async () => {
  await pg.query("drop table if exists sessions");
  await pg.query("drop table if exists users");
  db = mk();
});

describe("accounts", () => {
  it("creates the person on first sign-in and finds the same one next time", async () => {
    const first = await upsertUser(db, ayan);
    expect(first).toMatchObject({ email: "ayan@example.com", name: "Ayan" });
    const again = await upsertUser(db, { ...ayan, email: "new@example.com", name: "Ayan G" });
    expect(again.id).toBe(first.id);
    expect(again).toMatchObject({ email: "new@example.com", name: "Ayan G" });
    expect((await pg.query("select count(*)::int as n from users")).rows[0]).toEqual({ n: 1 });
  });

  it("keeps different Google accounts apart, even with the same email", async () => {
    const a = await upsertUser(db, ayan);
    const b = await upsertUser(db, { ...ayan, sub: "g-2" });
    expect(b.id).not.toBe(a.id);
  });
});

describe("sessions", () => {
  it("signs a person in and out", async () => {
    const user = await upsertUser(db, ayan);
    const { token } = await createSession(db, user.id);
    expect(await userForSession(db, token)).toEqual(user);
    await endSession(db, token);
    expect(await userForSession(db, token)).toBeNull();
  });

  it("stores only a hash, never the token", async () => {
    const user = await upsertUser(db, ayan);
    const { token } = await createSession(db, user.id);
    const rows = (await pg.query<{ token_hash: string }>("select token_hash from sessions")).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toBe(token);
    expect(rows[0].token_hash).toBe(createHash("sha256").update(token).digest("hex"));
  });

  it("ends after 30 days", async () => {
    const user = await upsertUser(db, ayan);
    const t0 = new Date("2026-01-01T00:00:00Z");
    const { token, expiresAt } = await createSession(db, user.id, t0);
    expect(expiresAt.getTime() - t0.getTime()).toBe(SESSION_DAYS * 86_400_000);
    expect(await userForSession(db, token, new Date(t0.getTime() + 29 * 86_400_000))).toEqual(user);
    expect(await userForSession(db, token, new Date(t0.getTime() + 31 * 86_400_000))).toBeNull();
  });

  it("answers null for anything that is not a real token, without asking the database", async () => {
    for (const bad of [undefined, null, "", "abc", 42, "x".repeat(43) + "!", "' or 1=1 --"]) expect(await userForSession(db, bad)).toBeNull();
    expect(await userForSession(db, "A".repeat(43))).toBeNull(); // right shape, unknown
  });

  it("removes expired sessions when a new one is made, and signing out one browser leaves the others", async () => {
    const user = await upsertUser(db, ayan);
    const old = await createSession(db, user.id, new Date("2026-01-01T00:00:00Z"));
    const a = await createSession(db, user.id, new Date("2026-03-01T00:00:00Z"));
    const b = await createSession(db, user.id, new Date("2026-03-01T00:00:00Z"));
    expect((await pg.query("select count(*)::int as n from sessions")).rows[0]).toEqual({ n: 2 });
    expect(old.token).not.toBe(a.token);
    await endSession(db, a.token);
    expect(await userForSession(db, b.token, new Date("2026-03-02T00:00:00Z"))).toEqual(user);
  });

  it("deleting a person removes their sessions", async () => {
    const user = await upsertUser(db, ayan);
    await createSession(db, user.id);
    await pg.query("delete from users where id = $1", [user.id]);
    expect((await pg.query("select count(*)::int as n from sessions")).rows[0]).toEqual({ n: 0 });
  });
});
