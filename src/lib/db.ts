import { Pool } from "pg";

/**
 * The one place that connects to the database. Server-side only.
 *
 * The site works without a database: until DATABASE_URL (or POSTGRES_URL, which the Vercel storage integrations set)
 * exists, getDb() returns null and every feature that needs shared storage switches itself off quietly.
 *
 * Code that reads or writes data takes a `Db` instead of importing this file, so tests can run the same SQL on an
 * in-process Postgres.
 */
export type Db = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
};

export function connectionString(env: Record<string, string | undefined> = process.env): string | null {
  return env.DATABASE_URL?.trim() || env.POSTGRES_URL?.trim() || null;
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
