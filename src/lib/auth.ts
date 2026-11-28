import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Db } from "./db";

/**
 * Accounts and sign-in sessions, in the shared database. A person is a row in `users`, found by Google's id for them (never by
 * email alone, which can change). A signed-in browser holds a random token in a cookie; only its SHA-256 hash is stored, so a
 * copy of the database cannot be used to sign in as anyone.
 */

export const SESSION_DAYS = 30;

export type User = { id: string; email: string; name: string | null };

const SCHEMA = [
  `create table if not exists users (
     id            text primary key,
     google_sub    text not null unique,
     email         text not null,
     name          text,
     created_at    timestamptz not null default now(),
     last_login_at timestamptz not null default now()
   )`,
  `create table if not exists sessions (
     token_hash text primary key,
     user_id    text not null references users(id) on delete cascade,
     created_at timestamptz not null default now(),
     expires_at timestamptz not null
   )`,
  `create index if not exists sessions_user on sessions (user_id)`,
];

const ready = new WeakSet<Db>();

export async function ensureSchema(db: Db): Promise<void> {
  if (ready.has(db)) return;
  for (const sql of SCHEMA) await db.query(sql);
  ready.add(db);
}

const hashOf = (token: string): string => createHash("sha256").update(token).digest("hex");
const looksLikeToken = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{43}$/.test(t);

/** Adds the person on their first sign-in; on later ones, refreshes the email and name Google gives now. */
export async function upsertUser(db: Db, who: { sub: string; email: string; name: string | null }, now: Date = new Date()): Promise<User> {
  await ensureSchema(db);
  const res = await db.query<User>(
    `insert into users (id, google_sub, email, name, created_at, last_login_at)
     values ($1, $2, $3, $4, $5::timestamptz, $5::timestamptz)
     on conflict (google_sub) do update set email = excluded.email, name = excluded.name, last_login_at = excluded.last_login_at
     returning id, email, name`,
    [randomUUID(), who.sub, who.email, who.name, now.toISOString()],
  );
  return res.rows[0];
}

/** A new session for the person. Returns the token to put in their cookie; it cannot be read back from the database. */
export async function createSession(db: Db, userId: string, now: Date = new Date()): Promise<{ token: string; expiresAt: Date }> {
  await ensureSchema(db);
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await db.query(`delete from sessions where expires_at <= $1::timestamptz`, [now.toISOString()]); // tidy as we go; no separate job
  await db.query(`insert into sessions (token_hash, user_id, created_at, expires_at) values ($1, $2, $3::timestamptz, $4::timestamptz)`, [
    hashOf(token),
    userId,
    now.toISOString(),
    expiresAt.toISOString(),
  ]);
  return { token, expiresAt };
}

/** Who a cookie token belongs to, or null for an unknown, ended or expired one. */
export async function userForSession(db: Db, token: unknown, now: Date = new Date()): Promise<User | null> {
  if (!looksLikeToken(token)) return null;
  await ensureSchema(db);
  const res = await db.query<User>(
    `select u.id, u.email, u.name from sessions s join users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > $2::timestamptz`,
    [hashOf(token), now.toISOString()],
  );
  return res.rows[0] ?? null;
}

/** Signs the browser out: the token stops working at once, wherever else it was copied. */
export async function endSession(db: Db, token: unknown): Promise<void> {
  if (!looksLikeToken(token)) return;
  await ensureSchema(db);
  await db.query(`delete from sessions where token_hash = $1`, [hashOf(token)]);
}
