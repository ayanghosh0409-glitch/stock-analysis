import { describe, expect, it } from "vitest";
import { connectionString } from "./db";

describe("connectionString", () => {
  it("is null when no database is set", () => {
    expect(connectionString({})).toBeNull();
    expect(connectionString({ DATABASE_URL: "  ", PATH: "/bin" })).toBeNull();
  });
  it("uses the plain names, DATABASE_URL first", () => {
    expect(connectionString({ POSTGRES_URL: "b", DATABASE_URL: "a" })).toBe("a");
    expect(connectionString({ POSTGRES_URL: " b " })).toBe("b");
  });
  it("accepts a prefix chosen in Vercel's setup screen", () => {
    expect(connectionString({ STORAGE_POSTGRES_URL: "p" })).toBe("p");
    expect(connectionString({ MY_DB_DATABASE_URL: "d" })).toBe("d");
  });
  it("ignores the non-pooling and unpooled variants and unrelated variables", () => {
    expect(connectionString({ STORAGE_POSTGRES_URL_NON_POOLING: "x", STORAGE_DATABASE_URL_UNPOOLED: "y", NEXT_PUBLIC_URL: "z" })).toBeNull();
    expect(connectionString({ STORAGE_POSTGRES_URL_NON_POOLING: "x", STORAGE_POSTGRES_URL: "p" })).toBe("p");
  });
  it("prefers a plain name over a prefixed one", () => {
    expect(connectionString({ STORAGE_POSTGRES_URL: "p", POSTGRES_URL: "plain" })).toBe("plain");
  });
});
