import type { Db } from "./db";
import type { Preview } from "./yahoo";

/**
 * A shared cache of what Yahoo returned for a ticker, so the second visitor to ask for a company (or a sector's ten
 * companies) gets the answer from the database instead of costing Yahoo another three calls. Only ever written with
 * what the server itself fetched from Yahoo, never with anything a visitor sent.
 *
 * The figures that matter for the screen (annual profit, ROE, ROCE) change at most each quarter, so a week is fresh
 * enough; price, market cap and 52-week range are the parts that drift.
 */
export const MAX_AGE_DAYS = 7;

const SCHEMA = [
  `create table if not exists preview_cache (
     ticker     text primary key,
     payload    jsonb not null,
     fetched_at timestamptz not null default now()
   )`,
];

const ready = new WeakSet<Db>();

export async function ensureSchema(db: Db): Promise<void> {
  if (ready.has(db)) return;
  for (const sql of SCHEMA) await db.query(sql);
  ready.add(db);
}

const isPreview = (x: unknown): x is Preview => !!x && typeof x === "object" && typeof (x as Preview).ticker === "string" && !!(x as Preview).stock && !!(x as Preview).figures;

/** The stored preview if it is less than MAX_AGE_DAYS old, with when it was fetched. */
export async function readPreview(db: Db, ticker: string): Promise<{ preview: Preview; fetchedAt: string } | null> {
  await ensureSchema(db);
  const { rows } = await db.query<{ payload: unknown; fetched_at: Date | string }>(
    `select payload, fetched_at from preview_cache where ticker = $1 and fetched_at > now() - make_interval(days => $2)`,
    [ticker, MAX_AGE_DAYS],
  );
  const row = rows[0];
  if (!row || !isPreview(row.payload)) return null;
  return { preview: row.payload, fetchedAt: new Date(row.fetched_at).toISOString() };
}

/** Stores (or replaces) what Yahoo returned for this ticker. */
export async function savePreview(db: Db, preview: Preview): Promise<void> {
  await ensureSchema(db);
  await db.query(
    `insert into preview_cache (ticker, payload, fetched_at) values ($1, $2::jsonb, now())
     on conflict (ticker) do update set payload = excluded.payload, fetched_at = excluded.fetched_at`,
    [preview.ticker, JSON.stringify(preview)],
  );
}
