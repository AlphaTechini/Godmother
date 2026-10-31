-- An account can't sign in or get units until its owner enters the code emailed to them.

alter table users add column if not exists email_verified_at timestamptz;

create table if not exists email_codes (
	user_id uuid primary key references users (id) on delete cascade,
	code_hash text not null,
	expires_at timestamptz not null,
	attempts integer not null default 0,
	created_at timestamptz not null default now()
);

alter table email_codes enable row level security;
