// Decides which notifications are due right now. Pure: used by the cron route (server) and the in-app toast/badge (client).
import { brainHeadline } from "./brain/report";
import { weekKey } from "./brain/review";
import { dueTasks, rowState, stepShort } from "./care/progress";
import { addDays, hm, logicalDate, logicalMinutes } from "./date";
import { dayFor, type State } from "./model";
import { phases } from "./phase";
import { GYM_CYCLE, GYM_LABEL, nextInCycle } from "./rotation";
import { MEAL2_LABEL, blockEnd, itemsFor, resolveTemplate, type Item } from "./schedule";
import { bkkMin, waterGoal, weightStats } from "./stats";
import { badgeCount } from "./badge";
import { inClass, quietAt } from "./term";

// Lower number = shown first when several land in the same minute. url = deep link opened by a notification tap (v1.8).
export type Reminder = { key: string; title: string; body: string; level: "due" | "late" | "info"; priority: number; url?: string };

// v1.8 deep link of a reminder (sw.js notificationclick). Item reminders pass the item; meal2Pick = work day without meal2 chosen.
export function reminderUrl(key: string, item?: Item, o: { meal2Pick?: boolean } = {}): string {
  if (item && /:(due|late)$/.test(key)) {
    if (item.routine) return `/?do=care&r=${item.routine}`;
    if (item.kind === "weigh") return "/?do=weigh";
    if (item.kind === "trade") return "/?do=trade";
    if (item.id === "stream") return "/?do=golive";
    if (item.id === "stream-prep") return "/?do=live";
    if (item.id === "gym") return "/gym";
    if (item.kind === "sing") return "/?do=sing";
    if (item.kind === "sleep" || item.id === "night") return "/?do=shut";
    if (item.id === "meal2" && o.meal2Pick) return "/?do=meal2";
    return "/";
  }
  if (key === "briefing") return "/?do=plan";
  if (key === "brain:review") return "/insights?tab=review";
  if (key === "brain:lastmatch") return "/?do=live";
  if (key === "stream:wrap" || key.startsWith("streambreak:") || key.startsWith("phase:stream")) return "/?do=golive";
  if (key.startsWith("water:")) return "/?do=water";
  if (key === "summary") return "/?do=shut";
  return "/";
}

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
  const badge = badgeCount(s, now);
  if (set.dndUntil > nowEpoch) return { date, reminders: [], badge };

  const out: Reminder[] = [];
  const t = (min: number, title: string) => (set.notifShowTime ? `${hm(min)} · ${title}` : title);
  const inWindow = (at: number) => nowMin - at >= 0 && nowMin - at < WINDOW;
  // v1.8 quiet during class: a time inside a class moves to the class end (chained); slot reminders inside a class are skipped.
  const q = (m: number) => quietAt(all, m), busy = (m: number) => inClass(all, m);
  const classes = all.filter((i) => i.kind === "class");
  const kindOn = (kind: string) => set.notifyKinds[kind] !== false;
  // v1.4 live block: [stream, stream-end). While on air, no follow-ups and no water pings.
  const lv = all.find((i) => i.id === "stream"), lvEnd = lv && blockEnd(all, lv), onAir = !!lv && lvEnd !== undefined && nowMin >= lv.min && nowMin < lvEnd;

  // Wake-up briefing: the plan for the day in one notification.
  const wake = items[0]?.min;
  if (set.notifyBriefing && wake !== undefined && inWindow(q(wake))) {
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
    // v1.7 periodic self-care tasks that came due (health checks never push).
    const due = s.care.level !== null ? dueTasks(s, date) : [];
    if (due.length) body.push(`ครบรอบ: ${due.slice(0, 2).map((x) => x.title).join(", ")}`);
    if (classes.length) body.splice(1, 0, `เรียน ${classes.length} วิชา ${hm(classes[0].min)}-${hm(Math.max(...classes.map((c) => c.min + (c.dur ?? 0))))}`);
    out.push({
      key: "briefing",
      title: t(wake, "แผนวันนี้"),
      body: body.join(" · "),
      level: "info",
      priority: 0,
    });
  }

  // Weekly review is ready: review day (see brain/review.ts), 90 min after wake, until that week is done.
  if (set.notifyReview && wake !== undefined && weekKey(s, date) === date && s.brain.reviewDone !== date && inWindow(q(wake + 90))) {
    out.push({ key: "brain:review", title: t(wake + 90, "รีวิวสัปดาห์พร้อมแล้ว"), body: "แตะเพื่อดูผลสัปดาห์และแผนหน้า", level: "info", priority: 1 });
  }

  // Opt-in nudge 15 min before game-stop.
  const stop = all.find((i) => i.id === "game-stop");
  if (set.notifyLastMatch && stop && kindOn("game") && inWindow(q(stop.min - 15))) {
    out.push({ key: "brain:lastmatch", title: t(stop.min - 15, "อีก 15 นาทีถึงเวลาหยุดเกมแข่ง"), body: "แมตช์ถัดไปเป็นแมตช์สุดท้ายไหม", level: "info", priority: 2 });
  }

  // 15 min before the live block ends (default on).
  const sleepItem = items.find((i) => i.kind === "sleep");
  if (set.notifyStreamWrap && lv && lvEnd !== undefined && kindOn("stream") && inWindow(q(lvEnd - 15))) {
    out.push({ key: "stream:wrap", title: t(lvEnd - 15, "อีก 15 นาทีปิดไลฟ์"), body: "บอกเวลาไลฟ์พรุ่งนี้ · เลือกช่องที่จะ raid · ปิดตรงเวลา" + (sleepItem ? ` เพื่อนอน ${hm(sleepItem.min)}` : ""), level: "info", priority: 2 });
  }

  // A new block of the day starts: "ตอนนี้ 21:00 · พักกะ" + what to do in it.
  if (set.notifyPhase) {
    for (const p of phases(s, day, date)) {
      if (p.key === "sleep" || p.start === wake || !inWindow(p.start) || busy(p.start)) continue;
      const todo = pending.filter((i) => i.min >= p.start && i.min < p.end).map((i) => i.title).slice(0, 3);
      // Gaming and streaming starts stay positive: the tip, never a to-do list.
      const body = todo.length && !(p.key.startsWith("game") || p.key.startsWith("stream")) ? `ต้องทำ: ${todo.join(", ")}` : p.tip;
      out.push({ key: `phase:${p.key}`, title: `ตอนนี้ ${hm(p.start)} · ${p.label}`, body, level: "info", priority: 1 });
    }
  }

  const prevDay = s.days[addDays(date, -1)];
  for (const i of pending) {
    if (i.remind === false || !kindOn(i.kind)) continue;
    const diff = nowMin - q(i.min);
    let body = i.cue ? `${i.cue}${i.sub ? ` · ${i.sub}` : ""}` : i.sub ?? "ถึงเวลาแล้ว";
    if (i.id === "meal2" && def.work && !day.meal2) body = "แตะเพื่อเลือก: " + Object.values(MEAL2_LABEL).join(" / ");
    // v1.7 routine row: cue + the first 3 required steps still to do today.
    const r = i.routine ? (s.schedule.care ?? []).find((x) => x.id === i.routine) : undefined;
    if (r) {
      const next = rowState(r, day, date, prevDay).next;
      if (next.length) body = [i.cue, next.slice(0, 3).map(stepShort).join(", ") + (next.length > 3 ? ` +${next.length - 3}` : "")].filter(Boolean).join(" · ");
    }
    const k = i.planMin !== undefined ? `${i.id}@${i.min}` : i.id; // a moved item gets a fresh key, so it can remind again
    const url = reminderUrl(`${k}:due`, i, { meal2Pick: i.id === "meal2" && def.work && !day.meal2 });
    if (diff >= 0 && diff < WINDOW) out.push({ key: `${k}:due`, title: t(i.min, i.title), body, level: "due", priority: 2, url });
    // No follow-up for sleep: the user is (hopefully) asleep.
    const follow = set.followUpMin;
    // Routine rows get no follow-up, except the bedtime routine hosted on the night row.
    // The follow-up also stays quiet in class: one landing inside a class moves to that class's end.
    const lateAt = q(q(i.min) + follow), ld = nowMin - lateAt;
    if (follow > 0 && i.kind !== "sleep" && !onAir && !(i.routine && i.routine !== "pm") && ld >= 0 && ld < WINDOW) {
      out.push({ key: `${k}:late`, title: `ยังไม่ได้ทำ: ${i.title}`, body: `กำหนด ${hm(i.min)} เลยมา ${lateAt - i.min} นาที · เริ่มแค่ 2 นาทีก็พอ`, level: "late", priority: 3, url });
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
        if (!inWindow(slot) || busy(slot)) continue;
        out.push(st
          ? { key: `streambreak:${slot}`, title: t(slot, "พักเสียง 5 นาที (BRB)"), body: "ปิดไมค์ ไม่กระซิบ · จิบน้ำ · ลุกยืน · มองไกล 20 วินาที", level: "info", priority: 4 }
          : { key: `gamebreak:${slot}`, title: t(slot, "พักสายตา ลุกยืด 5 นาที"), body: "มองไกล 20 วินาที · ดื่มน้ำ · แล้วเล่นต่อ", level: "info", priority: 4 });
      }
    }
  }

  // v1.7 SPF reapply on a hot/outdoor day: every 2 h after the tap for up to 6 h, never past 18:00, quiet on air.
  const hot = day.hot;
  if (typeof hot === "number" && hot > 1e12 && s.care.level !== null && kindOn("care") && (s.schedule.care ?? []).some((r) => r.on && r.steps.some((x) => x.id === "spf" && x.on !== false))) {
    const from = bkkMin(hot), stop = Math.min(from + 360, 1080);
    for (let slot = from + 120; slot < stop; slot += 120) {
      if (onAir || !inWindow(slot) || busy(slot)) continue;
      out.push({ key: `spf:${slot}`, title: t(slot, "ทากันแดดซ้ำ"), body: "ตอนอยู่กลางแจ้งทาซ้ำทุก 2 ชม. หรือหลังเหงื่อออก", level: "info", priority: 4 });
    }
  }

  const sleep = sleepItem;
  if (set.notifyWater && !onAir && sleep && wake !== undefined) {
    const target = waterGoal(s, day, weightStats(s, date).cur);
    const every = Math.max(30, set.waterEveryMin);
    const ping = (key: string, at: number) => {
      const expected = (target * (at - wake)) / (sleep.min - wake);
      if (!inWindow(at) || day.waterMl >= expected - 300) return false;
      out.push({ key, title: t(at, "ดื่มน้ำ"), body: `ตอนนี้ ${(day.waterMl / 1000).toFixed(1)} / ${(target / 1000).toFixed(1)} ลิตร ควรได้ราว ${(expected / 1000).toFixed(1)} แล้ว`, level: "info", priority: 4 });
      return true;
    };
    const ends = new Set<number>(); // class ends that swallowed a slot
    let pinged = false;
    for (let slot = wake + every; slot < sleep.min - 60; slot += every) {
      if (busy(slot)) { ends.add(q(slot)); continue; }
      if (ping(`water:${slot}`, slot)) pinged = true;
    }
    // One catch-up at the class end when a slot fell inside class and water is behind the pro-rata goal.
    for (const end of ends) {
      const c = classes.find((x) => x.min + (x.dur ?? 0) === end);
      if (!pinged && c && end < sleep.min - 60 && ping(`water:${c.id}`, end)) pinged = true;
    }
  }

  if (set.notifySummary && sleep && inWindow(q(sleep.min - 15))) {
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

  for (const r of out) r.url ??= reminderUrl(r.key);
  out.sort((a, b) => a.priority - b.priority);
  if (set.privateNotifications) return { date, badge, reminders: out.map((r) => ({ ...r, title: "Krob", body: "มีรายการที่ต้องทำ" })) };
  return { date, reminders: out, badge };
}

// Several reminders in one tick -> one notification led by the most important one.
export function groupReminders(list: Reminder[], hidden: boolean): { title: string; body: string; tag: string; url?: string } {
  const u = (lead: Reminder) => (lead.url ? { url: lead.url } : {});
  if (list.length === 1 || hidden) return { title: list[0].title, body: list[0].body, tag: list[0].key, ...u(list[0]) };
  const [first, ...others] = list;
  // A phase notice already lists its to-dos; don't repeat those items after "และ".
  const plain = (r: Reminder) => r.title.replace(/^\d\d:\d\d · /, "");
  const rest = first.key.startsWith("phase:") ? others.filter((r) => !(r.level === "due" && first.body.includes(plain(r)))) : others;
  if (!rest.length) return { title: first.title, body: first.body, tag: first.key, ...u(first) };
  return { title: first.title, body: `${first.body}\nและ: ${rest.map(plain).join(" · ")}`, tag: `group:${first.key}`, ...u(first) };
}
