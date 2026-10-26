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

3. `supabase/v1.3-brain.sql` (Krob Brain AI cache `ai_cache` + daily cleanup job). Optional: without it the app works and AI answers are just not cached.

`supabase/legacy/` holds superseded migrations kept for reference only.

## สมอง Krob (v1.3)
Rules-first balance engine for 9 life areas (sleep, food/weight, gym, voice, trading discipline, MC server, gaming, recovery, consistency). It finds conflicts and proposes whitelisted plan changes; AI (Gemini, or Claude when there is no Gemini key) only ranks and explains them. Nothing changes the plan without a tap, every change can be undone, and journal text, trade notes and your own names never reach a model.

- Operator notes: [docs/ai-brain.md](docs/ai-brain.md) · user plan (Thai): [docs/ai-brain-plan.md](docs/ai-brain-plan.md)
- Setup: run `supabase/v1.3-brain.sql` once in Supabase > SQL Editor (safe to re-run). No new env vars.
- Settings: ตั้งค่า > สมอง Krob (switches, review day, area priority, muted list, "ดูข้อมูลที่ส่งให้ AI").

## v1.4 ช่วงไลฟ์ (ก่อนเปิดเทอม)
Time-boxed "stream season": live every day at least 5 h, sleep 01:30 wake 09:30. Plan for the user (Thai): [docs/life-plan.md](docs/life-plan.md) · brain changes: [docs/ai-brain-plan.md](docs/ai-brain-plan.md) section 12.

- New item kind `stream`. The live block is the ring item `stream` (tick = went live) ending at the `stream-end` marker; prep (`stream-prep`) and clips (`clips`) are habits. Streams are committed work: counted in `Budget.stream`, never as game, leisure or load.
- 4 built-in templates (group "ช่วงไลฟ์ (ก่อนเปิดเทอม)" in the picker), all wake 09:30 / sleep 01:30:
  - `stream-gym` ไลฟ์ + ยิม: gym 16:00, trade London 15:00, live 19:00-00:30
  - `stream-mc` ไลฟ์ + เซิฟ MC: server 90 min, light cardio 16:15, live 19:00-00:30
  - `stream-marathon` ไลฟ์มาราธอน: live 15:00-00:30 with a dinner BRB, no lift, no trade
  - `stream-rest` ไลฟ์ชิล + พักฟื้น: voice rest morning, weekly review 13:00, live 19:00-00:30. The brain proposes this (not the old `rest`) as the rest day on season days.
- Week preset "ช่วงไลฟ์ยาวก่อนเปิดเทอม" (Sun rest, Mon/Tue/Thu/Fri gym, Wed MC, Sat marathon): ~42.5 h live, 4 lifts, 5 trades.
- Sleep taper (`schedule.taper`): an extra shift on season templates only, from the old 05:00 bedtime back to 01:30 in 30-min steps (7 days). It is computed per date in the build, never written into day logs. The Today note has a หยุด link that sets a stop date (past days keep their history).
- The wake button (and QuickLog) never shifts a season day, early or late, so go-live stays at 19:00.
- Notifications: kind "ไลฟ์สตรีม" (prep, go-live, clips, a 5-min voice break every 60 min on air) and a "เตือนก่อนปิดไลฟ์ 15 นาที" switch. While on air there are no follow-up repeats and no water pings.
- Migration: nothing changes until the Today card "ช่วงไลฟ์ยาวก่อนเปิดเทอม" is tapped (ค่อยๆ เลื่อน (แนะนำ) / เริ่มเลย / ไว้ทีหลัง). The card sets the week plan and job status "ไม่ได้ทำแล้ว", and has undo. Legacy work/off and the v1.1 templates are unchanged. No SQL or env changes.

## v1.7 Round C: modes, gym sets, rituals, trading gate, self-care
Plan for the user (Thai): [docs/life-plan.md](docs/life-plan.md) sections "ดูแลตัวเอง (v1.7)" and "โหมดไลฟ์ ยิม พิธีเช้า-ค่ำ และเทรด (v1.7)". No SQL or env changes; the state row only grows (`care`, `run`, `gym`, `schedule.care`, `settings.night` and new optional `DayLog` fields, all sanitized and capped in `normalize`, merged in `mergeStates`).

- Self-care (`src/lib/care/*`, `/settings/care`): routines with steps hosted on Today rows (`r-am`, `r-gym`, custom `r-u-*`; prep and pm reuse the `stream-prep` and `night` rows, which keep id, ring and CORE status). Levels เบา / มาตรฐาน / ครบ, packs, cadence strings (`d`, `h`, `w:`, `e:n@`, `r@`), periodic tasks, light trackers, activity water plan (only once a level is chosen), health checks, product shelf, doctor flags (one at a time, "ไม่ใช่การวินิจฉัย"). Step ticks live in `DayLog.care`, separate from `done`; a row is done when its required due steps are.
- Live mode (`src/lib/session.ts`, `src/components/live/*`): a shell overlay (no route), OLED view, Screen Wake Lock with re-acquire, silent on-screen cues (20-20-20 and the break interval, now 30/45/60/90), pre-live checklist and a recap that writes real minutes to `DayLog.live` without changing planned budgets.
- Gym set logging (`src/lib/gymlog.ts`, `/gym`): per D-code exercise plans, prefill from last time, rest timer in the accessory, double-progression hints, 24-log cap. Ticks the Today gym item; the D1-D4 rotation is unchanged.
- Rituals (`src/lib/rituals.ts`): morning plan with an overcommit check and one-tap fixes, evening shutdown with carry-to-tomorrow, automatic Night theme (`html[data-night]`, off under a forced light theme or the switch).
- Trading gate (`src/lib/trade.ts`): a soft 3-tick check before logging and a calm "พอแล้ววันนี้" after one trade. Journaling only, no market advice.
- Brain: recovery gains a `care` part (weight .15, null under 3 planned rows), leisure reads logged live overruns, voice `strainFree` is clamped, new weekly rule R23 (minimum self-care). `set_reminder` refuses care rows.
- Reminders: routine rows default to no push; when on, the body lists the next required steps. SPF reapply pushes on a hot-day tap (kind "ดูแลตัวเอง"), due periodic tasks in the wake briefing. Stream break pushes are unchanged.
- Stream-season caffeine cutoff moved to 16:30 (~9 h before sleep). Legacy templates are unchanged.

## Scripts
- `npm run dev` / `npm run build`
- `node scripts-make-art.js` - rebuild icons and art from `logo/art` (run `npm install` first; sharp ships with next)
