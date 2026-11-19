import type { Db } from "./db";
import type { Sector } from "./types";

/**
 * Built sectors that every visitor sees. A visitor who builds a sector from Yahoo Finance makes the server build and keep
 * its own copy; this file is the keeping. Only ever written with a sector the server built itself from Yahoo's answers
 * (src/app/api/sectors), never with figures a browser sent.
 *
 * A saved sector is rebuilt when someone builds it again after FRESH_DAYS, the same age at which the Yahoo cache expires.
 */
export const MAX_SHARED = 40; // an open door needs a ceiling: strangers cannot grow the table without limit
export const FRESH_DAYS = 7;

export class SharedFull extends Error {
  constructor() {
    super(`The site already shows ${MAX_SHARED} shared sectors, which is the most it keeps.`);
  }
}

const SCHEMA = [
  `create table if not exists shared_sectors (
     yahoo_name text primary key,
     payload    jsonb not null,
     built_at   timestamptz not null default now()
   )`,
];

const ready = new WeakSet<Db>();

export async function ensureSchema(db: Db): Promise<void> {
  if (ready.has(db)) return;
  for (const sql of SCHEMA) await db.query(sql);
  ready.add(db);
}

const isSector = (x: unknown): x is Sector => {
  const s = x as Sector;
  return !!s && typeof s === "object" && typeof s.name === "string" && Array.isArray(s.stocks) && !!s.built && typeof s.built.yahooName === "string";
};

/** True when a sector built at `builtAt` is recent enough to show as it is. */
export function isFresh(builtAt: string | null | undefined, now: number = Date.now()): boolean {
  const t = builtAt ? Date.parse(builtAt) : NaN;
  return Number.isFinite(t) && now - t < FRESH_DAYS * 86_400_000;
}

/** Every shared sector, oldest first, so the tabs stay in the order they appeared. Rows that do not read back as a sector are left out. */
export async function listShared(db: Db): Promise<Sector[]> {
  await ensureSchema(db);
  const { rows } = await db.query<{ payload: unknown }>(`select payload from shared_sectors order by built_at asc, yahoo_name asc`);
  return rows.map((r) => r.payload).filter(isSector);
}

/** The shared sector for one Yahoo name, of any age. */
export async function readShared(db: Db, yahooName: string): Promise<Sector | null> {
  await ensureSchema(db);
  const { rows } = await db.query<{ payload: unknown }>(`select payload from shared_sectors where yahoo_name = $1`, [yahooName]);
  const p = rows[0]?.payload;
  return isSector(p) ? p : null;
}

/**
 * Keeps this sector for everyone, replacing the copy of the same Yahoo name if there is one. Stamps when it was built.
 * Throws SharedFull when it would be one more than MAX_SHARED.
 */
export async function saveShared(db: Db, sector: Sector): Promise<Sector> {
  await ensureSchema(db);
  const yahooName = sector.built?.yahooName;
  if (!yahooName) throw new Error("Only a built sector can be shared.");
  const { rows } = await db.query<{ n: number; mine: boolean }>(
    `select count(*)::int as n, coalesce(bool_or(yahoo_name = $1), false) as mine from shared_sectors`,
    [yahooName],
  );
  if (!rows[0].mine && rows[0].n >= MAX_SHARED) throw new SharedFull();
  const builtAt = new Date().toISOString();
  const saved: Sector = { ...sector, built: { ...sector.built!, shared: true, builtAt } };
  await db.query(
    `insert into shared_sectors (yahoo_name, payload, built_at) values ($1, $2::jsonb, $3)
     on conflict (yahoo_name) do update set payload = excluded.payload, built_at = excluded.built_at`,
    [yahooName, JSON.stringify(saved), builtAt],
  );
  return saved;
}
