-- Run once in Supabase → SQL Editor
create extension if not exists pgcrypto with schema extensions;

create table candidates (id serial primary key, name text not null, bio text);
create table voters (
  email text primary key,
  code_hash text not null,                 -- bcrypt hash, never the code itself
  has_voted boolean not null default false, -- NO timestamp on purpose (keeps votes unlinkable)
  failed_attempts int not null default 0
);
create table ballots (
  id uuid primary key default gen_random_uuid(),  -- random id, no time, no voter link
  ranking int[] not null                          -- candidate ids, best first
);
create table settings (id int primary key default 1 check (id = 1), is_open boolean not null default false);
insert into settings values (1, false);

alter table candidates enable row level security;
alter table voters     enable row level security;
alter table ballots    enable row level security;
alter table settings   enable row level security;
create policy "anyone can read candidates" on candidates for select using (true);
-- voters / ballots / settings: no policies = invisible to the website. Only the functions below can touch them.

create or replace function _auth_voter(p_email text, p_code text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v voters;
begin
  if not (select is_open from settings) then return 'closed'; end if;
  select * into v from voters where email = lower(trim(p_email)) for update;
  if not found then return 'invalid'; end if;
  if v.has_voted then return 'voted'; end if;
  if v.failed_attempts >= 5 then return 'locked'; end if;
  if v.code_hash <> crypt(p_code, v.code_hash) then
    update voters set failed_attempts = failed_attempts + 1 where email = v.email;
    return 'invalid';
  end if;
  return 'ok';
end $$;

create or replace function verify_voter(p_email text, p_code text) returns text
language sql security definer set search_path = public as $$ select _auth_voter(p_email, p_code) $$;

create or replace function cast_vote(p_email text, p_code text, p_ranking int[]) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare s text;
begin
  s := _auth_voter(p_email, p_code);
  if s <> 'ok' then return s; end if;
  if coalesce(array_length(p_ranking, 1), 0) = 0
     or (select count(distinct x) from unnest(p_ranking) x) <> array_length(p_ranking, 1)
     or exists (select 1 from unnest(p_ranking) x where x not in (select id from candidates))
  then return 'bad_ballot'; end if;
  insert into ballots (ranking) values (p_ranking);       -- ballot: no voter info
  update voters set has_voted = true where email = lower(trim(p_email));
  return 'ok';
end $$;

-- Admin only (Python script uses the service key). Returns false if already registered.
create or replace function register_voter(p_email text, p_code text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into voters (email, code_hash) values (lower(trim(p_email)), crypt(p_code, gen_salt('bf')))
  on conflict do nothing;
  return found;
end $$;

revoke execute on function _auth_voter, register_voter from public, anon, authenticated;
grant execute on function verify_voter, cast_vote to anon;

-- Examples:
-- insert into candidates (name, bio) values ('Asha Rao', 'Hostel reforms'), ('Ravi K', 'Better wifi');
-- update settings set is_open = true;   -- open on election day; set false to close
