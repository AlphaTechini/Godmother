-- YouCam unit allowances. A signed-in user has one row. A guest has two, one for the browser and one
-- for the address, and may spend only while both have units left. Addresses are stored hashed.

create table if not exists unit_wallets (
	id text primary key,
	granted integer not null,
	used integer not null default 0,
	last_claim_at timestamptz not null default now(),
	created_at timestamptz not null default now()
);

alter table unit_wallets enable row level security;
