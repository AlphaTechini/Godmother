-- Accounts, saved sessions and image records. Plain Postgres, so it runs on any host.
-- Row level security is on with no policies: Supabase's public REST API sees nothing, and only the
-- server's direct database connection can read these tables.

create table if not exists users (
	id uuid primary key,
	email text not null unique,
	password_hash text not null,
	created_at timestamptz not null default now()
);

create table if not exists auth_sessions (
	id uuid primary key,
	user_id uuid not null references users (id) on delete cascade,
	expires_at timestamptz not null,
	revoked_at timestamptz,
	created_at timestamptz not null default now()
);
create index if not exists auth_sessions_user on auth_sessions (user_id);

create table if not exists password_resets (
	token_hash text primary key,
	user_id uuid not null references users (id) on delete cascade,
	expires_at timestamptz not null,
	used_at timestamptz,
	created_at timestamptz not null default now()
);

create table if not exists sessions (
	id uuid primary key,
	owner_id uuid references users (id) on delete set null,
	mode text not null,
	stage text not null,
	title text,
	data jsonb not null,
	agent jsonb,
	created_at timestamptz not null,
	updated_at timestamptz not null default now()
);
create index if not exists sessions_owner on sessions (owner_id, updated_at desc);

create table if not exists assets (
	id uuid primary key,
	session_id uuid,
	meta jsonb not null,
	created_at timestamptz not null default now()
);
create index if not exists assets_session on assets (session_id);

alter table users enable row level security;
alter table auth_sessions enable row level security;
alter table password_resets enable row level security;
alter table sessions enable row level security;
alter table assets enable row level security;
