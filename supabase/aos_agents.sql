-- Rempeyek Agent OS — Supabase mirror table.
-- Run this ONCE in the SQL Editor of the project your SUPABASE_URL points at
-- (https://supabase.com/dashboard/project/lbairsurylqrztzwapbs/sql).
-- The dashboard server (service_role key) upserts the agent registry here;
-- RLS stays enabled with no public policies, so anon/authenticated clients see nothing.

create table if not exists public.aos_agents (
  id         text primary key,
  config     jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.aos_agents enable row level security;

comment on table public.aos_agents is
  'Agent registry mirror from the Rempeyek Agent OS dashboard (server-side service_role writes only).';
