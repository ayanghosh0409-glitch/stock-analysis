-- The shared database holds three tables: figures that visitors enter when Yahoo Finance has none, a cache of what
-- Yahoo returned for each company (preview_cache), and the sectors visitors built (shared_sectors), both at the end of this file.
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

-- What Yahoo returned for a ticker, kept for a week so a company or sector is not fetched again for every visitor.
-- Written only by the server (src/lib/previewCache.ts). Safe to empty at any time: the next request fetches it again.
create table if not exists preview_cache (
  ticker     text primary key,
  payload    jsonb not null,
  fetched_at timestamptz not null default now()
);

-- Sectors built from Yahoo that every visitor sees (src/lib/sharedSectors.ts). The payload is the whole built sector, as
-- the server built it from Yahoo's answers. At most 40 rows. To take a sector off the site, delete its row.
create table if not exists shared_sectors (
  yahoo_name text primary key,                                          -- exactly as Yahoo spells it, e.g. Banks—Regional
  payload    jsonb not null,
  built_at   timestamptz not null default now()
);
