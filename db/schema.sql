-- The shared database holds one table: figures that visitors enter when Yahoo Finance has none.
-- The site creates this itself the first time it needs it (src/lib/figures.ts, ensureSchema), so running this by hand is optional.
-- Rows are only ever added. To remove a bad entry, delete its row.

create table if not exists entered_figures (
  id          bigserial primary key,
  ticker      text not null,                                          -- e.g. HDFCBANK.NS
  field       text not null check (field in ('roe', 'roce')),
  value       double precision not null,                              -- a fraction: 18.5% is stored as 0.185
  client_hash text not null,                                          -- salted hash of the caller's IP, only used for the hourly limit
  entered_at  timestamptz not null default now()
);

create index if not exists entered_figures_lookup on entered_figures (ticker, field, entered_at desc);
create index if not exists entered_figures_client on entered_figures (client_hash, entered_at desc);
