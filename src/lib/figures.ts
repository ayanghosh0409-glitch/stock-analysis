import type { Db } from "./db";
import { cleanTicker, type Preview } from "./yahoo";

/**
 * Figures that visitors enter when Yahoo Finance has none, kept in the shared database.
 *
 * The rules that keep this safe on a public page:
 *  - Only ROE and ROCE can be entered, within a sane range.
 *  - An entered figure only fills a gap. If Yahoo has the figure, Yahoo's always wins (applyEntered).
 *  - The figure shown is the median of the last few entries, so one wrong or malicious value cannot decide it.
 *  - Entries are only ever added, never overwritten, so a bad one can be traced and removed.
 *  - Each caller can add only a few entries an hour (kept in the database, so it holds across server instances).
 */

export const FIELDS = ["roe", "roce"] as const;
export type Field = (typeof FIELDS)[number];

/** Entered as a percentage, stored as a fraction. -100% to 200%: wide enough for real companies, narrow enough to stop junk. */
export const MIN_PERCENT = -100;
export const MAX_PERCENT = 200;
/** The figure shown is the median of this many latest entries per company and figure. */
export const WINDOW = 5;
/** Entries one caller may add per hour. */
export const HOURLY_LIMIT = 20;

export type Entry = { ticker: string; field: Field; value: number };
export type EnteredFigure = { value: number; count: number; latest: string };
export type EnteredMap = Partial<Record<Field, EnteredFigure>>;

export function validateEntry(input: unknown): { ok: true; entry: Entry } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "Send the ticker, the figure and the percentage." };
  const r = input as Record<string, unknown>;
  const ticker = cleanTicker(r.ticker);
  if (!ticker) return { ok: false, error: "That is not an NSE or BSE ticker." };
  if (typeof r.field !== "string" || !(FIELDS as readonly string[]).includes(r.field)) return { ok: false, error: "Only ROE and ROCE can be entered." };
  if (typeof r.percent !== "number" || !Number.isFinite(r.percent)) return { ok: false, error: "Enter the figure as a number, for example 18.5." };
  if (r.percent < MIN_PERCENT || r.percent > MAX_PERCENT) return { ok: false, error: `Enter a percentage between ${MIN_PERCENT} and ${MAX_PERCENT}.` };
  return { ok: true, entry: { ticker, field: r.field as Field, value: Math.round(r.percent * 100) / 10000 } }; // percent -> fraction, 2 decimals of a percent
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

type Row = { field: string; value: number; entered_at: string | Date };

/** Rows for one company, newest first, into the figure to show per field. Only the latest WINDOW entries count. */
export function summarize(rows: Row[]): EnteredMap {
  const out: EnteredMap = {};
  for (const f of FIELDS) {
    const mine = rows.filter((r) => r.field === f).slice(0, WINDOW);
    if (!mine.length) continue;
    const latest = new Date(mine[0].entered_at).toISOString();
    out[f] = { value: median(mine.map((r) => Number(r.value))), count: mine.length, latest };
  }
  return out;
}

const LABEL: Record<Field, string> = { roe: "ROE", roce: "ROCE" };
const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

/**
 * The preview with visitors' figures filled in, but only where Yahoo supplied nothing. Yahoo's own figure is never replaced.
 * Returns a new preview; the verdict is then worked out from `stock` exactly as for any other figure.
 */
export function applyEntered(p: Preview, entered: EnteredMap | undefined): Preview {
  if (!entered) return p;
  const used: Field[] = [];
  const figures = { ...p.figures };
  const stock = { ...p.stock };
  const checks = p.checks.map((c) => ({ ...c }));
  for (const f of FIELDS) {
    const e = entered[f];
    if (!e || figures[f] !== null) continue; // Yahoo has it, or nobody has entered it
    figures[f] = e.value;
    stock[f] = e.value;
    const c = checks.find((x) => x.key === f);
    if (c) {
      c.ok = true;
      c.detail = `entered by visitors (${e.count} ${e.count === 1 ? "entry" : "entries"}, latest ${when(e.latest)}), not verified`;
    }
    used.push(f);
  }
  if (!used.length) return p;
  const notes = [`${used.map((f) => LABEL[f]).join(" and ")} came from figures entered by visitors, not from Yahoo. Treat ${used.length > 1 ? "them" : "it"} as unverified.`, ...p.notes];
  return { ...p, figures, stock, checks, notes, enteredFields: used };
}

// ---- storage -------------------------------------------------------------------------------------------------------

const SCHEMA = [
  `create table if not exists entered_figures (
     id bigserial primary key,
     ticker text not null,
     field text not null check (field in ('roe', 'roce')),
     value double precision not null,
     client_hash text not null,
     entered_at timestamptz not null default now()
   )`,
  `create index if not exists entered_figures_lookup on entered_figures (ticker, field, entered_at desc)`,
  `create index if not exists entered_figures_client on entered_figures (client_hash, entered_at desc)`,
];

const ready = new WeakSet<Db>();

/** Creates the table the first time a server instance needs it. Safe to run repeatedly. */
export async function ensureSchema(db: Db): Promise<void> {
  if (ready.has(db)) return;
  for (const sql of SCHEMA) await db.query(sql);
  ready.add(db);
}

/** The figures to show for one company: the latest WINDOW entries per figure, summarised. */
export async function enteredFor(db: Db, ticker: string): Promise<EnteredMap> {
  await ensureSchema(db);
  const { rows } = await db.query<Row>(
    `select field, value, entered_at from (
       select field, value, entered_at, row_number() over (partition by field order by entered_at desc, id desc) as rn
       from entered_figures where ticker = $1
     ) t where rn <= $2 order by entered_at desc`,
    [ticker, WINDOW],
  );
  return summarize(rows);
}

export async function addEntry(db: Db, e: Entry, clientHash: string): Promise<void> {
  await ensureSchema(db);
  await db.query(`insert into entered_figures (ticker, field, value, client_hash) values ($1, $2, $3, $4)`, [e.ticker, e.field, e.value, clientHash]);
}

/** Entries this caller added in the last hour, for the hourly limit. */
export async function recentCount(db: Db, clientHash: string): Promise<number> {
  await ensureSchema(db);
  const { rows } = await db.query<{ n: number }>(
    `select count(*)::int as n from entered_figures where client_hash = $1 and entered_at > now() - interval '1 hour'`,
    [clientHash],
  );
  return rows[0]?.n ?? 0;
}
