-- Krob v0.7: notifications without extra Vercel env vars.
-- Copy everything, paste into Supabase > SQL Editor > Run. No placeholders to edit.
-- The app generates its own push keys + cron secret and stores them here; the cron job reads them.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.krob_config (
  id int primary key,
  app_url text,
  cron_secret text,
  vapid_public text,
  vapid_private text,
  updated_at timestamptz not null default now()
);
alter table public.krob_config enable row level security; -- no policies: only the server (service key) can read it

-- Tables from v0.3 (safe to re-run).
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

create table if not exists public.notification_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, date, key)
);
alter table public.notification_log enable row level security;

create table if not exists public.krob_heartbeat (
  id int primary key,
  at timestamptz not null default now()
);
alter table public.krob_heartbeat enable row level security;

-- Every minute: call the app at the URL/secret stored above (does nothing until the app has saved them).
select cron.unschedule('krob-tick') where exists (select 1 from cron.job where jobname = 'krob-tick');
select cron.schedule(
  'krob-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := c.app_url || '/api/push/tick',
    headers := jsonb_build_object('Authorization', 'Bearer ' || c.cron_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  )
  from public.krob_config c
  where c.id = 1 and c.app_url is not null and c.cron_secret is not null;
  $$
);

select cron.unschedule('krob-log-cleanup') where exists (select 1 from cron.job where jobname = 'krob-log-cleanup');
select cron.schedule('krob-log-cleanup', '0 3 * * *', $$ delete from public.notification_log where date < current_date - 14 $$);

-- Check later: select * from cron.job_run_details order by start_time desc limit 5;
