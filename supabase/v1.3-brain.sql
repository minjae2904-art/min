-- Krob v1.3: Krob Brain AI cache.
-- Copy everything, paste into Supabase > SQL Editor > Run. No placeholders to edit. Safe to re-run.
-- Stores only the validated AI plan + a hash of the numbers-only context (never the context itself), kept 14 days.
-- Without this file the app still works: AI answers are just not cached (quota uses notification_log from v0.7).

create table if not exists public.ai_cache (
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  mode text not null check (mode in ('brief', 'weekly')),
  hash text not null,
  plan jsonb not null,
  provider text,
  created_at timestamptz not null default now(),
  primary key (user_id, date, mode, hash)
);
alter table public.ai_cache enable row level security; -- no policies: only the server (service key) can read it

-- Housekeeping: drop cache rows older than 14 days, once a day.
select cron.unschedule('krob-ai-cache-cleanup') where exists (select 1 from cron.job where jobname = 'krob-ai-cache-cleanup');
select cron.schedule('krob-ai-cache-cleanup', '15 3 * * *', $$ delete from public.ai_cache where date < current_date - 14 $$);
