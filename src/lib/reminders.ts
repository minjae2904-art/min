// Decides which notifications are due right now. Pure: used by the cron route (server) and the in-app toast/badge (client).
import { hm, logicalDate, logicalMinutes } from "./date";
import { emptyDay, type State } from "./model";
import { phases } from "./phase";
import { GYM_CYCLE, GYM_LABEL, nextInCycle } from "./rotation";
import { MEAL2_LABEL } from "./schedule";
import { dayItems, waterGoal, weightStats } from "./stats";

// Lower number = shown first when several land in the same minute.
export type Reminder = { key: string; title: string; body: string; level: "due" | "late" | "info"; priority: number };

const WINDOW = 10; // cron runs every minute; a 10-minute window survives missed ticks, notification_log dedupes

// nowEpoch is real time (for do-not-disturb); `now` is wall-clock time in the user's zone.
export function dueReminders(s: State, now: Date, nowEpoch = Date.now()): { date: string; reminders: Reminder[]; badge: number } {
  const set = s.settings;
  const date = logicalDate(now);
  const nowMin = logicalMinutes(now);
  const day = s.days[date] ?? emptyDay();
  const items = dayItems(s, day);
  const pending = items.filter((i) => !day.done[i.id]);
  const badge = pending.filter((i) => i.min <= nowMin).length;
  if (set.dndUntil > nowEpoch) return { date, reminders: [], badge };

  const out: Reminder[] = [];
  const t = (min: number, title: string) => (set.notifShowTime ? `${hm(min)} · ${title}` : title);
  const inWindow = (at: number) => nowMin - at >= 0 && nowMin - at < WINDOW;
  const kindOn = (kind: string) => set.notifyKinds[kind] !== false;

  // Wake-up briefing: the plan for the day in one notification.
  const wake = items[0]?.min;
  if (set.notifyBriefing && wake !== undefined && inWindow(wake)) {
    const gym = day.type === "work" ? nextInCycle(GYM_CYCLE, s.workouts.filter((w) => w.date !== date)) : null;
    const water = waterGoal(s, day, weightStats(s, date).cur);
    out.push({
      key: "briefing",
      title: t(wake, "แผนวันนี้"),
      body: [`${items.length} รายการ`, gym ? `ยิม ${gym} ${GYM_LABEL[gym]}` : "วันหยุด", `น้ำ ${(water / 1000).toFixed(1)} ลิตร`, "อย่าลืมเช็กอินความรู้สึก"].join(" · "),
      level: "info",
      priority: 0,
    });
  }

  // A new block of the day starts: "ตอนนี้ 21:00 · พักกะ" + what to do in it.
  if (set.notifyPhase) {
    for (const p of phases(s, day)) {
      if (p.key === "sleep" || p.start === wake || !inWindow(p.start)) continue;
      const todo = pending.filter((i) => i.min >= p.start && i.min < p.end).map((i) => i.title).slice(0, 3);
      out.push({ key: `phase:${p.key}`, title: `ตอนนี้ ${hm(p.start)} · ${p.label}`, body: todo.length ? `ต้องทำ: ${todo.join(", ")}` : p.tip, level: "info", priority: 1 });
    }
  }

  for (const i of pending) {
    if (i.remind === false || !kindOn(i.kind)) continue;
    const diff = nowMin - i.min;
    let body = i.cue ? `${i.cue}${i.sub ? ` · ${i.sub}` : ""}` : i.sub ?? "ถึงเวลาแล้ว";
    if (i.id === "meal2" && day.type === "work" && !day.meal2) body = "แตะเพื่อเลือก: " + Object.values(MEAL2_LABEL).join(" / ");
    if (diff >= 0 && diff < WINDOW) out.push({ key: `${i.id}:due`, title: t(i.min, i.title), body, level: "due", priority: 2 });
    // No follow-up for sleep: the user is (hopefully) asleep.
    const follow = set.followUpMin;
    if (follow > 0 && i.kind !== "sleep" && diff >= follow && diff < follow + WINDOW) {
      out.push({ key: `${i.id}:late`, title: `ยังไม่ได้ทำ: ${i.title}`, body: `กำหนด ${hm(i.min)} เลยมา ${follow} นาที · เริ่มแค่ 2 นาทีก็พอ`, level: "late", priority: 3 });
    }
  }

  const sleep = items.find((i) => i.kind === "sleep");
  if (set.notifyWater && sleep && wake !== undefined) {
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
