# Krob - ครบทุกวัน ไม่ว่ากะไหน

Personal PWA (Next.js 16 + Supabase, PIN-only login - no email) for a night-shift schedule: meals, whey/creatine, gym rotation, water, weight trend, personality training, PIN lock, Web Push.

## Env (Vercel > Settings > Environment Variables, and `.env.local` for dev)

Required:

| Name | Where it comes from | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase > Project Settings > API | no |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase > API keys (secret/service_role) - **server only**; enables PIN login + sync + push | yes |

Optional overrides (normally leave unset - the server generates these on first use and stores them in `krob_config`):

| Name | Note | Secret? |
|---|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` | private one yes |
| `VAPID_SUBJECT` | `mailto:you@example.com` | no |
| `CRON_SECRET` | if set, the server writes it into `krob_config` so pg_cron sends the same value | yes |

AI coach / extra channel (optional):

| Name | Note | Secret? |
|---|---|---|
| `GEMINI_API_KEY` | AI coach via Gemini (preferred when set; model override `GEMINI_MODEL`) | yes |
| `AI_PROVIDER` | force `gemini` or `anthropic` | no |
| `ANTHROPIC_API_KEY` | AI coach via Claude (used when no Gemini key) | yes |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | second channel for important reminders | yes |

## Database
1. `supabase/schema.sql` (app_state)
2. `supabase/v0.7-config.sql` (push tables + krob_config + pg_cron job). No placeholders: the server generates VAPID keys and the cron secret itself and stores them in `krob_config`; VAPID/CRON env vars are optional overrides.

`supabase/legacy/` holds superseded migrations kept for reference only.

## Scripts
- `npm run dev` / `npm run build`
- `node scripts-make-icons.js` - rebuild icons from `logo/krob.png` (run `npm install` first; sharp ships with next)
