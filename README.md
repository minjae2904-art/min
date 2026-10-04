# Krob - ครบทุกวัน ไม่ว่ากะไหน

Personal PWA (Next.js 16 + Supabase, PIN-only login - no email) for a night-shift schedule: meals, whey/creatine, gym rotation, water, weight trend, personality training, PIN lock, Web Push.

## Env (Vercel > Settings > Environment Variables, and `.env.local` for dev)

| Name | Where it comes from | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase > Project Settings > API | no |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase > API keys (secret/service_role) - **server only**; enables PIN login + sync | yes |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` | private one yes |
| `VAPID_SUBJECT` | `mailto:you@example.com` | no |
| `CRON_SECRET` | any long random string (same value goes into `supabase/v0.3-push.sql`) | yes |
| `ANTHROPIC_API_KEY` | optional, AI coach (console.anthropic.com) | yes |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | optional second channel | yes |

Shortcut: `npm run setup:push -- https://your-app.vercel.app you@example.com` generates the VAPID keys + CRON_SECRET locally and writes `push-setup.local.txt` (git-ignored) with the env list and the filled-in SQL.

## Database
1. `supabase/schema.sql` (app_state)
2. `supabase/v0.3-push.sql` (push_subscriptions, notification_log, pg_cron job calling `/api/push/tick` every minute)

## Scripts
- `npm run dev` / `npm run build`
- `node scripts-make-icons.js` - rebuild icons from `logo/krob.png`
