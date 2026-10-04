-- Krob: run once in Supabase > SQL Editor.
-- Single-user app: the whole app state is one JSON row per user (last write wins).
-- Will be split into proper tables when server-side reminders (pg_cron) need them.

create table if not exists public.app_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

drop policy if exists "own row" on public.app_state;
create policy "own row" on public.app_state
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
