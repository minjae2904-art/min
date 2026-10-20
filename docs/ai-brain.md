# Krob Brain (สมอง Krob) - operator notes, v1.3

User-facing plan (Thai): [ai-brain-plan.md](ai-brain-plan.md). This file is the short technical reference: what runs where, the limits, and the knobs to tune.

**One rule above all: nothing changes the plan without a tap.** The engine is deterministic and rules-first. The LLM only ranks and explains candidates the engine already built, and its output is untrusted (schema, validator, local id re-check).

## 1. Architecture

```
            pure, shared by client and server: src/lib/brain/*
 State -> signals.ts -> areas.ts -> balance + load
             |-> conflicts.ts -> rules.ts -> Candidate[] (variants of whitelisted actions)
             '-> patterns.ts (info only)              |
                                     actions.ts compile / validate / clamp -> ops + diff
 report.ts brainReport(s, today, mode) = all of the above + evaluations + rule stats

 Client  useBrain: memo(brainReport) -> composeBrief -> BrainCard / /balance / WeeklyReview
         tap "ใช้เลย" -> store.update(applyOps + AppliedRec, {flush: true})
         tap AI       -> flush() -> POST /api/ai/brain {mode, rev}
 Server  /api/ai/brain: PIN token -> read app_state -> rev check -> brainReport -> buildAiContext (numbers/ids)
         -> sha256 -> ai_cache hit? -> takeQuota -> completeJson (Gemini | Claude) -> validateAiOutput
         -> upsert ai_cache -> {src: "ai", plan}      any failure -> refund -> {src: "rules"}
 Cron    /api/push/tick -> dueReminders only (deterministic text). Never an LLM.
```

| Data | Stored where | Written by |
|---|---|---|
| Scores, balance, load, conflicts, patterns, candidates, evaluations | Nowhere (derived every render) | - |
| AI plan | localStorage `krob-brain-v1` + Supabase `ai_cache` | client / route |
| Applied changes, decisions, snooze/mute, focus, deload, weekly snapshots, reviewDone, reviewFocus | `State.brain` in app_state | client only, on taps |
| Levers (overrides, weekPlan, day template, voiceRest, settings) | existing State fields | client only, on "ใช้เลย" / undo / re-apply |

The server never writes app_state. An applied lever can still be lost to another device's write (settings and schedule merge wholesale from the newer copy); BrainCard detects that and offers "ใช้อีกครั้ง".

## 2. Nine areas and the balance number (สมดุล)

Areas: `sleep` การนอน, `nutrition` กิน + น้ำหนัก, `training` ยิม, `voice` ร้องเพลง, `trading` วินัยเทรด, `projects` เซิร์ฟ MC, `leisure` เกม/พักผ่อน, `recovery` ฟื้นตัว/อารมณ์, `consistency` ความสม่ำเสมอ.

- Each area: score 0-100 (weighted parts), conf 0-1, target, trend. Status: >= 75 ดี, 50-74 พอใช้, < 50 ควรดูแล, conf < 0.4 ข้อมูลน้อย.
- Eligible: score not null, conf >= 0.4, priority not 0 (พักไว้). Balance needs >= 3 eligible areas, else null.
- `w = BASE_W[a] x (priority 2 ? 1.5 : 1)`, BASE_W = sleep 1.5, nutrition 1.5, training 1.2, recovery 1.2, consistency 1.0, voice 0.8, trading 0.8, projects 0.6, leisure 0.6.
- **balance = round(0.7 x weighted mean + 0.3 x mean of the two lowest)**. No conflict penalty (no double counting).
- Load per planned day = (personal ring time + work) / awake window. Game time is leisure and is not counted. Work days above 0.9 are normal, not a conflict.
- Gaming is never scored down for hours; only its bedtime spill. Trading scores discipline only, never win rate.

Exact part formulas: spec section 2.4, code in `src/lib/brain/areas.ts`.

## 3. Conflicts (`conflicts.ts`) and rules (`rules.ts`)

| id | Thai label | sev | Areas |
|---|---|---|---|
| C1 | เกมลากเวลานอน | 2-3 | leisure, sleep |
| C2 | หนี้นอนแต่มียิม | 2 | sleep, training |
| C3 | ร้องติดกันนาน | 2 | voice |
| C4 | ร้องหลังยิม | 1 | voice, training |
| C5 | กินใกล้ยิม | 1 | nutrition, training |
| C6 | เวลานอนวันงานกับวันว่างต่างกัน | 2 | sleep, consistency |
| C7 | เทรดแก้มือ | 2 | trading |
| C8 | เทรดเกิน 1 ไม้ | 1 | trading |
| C9 | แผนแน่นเกิน | 2 | recovery, consistency |
| C10 | สัปดาห์ไม่มีวันพัก | 2 | recovery, voice |
| C11 | สัญญาณล้า | 3 | recovery |
| C12 | น้ำหนักกับการซ้อมไม่สัมพันธ์ | 2 | nutrition, training (info, feeds R05/R06 copy) |
| C13 | ยังไม่ได้ทำรายการเดิม 2 วันติด | 1 | consistency |

| Rule | Short copy | Main lever |
|---|---|---|
| R01 | หยุดเกมแข่งเร็วขึ้น | move game-stop -15/-30, or the last-match push |
| R02 | ตั้งหลักเวลาตื่น | focus step |
| R03 (safety) | เล่นยิมเบาวันนี้ | 1-day light gym, or a rest template today |
| R04 | ให้เวลานอนวันงานกับวันว่างใกล้กัน | focus step |
| R05 / R06 | เพิ่ม / ลดแคลอรี่ | kcal_adjust +150..250 / -150 |
| R07 | ปรับมื้อที่ยังไม่ได้กิน | move meal, reminder on, or focus step |
| R08 | ดื่มน้ำให้ถึงเป้าง่ายขึ้น | water goal auto / check every 90 min |
| R09 | ขยับเวลายิม | move gym |
| R10 | เว้นมื้อกับยิมให้ห่างขึ้น | move meal2 -30 |
| R11 | พักยิมแบบ deload สักสัปดาห์ | plan_deload 7 days (>= 21 days after the last one) |
| R12 (safety with strain) | พักเสียง 1 วัน | voice rest |
| R13 | ร้องก่อนยิม | reset sing time, or tip |
| R14 | เริ่มร้องแค่ 2 นาที | move sing or focus step |
| R15 / R16 | เช็กลิสต์ก่อนเข้าไม้ / พักหลังไม้ที่แพ้ | tips only |
| R17 | ตั้งเป้าเดียวต่อรอบเซิฟ | focus step; weekly: week slot game-max -> mc-build |
| R18 (safety) | พักให้เบาลงสักสัปดาห์ | voice rest + rest template tomorrow, or deload; always the talk-support tip |
| R19 | กลับมาทำแบบขั้นต่ำ | minimum viable day focus |
| R20 / R21 (weekly) | เพิ่มวันพัก | week slot -> rest, toggle optional items, voice rest |
| R22 | บันทึกเพิ่มอีกนิด | log-more focus step |

Priority = sev x gap x conf x focusW x ruleMult (0.7-1.3 from past verdicts) x rejectW (0.3 after 3 rejects in 60 days). Safety first. Filters: paused areas, snooze/mute, cooldown, one experiment per area, weekly-only, failed compile, one per sig. Max 8 candidates; the brief shows 2, the weekly review 5. Patterns P1-P9 are fixed hypotheses (no fishing) and never drive actions.

## 4. Action whitelist and bounds (`actions.ts`)

`move_item`, `reset_time`, `toggle_item`, `set_reminder`, `set_day_template`, `set_week_slot` (weekly only, max 2), `set_voice_rest`, `set_game_break` (60/90), `set_water_goal` (0 = auto), `set_water_every` (60/90/120), `kcal_adjust`, `plan_deload` (1 or 7 days), `set_flag` (notifyLastMatch on only), `focus_step`, `tip`.

- Moves: |delta| <= 60, 15-minute steps, only MOVABLE items, never custom/session items, never work items; order invariants (meal2 + 45 <= gym, gym end + 60 <= sleep, game-stop + 60 <= sleep, sleep stays last, ...) must not regress.
- Dates: today..today+7 (voice rest today..+3). Past days are never touched.
- kcal: step 50, |delta| <= 250, total clamped -300..+500, needs >= 5 weigh-ins in 14 days (pace <= 0.5% body weight/week).
- Toggle only optional items (posture, persona, mc-check, cardio, caf, review). Core items cannot be disabled.
- Never: logging anything, goodDay/profile/goal/identity, PIN/privacy/notification master switches, DND, templates create/rename/delete, custom items, titles, global or day shift, trades per day.
- Variant check: compile on a draft, sleep stays last on touched templates, load <= 0.97 on affected non-work days.
- Apply re-compiles at tap time; stale -> "แผนเปลี่ยนไปแล้ว". Undo inverts only ops still at their applied value (partial undo is reported). Applied records cap at 4 actions / 6 ops.
- Follow-up: `evaluate.ts` compares a metric before and after over the rule's window; >= 4 data points per side, hedged copy, verdicts only move priority within 0.7-1.3.

## 5. AI route and schema

- `POST /api/ai/brain {mode: "brief" | "weekly", rev}`. `rev` must equal the server's `updatedAt` (else 409 `sync-first`; the client flushes first). Success: `{src: "ai", provider, plan, remaining?, cached?}`. Otherwise `{src: "rules", reason}` with reason `no-key | no-data | off | sub-quota | quota-error | quota | ai-failed | error`.
- `GET /api/ai/brain?mode=` returns today's newest cached plan (no quota). The client re-validates it against its own candidates.
- Context (`context.ts`, pure): numbers, enums, canonical ids and built-in labels only, <= 6 KB. Brief mode excludes today's ticks so the hash is stable during the day.
- Output: one `PLAN_SCHEMA` (`schema.ts`) for Gemini `responseFormat`, Gemini legacy `responseJsonSchema` (one retry), and Claude `betaJSONSchemaOutputFormat` via `client.beta.messages.parse`. No length keywords in the schema; `validateAiOutput` truncates, strips markup and URLs, enforces enums and caps, and drops unknown or weekly-only pick ids.
- Models: Gemini `gemini-3.5-flash-lite` by default (`GEMINI_MODEL` overrides), maxOutputTokens 4096 brief / 8192 weekly. Claude `claude-opus-5-5`, max_tokens 8000, effort low/medium, 50 s timeout, one attempt (maxDuration 60).

## 6. Quota, cache and fallback

| Situation | Result | Quota |
|---|---|---|
| No API key | rules (`no-key`), AI buttons show "ยังไม่ได้ตั้งค่า AI" | none |
| brainAi off | rules (`off`); the client does not call at all | none |
| Offline / not synced | rules locally, no call / 409 `sync-first`: the client re-pulls and the user taps again | none |
| Cache hit (same hash, same day) | AI plan | free |
| Daily total 20 (coach + brain) used | rules (`quota`) | - |
| Brain sub-cap: brief 3, weekly 2 | rules (`sub-quota`) | - |
| notification_log error | rules (`quota-error`); the coach shows 503 | - |
| Model error, timeout, refusal, max tokens, invalid JSON, validator null | rules (`ai-failed`) | refunded |
| Any exception | rules (`error`) | refunded |

Quota is insert-first in `notification_log` (keys `ai:coach:<ts>`, `ai:brain:<mode>:<ts>`, legacy `ai:<ts>` still counted). The automatic brief runs at most once per logical day after wake (and check-in or +30 min), only with the app open, online and synced; no automatic retry.

## 7. Privacy

- Never sent to a model: journal text, trade notes, custom item titles, override titles, user template names (sent as "(สำเนา #n)" of a built-in), profile name, identity (brain never; coach only while "ส่งประโยคเป้าหมายตัวตนให้ AI โค้ช" is on), email.
- The sentinel test (`brain-context.test.ts`) plants markers in all of those and asserts none reach the context or the coach summary.
- Settings > สมอง Krob > "ดูข้อมูลที่ส่งให้ AI" shows the exact context built locally.
- `ai_cache` stores the validated plan and a hash, never the context. RLS with no policies (service key only), 14-day TTL. No prompt or response is logged.
- Push bodies honour privateNotifications; the cron never calls a model.

## 8. Pushes (`src/lib/reminders.ts`, pure)

- Wake briefing appends "สมดุล {b} · โฟกัส: {area}" when the Today card is on and balance exists, and "สัปดาห์ deload" (or "วันนี้เล่นเบา" for a 1-day light day) while a deload covers the day. Balance is computed only inside the briefing window.
- `brain:review`: review day (`brainReviewDow`, -1 = first rest slot of the week plan, Sunday first, else Sunday), wake + 90 min, notifyReview on, not yet reviewed this week.
- `brain:lastmatch`: notifyLastMatch on (default off), game-stop - 15 min on days with game-stop, game reminders on.
- All respect do-not-disturb and private notifications; none has action buttons.

## 9. Setup: run `supabase/v1.3-brain.sql` (วิธีรัน SQL)

1. Supabase > SQL Editor > New query, paste the whole file, Run. No placeholders; safe to re-run. (เปิด Supabase > SQL Editor วางไฟล์ทั้งหมดแล้วกด Run ครั้งเดียว)
2. It creates `ai_cache` (RLS on) and a daily pg_cron cleanup job.
3. Check Settings > สถานะระบบ > สมอง Krob: "ตาราง ai_cache" should read พร้อม.

Without it everything works; AI answers are just not cached (each repeat call counts against the quota). No new env vars are needed.

## 10. Known risks and tuning knobs

- Thresholds are heuristics. All live in `T` in `src/lib/brain/math.ts`: `bedLate` 45, `load` 0.9, `loadMax` 0.97, `winH` 7.5, `burnoutLow`/`burnoutOf` 5/7, `conf` 0.4, `minEligible` 3, `blendMean`/`blendLow` 0.7/0.3, `focusW` 1.5, `trendArrow` 5, `moveMax`/`moveStep` 60/15, `kcalStep`/`kcalMaxStep`/`kcalMin`/`kcalMax` 50/250/-300/500, `maxCandidates` 8, plus `BASE_W` and `DEFAULT_DUR`. Review after 2-4 weeks of real data.
- Cross-device overwrite of an applied lever is detected, not prevented.
- Thin data early: most areas show ข้อมูลน้อย for the first days.
- Regression to the mean inflates "better" verdicts (hedged copy, min 4 points, bounded multiplier).
- Gemini `responseFormat` is not live-tested; a legacy retry and the validator cover it.
- Quota fails closed on DB errors (coach 503).
- State size: brain worst case about 15 KB against the 60 KB keepalive limit; keep the caps (applied 20, decisions 40, snooze 60, weeks 12).
- Engine cost: about 50 ms per report in Node; memoise on `[s, today, mode]`, never in loops.
- Union merges: "ล้างประวัติสมอง" or "แนะนำได้อีก" on one device can be undone by another device that still holds the old history and pushes before pulling.
