// Decides which notifications are due right now. Pure: used by the cron route (server) and the in-app toast/badge (client).
import { brainHeadline } from "./brain/report";
import { weekKey } from "./brain/review";
import { hm, logicalDate, logicalMinutes } from "./date";
import { dayFor, type State } from "./model";
import { phases } from "./phase";
import { GYM_CYCLE, GYM_LABEL, nextInCycle } from "./rotation";
import { MEAL2_LABEL, blockEnd, itemsFor, resolveTemplate } from "./schedule";
import { waterGoal, weightStats } from "./stats";

// Lower number = shown first when several land in the same minute.
export type Reminder = { key: string; title: string; body: string; level: "due" | "late" | "info"; priority: number };

const WINDOW = 10; // cron runs every minute; a 10-minute window survives missed ticks, notification_log dedupes

// nowEpoch is real time (for do-not-disturb); `now` is wall-clock time in the user's zone.
export function dueReminders(s: State, now: Date, nowEpoch = Date.now()): { date: string; reminders: Reminder[]; badge: number } {
  const set = s.settings;
  const date = logicalDate(now);
  const nowMin = logicalMinutes(now);
  const day = dayFor(s, date);
  const { def } = resolveTemplate(s.schedule, day.type);
  const all = itemsFor(s.schedule, day, date);
  const items = all.filter((i) => i.ring);
  const pending = items.filter((i) => !day.done[i.id]);
  const badge = pending.filter((i) => i.min <= nowMin).length;
  if (set.dndUntil > nowEpoch) return { date, reminders: [], badge };

  const out: Reminder[] = [];
  const t = (min: number, title: string) => (set.notifShowTime ? `${hm(min)} · ${title}` : title);
  const inWindow = (at: number) => nowMin - at >= 0 && nowMin - at < WINDOW;
  const kindOn = (kind: string) => set.notifyKinds[kind] !== false;
  // v1.4 live block: [stream, stream-end). While on air, no follow-ups and no water pings.
  const lv = all.find((i) => i.id === "stream"), lvEnd = lv && blockEnd(all, lv), onAir = !!lv && lvEnd !== undefined && nowMin >= lv.min && nowMin < lvEnd;

  // Wake-up briefing: the plan for the day in one notification.
  const wake = items[0]?.min;
  if (set.notifyBriefing && wake !== undefined && inWindow(wake)) {
    // Legacy days keep the v1.0 rule (work day = gym line); templates go by content.
    const hasGym = def.legacy ? def.work : items.some((i) => i.id === "gym");
    const gym = hasGym ? nextInCycle(GYM_CYCLE, s.workouts.filter((w) => w.date !== date)) : null;
    const water = `น้ำ ${(waterGoal(s, day, weightStats(s, date).cur) / 1000).toFixed(1)} ลิตร`;
    const game = all.find((i) => i.id === "game") ?? all.find((i) => i.id === "game1");
    const body = def.legacy
      ? [`${items.length} รายการ`, gym ? `ยิม ${gym} ${GYM_LABEL[gym]}` : "วันหยุด", water, "อย่าลืมเช็กอินความรู้สึก"]
      : [`แผน: ${def.name}`, `${items.length} รายการ`,
        gym ? `ยิม ${gym} ${GYM_LABEL[gym]}` : items.some((i) => i.id === "cardio") ? "พักยิม · คาร์ดิโอเบา" : "พักยิม",
        game ? `เกม ${hm(game.min)}-${hm(blockEnd(all, game) ?? game.min)}` : null,
        lv && lvEnd !== undefined ? `ไลฟ์ ${hm(lv.min)}-${hm(lvEnd)} (${Math.round((lvEnd - lv.min) / 6) / 10} ชม.)` : null, water, "อย่าลืมเช็กอินความรู้สึก"].filter(Boolean);
    // Krob Brain: deterministic focus line (computed only inside this window) and the deload marker.
    const head = set.brainCard ? brainHeadline(s, date) : null;
    if (head) body.push(`สมดุล ${head.balance}${head.label ? ` · โฟกัส: ${head.label}` : ""}`);
    const dl = s.brain.deload;
    if (dl && dl.from <= date && date <= dl.to) body.push(dl.from === dl.to ? "วันนี้เล่นเบา" : "สัปดาห์ deload");
    out.push({
      key: "briefing",
      title: t(wake, "แผนวันนี้"),
      body: body.join(" · "),
      level: "info",
      priority: 0,
    });
  }

  // Weekly review is ready: review day (see brain/review.ts), 90 min after wake, until that week is done.
  if (set.notifyReview && wake !== undefined && weekKey(s, date) === date && s.brain.reviewDone !== date && inWindow(wake + 90)) {
    out.push({ key: "brain:review", title: t(wake + 90, "รีวิวสัปดาห์พร้อมแล้ว"), body: "แตะเพื่อดูผลสัปดาห์และแผนหน้า", level: "info", priority: 1 });
  }

  // Opt-in nudge 15 min before game-stop.
  const stop = all.find((i) => i.id === "game-stop");
  if (set.notifyLastMatch && stop && kindOn("game") && inWindow(stop.min - 15)) {
    out.push({ key: "brain:lastmatch", title: t(stop.min - 15, "อีก 15 นาทีถึงเวลาหยุดเกมแข่ง"), body: "แมตช์ถัดไปเป็นแมตช์สุดท้ายไหม", level: "info", priority: 2 });
  }

  // 15 min before the live block ends (default on).
  const sleepItem = items.find((i) => i.kind === "sleep");
  if (set.notifyStreamWrap && lv && lvEnd !== undefined && kindOn("stream") && inWindow(lvEnd - 15)) {
    out.push({ key: "stream:wrap", title: t(lvEnd - 15, "อีก 15 นาทีปิดไลฟ์"), body: "บอกเวลาไลฟ์พรุ่งนี้ · เลือกช่องที่จะ raid · ปิดตรงเวลา" + (sleepItem ? ` เพื่อนอน ${hm(sleepItem.min)}` : ""), level: "info", priority: 2 });
  }

  // A new block of the day starts: "ตอนนี้ 21:00 · พักกะ" + what to do in it.
  if (set.notifyPhase) {
    for (const p of phases(s, day, date)) {
      if (p.key === "sleep" || p.start === wake || !inWindow(p.start)) continue;
      const todo = pending.filter((i) => i.min >= p.start && i.min < p.end).map((i) => i.title).slice(0, 3);
      // Gaming and streaming starts stay positive: the tip, never a to-do list.
      const body = todo.length && !(p.key.startsWith("game") || p.key.startsWith("stream")) ? `ต้องทำ: ${todo.join(", ")}` : p.tip;
      out.push({ key: `phase:${p.key}`, title: `ตอนนี้ ${hm(p.start)} · ${p.label}`, body, level: "info", priority: 1 });
    }
  }

  for (const i of pending) {
    if (i.remind === false || !kindOn(i.kind)) continue;
    const diff = nowMin - i.min;
    let body = i.cue ? `${i.cue}${i.sub ? ` · ${i.sub}` : ""}` : i.sub ?? "ถึงเวลาแล้ว";
    if (i.id === "meal2" && def.work && !day.meal2) body = "แตะเพื่อเลือก: " + Object.values(MEAL2_LABEL).join(" / ");
    if (diff >= 0 && diff < WINDOW) out.push({ key: `${i.id}:due`, title: t(i.min, i.title), body, level: "due", priority: 2 });
    // No follow-up for sleep: the user is (hopefully) asleep.
    const follow = set.followUpMin;
    if (follow > 0 && i.kind !== "sleep" && !onAir && diff >= follow && diff < follow + WINDOW) {
      out.push({ key: `${i.id}:late`, title: `ยังไม่ได้ทำ: ${i.title}`, body: `กำหนด ${hm(i.min)} เลยมา ${follow} นาที · เริ่มแค่ 2 นาทีก็พอ`, level: "late", priority: 3 });
    }
  }

  // Break reminders inside game blocks and the live block; a meal/whey or other item within 20 min is the break instead.
  if (set.gameBreakMin > 0) {
    for (const g of all.filter((i) => (i.kind === "game" && i.id !== "game-stop") || i.id === "stream")) {
      const st = g.id === "stream";
      if (!kindOn(st ? "stream" : "game")) continue;
      const end = blockEnd(all, g);
      if (end === undefined) continue;
      for (let slot = g.min + set.gameBreakMin; slot <= end - 15; slot += set.gameBreakMin) {
        if (items.some((i) => Math.abs(i.min - slot) <= 20)) continue;
        if (!inWindow(slot)) continue;
        out.push(st
          ? { key: `streambreak:${slot}`, title: t(slot, "พักเสียง 5 นาที (BRB)"), body: "ปิดไมค์ ไม่กระซิบ · จิบน้ำ · ลุกยืน · มองไกล 20 วินาที", level: "info", priority: 4 }
          : { key: `gamebreak:${slot}`, title: t(slot, "พักสายตา ลุกยืด 5 นาที"), body: "มองไกล 20 วินาที · ดื่มน้ำ · แล้วเล่นต่อ", level: "info", priority: 4 });
      }
    }
  }

  const sleep = sleepItem;
  if (set.notifyWater && !onAir && sleep && wake !== undefined) {
    const target = waterGoal(s, day, weightStats(s, date).cur);
    const every = Math.max(30, set.waterEveryMin);
    for (let slot = wake + every; slot < sleep.min - 60; slot += every) {
      const expected = (target * (slot - wake)) / (sleep.min - wake);
      if (inWindow(slot) && day.waterMl < expected - 300) {
        out.push({ key: `water:${slot}`, title: t(slot, "ดื่มน้ำ"), body: `ตอนนี้ ${(day.waterMl / 1000).toFixed(1)} / ${(target / 1000).toFixed(1)} ลิตร ควรได้ราว ${(expected / 1000).toFixed(1)} แล้ว`, level: "info", priority: 4 });
      }
    }
  }

  if (set.notifySummary && sleep && inWindow(sleep.min - 15)) {
    const done = items.length - pending.length;
    const miss = pending.filter((i) => i.kind !== "sleep").slice(0, 3).map((i) => i.title);
    out.push({
      key: "summary",
      title: t(sleep.min - 15, `สรุปวันนี้ ครบ ${Math.round((done / items.length) * 100)}%`),
      body: miss.length ? `ยังขาด: ${miss.join(", ")}` : "ทำครบทุกอย่าง เก่งมาก",
      level: "info",
      priority: 1,
    });
  }

  out.sort((a, b) => a.priority - b.priority);
  if (set.privateNotifications) return { date, badge, reminders: out.map((r) => ({ ...r, title: "Krob", body: "มีรายการที่ต้องทำ" })) };
  return { date, reminders: out, badge };
}

// Several reminders in one tick -> one notification led by the most important one.
export function groupReminders(list: Reminder[], hidden: boolean): { title: string; body: string; tag: string } {
  if (list.length === 1 || hidden) return { title: list[0].title, body: list[0].body, tag: list[0].key };
  const [first, ...others] = list;
  // A phase notice already lists its to-dos; don't repeat those items after "และ".
  const plain = (r: Reminder) => r.title.replace(/^\d\d:\d\d · /, "");
  const rest = first.key.startsWith("phase:") ? others.filter((r) => !(r.level === "due" && first.body.includes(plain(r)))) : others;
  if (!rest.length) return { title: first.title, body: first.body, tag: first.key };
  return { title: first.title, body: `${first.body}\nและ: ${rest.map(plain).join(" · ")}`, tag: `group:${first.key}` };
}
