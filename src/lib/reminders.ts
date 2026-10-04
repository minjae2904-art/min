// Decides which notifications are due right now. Pure: used by the cron route (server) and the in-app toast/badge (client).
import { hm, logicalDate, logicalMinutes } from "./date";
import { emptyDay, type State } from "./model";
import { MEAL2_LABEL } from "./schedule";
import { dayItems, waterGoal, weightStats } from "./stats";

export type Reminder = { key: string; title: string; body: string; level: "due" | "late" | "info" };

const WINDOW = 10; // cron runs every minute; a 10-minute window survives missed ticks, notification_log dedupes

// nowEpoch is real time (for do-not-disturb); `now` is wall-clock time in the user's zone.
export function dueReminders(s: State, now: Date, nowEpoch = Date.now()): { date: string; reminders: Reminder[]; badge: number } {
  const date = logicalDate(now);
  const nowMin = logicalMinutes(now);
  const day = s.days[date] ?? emptyDay();
  const items = dayItems(s, day);
  const pending = items.filter((i) => !day.done[i.id]);
  const badge = pending.filter((i) => i.min <= nowMin).length;
  if (s.settings.dndUntil > nowEpoch) return { date, reminders: [], badge };

  const out: Reminder[] = [];
  const follow = s.settings.followUpMin;
  for (const i of pending) {
    if (i.remind === false) continue;
    const diff = nowMin - i.min;
    let body = i.sub ?? "ถึงเวลาแล้ว";
    if (i.id === "meal2" && day.type === "work" && !day.meal2) body = "แตะเพื่อเลือก: " + Object.values(MEAL2_LABEL).join(" / ");
    if (diff >= 0 && diff < WINDOW) out.push({ key: `${i.id}:due`, title: i.title, body, level: "due" });
    // No follow-up for sleep: the user is (hopefully) asleep.
    if (follow > 0 && i.kind !== "sleep" && diff >= follow && diff < follow + WINDOW) {
      out.push({ key: `${i.id}:late`, title: `ยังไม่ได้ทำ: ${i.title}`, body: `เลยเวลา ${hm(i.min)} มา ${follow} นาที`, level: "late" });
    }
  }

  const sleep = items.find((i) => i.kind === "sleep");
  const wake = items[0]?.min;

  if (s.settings.notifyWater && sleep && wake !== undefined) {
    const target = waterGoal(s, day, weightStats(s, date).cur);
    const every = Math.max(30, s.settings.waterEveryMin);
    for (let slot = wake + every; slot < sleep.min - 60; slot += every) {
      const expected = (target * (slot - wake)) / (sleep.min - wake);
      if (nowMin - slot >= 0 && nowMin - slot < WINDOW && day.waterMl < expected - 300) {
        out.push({ key: `water:${slot}`, title: "ดื่มน้ำ", body: `ตอนนี้ ${(day.waterMl / 1000).toFixed(1)} / ${(target / 1000).toFixed(1)} ลิตร ควรได้ราว ${(expected / 1000).toFixed(1)} แล้ว`, level: "info" });
      }
    }
  }

  if (s.settings.notifySummary && sleep) {
    const diff = nowMin - (sleep.min - 15);
    if (diff >= 0 && diff < WINDOW) {
      const done = items.length - pending.length;
      const miss = pending.filter((i) => i.kind !== "sleep").slice(0, 3).map((i) => i.title);
      out.push({
        key: "summary",
        title: `สรุปวันนี้ ครบ ${Math.round((done / items.length) * 100)}%`,
        body: miss.length ? `ยังขาด: ${miss.join(", ")}` : "ทำครบทุกอย่าง เก่งมาก",
        level: "info",
      });
    }
  }

  if (s.settings.privateNotifications) return { date, badge, reminders: out.map((r) => ({ ...r, title: "Krob", body: "มีรายการที่ต้องทำ" })) };
  return { date, reminders: out, badge };
}
