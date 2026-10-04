// Decides which notifications are due right now. Pure: used by the cron route (server) and the in-app toast/badge (client).
import { at, hm, logicalDate, logicalMinutes } from "./date";
import { waterTargetMl } from "./health";
import { emptyDay, type State } from "./model";
import { MEAL2_LABEL, buildDay } from "./schedule";
import { weightStats } from "./stats";

export type Reminder = { key: string; title: string; body: string; level: "due" | "late" | "info" };

const WINDOW = 10; // cron runs every minute; a 10-minute window survives missed ticks, notification_log dedupes

export function dueReminders(s: State, now: Date): { date: string; reminders: Reminder[]; badge: number } {
  const date = logicalDate(now);
  const nowMin = logicalMinutes(now);
  const day = s.days[date] ?? emptyDay();
  const items = buildDay(day.type, day.meal2).filter((i) => i.ring);
  const pending = items.filter((i) => !day.done[i.id]);
  const out: Reminder[] = [];

  for (const i of pending) {
    const diff = nowMin - i.min;
    let body = i.sub ?? "ถึงเวลาแล้ว";
    if (i.id === "meal2" && day.type === "work" && !day.meal2) body = "แตะเพื่อเลือก: " + Object.values(MEAL2_LABEL).join(" / ");
    if (diff >= 0 && diff < WINDOW) out.push({ key: `${i.id}:due`, title: i.title, body, level: "due" });
    // No follow-up for sleep: the user is (hopefully) asleep.
    if (i.kind !== "sleep" && diff >= 30 && diff < 30 + WINDOW) out.push({ key: `${i.id}:late`, title: `ยังไม่ได้ทำ: ${i.title}`, body: `เลยเวลา ${hm(i.min)} มา 30 นาที`, level: "late" });
  }

  const sleep = items.find((i) => i.kind === "sleep");
  const wake = items[0]?.min ?? at(13);

  if (s.settings.notifyWater && sleep) {
    const kg = weightStats(s, date).cur;
    const target = day.type === "work" ? waterTargetMl(kg, 1.25, 0) : waterTargetMl(kg, 0, day.done.cardio ? 1.5 : 0);
    for (let slot = wake + 120; slot < sleep.min - 60; slot += 120) {
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

  const badge = pending.filter((i) => i.min <= nowMin).length;
  if (s.settings.privateNotifications) return { date, badge, reminders: out.map((r) => ({ ...r, title: "Krob", body: "มีรายการที่ต้องทำ" })) };
  return { date, reminders: out, badge };
}
