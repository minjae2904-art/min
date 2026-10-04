-- Krob v0.3: Web Push. Run in Supabase > SQL Editor (after schema.sql).
-- Before running, replace the two placeholders in step 3:
--   <APP_URL>      e.g. https://krob-sage.vercel.app  (the Vercel site you use)
--   <CRON_SECRET>  the same random string you put in Vercel env CRON_SECRET

-- 1. Devices that receive push (written by the app with the user's own session).
create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  ua text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "own subs" on public.push_subscriptions;
create policy "own subs" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2. Dedupe log: one row per reminder per day. Only the server (service role) touches it.
create table if not exists public.notification_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, date, key)
);
alter table public.notification_log enable row level security;

-- 3. Ping the app every minute.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('krob-tick') where exists (select 1 from cron.job where jobname = 'krob-tick');
select cron.schedule(
  'krob-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := '<APP_URL>/api/push/tick',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

-- 4. Housekeeping: drop log rows older than 14 days, once a day.
select cron.unschedule('krob-log-cleanup') where exists (select 1 from cron.job where jobname = 'krob-log-cleanup');
select cron.schedule('krob-log-cleanup', '0 3 * * *', $$ delete from public.notification_log where date < current_date - 14 $$);

-- Check later: select * from cron.job_run_details order by start_time desc limit 5;
--              select status_code, content from net._http_response order by created desc limit 5;
