-- How many times someone has claimed units. The first two claims are daily, then weekly.
alter table unit_wallets add column if not exists claim_count integer not null default 0;

-- A wallet's claim time only moves past its creation time when it was claimed. Earlier repeat claims
-- weren't counted, so this can undercount by one or more, in the person's favour.
update unit_wallets set claim_count = 1
where claim_count = 0 and id like 'user:%' and last_claim_at > created_at;
