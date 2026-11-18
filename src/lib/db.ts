import { Pool } from "pg";

/**
 * The one place that connects to the database. Server-side only.
 *
 * The site works without a database: until DATABASE_URL or POSTGRES_URL (which the Vercel storage integrations set, possibly with a prefix)
 * exists, getDb() returns null and every feature that needs shared storage switches itself off quietly.
 *
 * Code that reads or writes data takes a `Db` instead of importing this file, so tests can run the same SQL on an
 * in-process Postgres.
 */
export type Db = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
};

/**
 * The database address. Vercel's storage integrations set DATABASE_URL or POSTGRES_URL, but the setup screen offers a
 * custom prefix (STORAGE_POSTGRES_URL, MYDB_DATABASE_URL), so a prefixed name is accepted too. The plain names win,
 * and variants such as *_NON_POOLING or *_UNPOOLED are never matched because the name must end in URL.
 */
export function connectionString(env: Record<string, string | undefined> = process.env): string | null {
  const plain = env.DATABASE_URL?.trim() || env.POSTGRES_URL?.trim();
  if (plain) return plain;
  const prefixed = Object.keys(env)
    .filter((k) => /^[A-Z0-9]+(_[A-Z0-9]+)*_(DATABASE_URL|POSTGRES_URL)$/.test(k) && env[k]?.trim())
    .sort();
  return prefixed.length ? env[prefixed[0]]!.trim() : null;
}

let pool: Pool | null = null;

export function getDb(): Db | null {
  const url = connectionString();
  if (!url) return null;
  // One connection per server instance: serverless functions are many and short-lived, and the host's pooler does the sharing.
  pool ??= new Pool({ connectionString: url, max: 1, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 5_000 });
  return {
    query: async <T>(sql: string, params?: unknown[]) => {
      const res = await pool!.query(sql, params as unknown[] | undefined);
      return { rows: res.rows as T[] };
    },
  };
}
