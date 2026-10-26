// Behaviour-design helpers. Each feature maps to a well-studied effect:
//  - Two-minute rule / tiny habits: when something is overdue, shrink it so starting is easy.
//  - Identity-based habits: show who you are becoming, not just what to do.
//  - Fresh-start effect: Mondays and the 1st of the month are natural restart points.
//  - Self-compassion after a miss predicts getting back on track better than guilt.
//  - Positive reinforcement with some variability keeps rewards from going stale.
//  - Achievements mark milestones (progress principle: visible progress fuels motivation).
import { addDays } from "./date";
import { langArr, msgs } from "../i18n";
import * as M from "../i18n/msg/lib-7";
import type { State } from "./model";
import type { Item } from "./schedule";
import { dayScore, streak, waterGoal, weightStats } from "./stats";

const m = msgs(M);

export const DEFAULT_IDENTITY = m.in("th", "psych.identity.default");
// Round E accessor (spec 9.3): consumers call this; DEFAULT_IDENTITY stays the canonical Thai text for tests.
export const defaultIdentity = () => m("psych.identity.default");

export function microStep(i: Item): string {
  switch (i.kind) {
    case "meal": return m("psych.micro.meal");
    case "supp": return m("psych.micro.supp");
    case "gym": return m("psych.micro.gym");
    case "personality": return m("psych.micro.personality");
    case "weigh": return m("psych.micro.weigh");
    case "trade": return m("psych.micro.trade");
    case "sleep": return m("psych.micro.sleep");
    case "sing": return m("psych.micro.sing");
    case "mc": return m("psych.micro.mc");
    case "care": return m("psych.micro.care");
    default: return m("psych.micro.default");
  }
}

const PRAISE = langArr(() => [
  m("psych.praise.0"),
  m("psych.praise.1"),
  m("psych.praise.2"),
  m("psych.praise.3"),
  m("psych.praise.4"),
  m("psych.praise.5"),
  m("psych.praise.6"),
]);
// Show praise on roughly 1 in 3 ticks so it stays meaningful (variable reinforcement).
export function maybePraise(roll: number): string | null {
  return roll < 0.33 ? PRAISE[Math.floor((roll / 0.33) * PRAISE.length) % PRAISE.length] : null;
}

export function dayMessage(s: State, today: string): string | null {
  const d = new Date(today + "T12:00:00");
  const yesterday = s.days[addDays(today, -1)];
  const hadHistory = Object.keys(s.days).length > 1;
  if (hadHistory && yesterday && dayScore(s, yesterday) < s.settings.goodDay) return m("psych.day.restart");
  if (d.getDate() === 1) return m("psych.day.month");
  if (d.getDay() === 1) return m("psych.day.week");
  return null;
}

export type Badge = { id: string; title: string; desc: string; group: string; art: string };

// Badge art (public/art/badge-<art>-256.webp) by group; live-stream and minecraft-server are kept for later.
type Group = "streak" | "perfect" | "gym" | "kg" | "water" | "persona" | "trade" | "journal";
const BADGE_ART: Record<Group, string> = {
  streak: "consistency", perfect: "trophy", gym: "gym-streak", kg: "trophy",
  water: "hydration", persona: "singing", trade: "trading-discipline", journal: "sleep",
};

// Every badge the app can award, with a check against current data.
export function badgeCatalog(s: State, today: string): (Badge & { earned: boolean })[] {
  const st = streak(s, today).days;
  const gym = s.workouts.filter((w) => w.code.startsWith("D")).length;
  const persona = s.personality.length;
  const perfect = Object.values(s.days).filter((d) => dayScore(s, d) >= 1).length;
  const kg = weightStats(s, today).cur;
  const gained = kg - s.profile.startKg;
  const waterDays = Object.values(s.days).filter((d) => d.waterMl >= waterGoal(s, d, kg)).length;
  const journals = Object.values(s.days).filter((d) => d.journal && (d.journal.good || d.journal.fix || d.journal.thanks)).length;
  const out: (Badge & { earned: boolean })[] = [];
  const add = (id: string, g: Group, title: string, desc: string, earned: boolean) => out.push({ id, group: m(`psych.group.${g}`), title, desc, earned, art: BADGE_ART[g] ?? "trophy" });
  for (const n of [3, 7, 14, 30, 60, 100]) add(`streak-${n}`, "streak", m("psych.badge.streak.title", { n }), m("psych.badge.streak.desc", { n }), st >= n);
  for (const n of [1, 7, 30]) add(`perfect-${n}`, "perfect", n === 1 ? m("psych.badge.perfect.title1") : m("psych.badge.perfect.title", { n }), m("psych.badge.perfect.desc"), perfect >= n);
  for (const n of [10, 25, 50, 100, 200]) add(`gym-${n}`, "gym", m("psych.badge.gym.title", { n }), m("psych.badge.gym.desc", { n }), gym >= n);
  for (const n of [1, 3, 5, 10, 15]) add(`kg-${n}`, "kg", `+${n} kg`, m("psych.badge.kg.desc", { n }), gained >= n);
  add("kg-goal", "kg", m("psych.badge.kgGoal.title"), m("psych.badge.kgGoal.desc", { kg: s.profile.goalKg }), gained > 0 && kg >= s.profile.goalKg);
  for (const n of [7, 30]) add(`water-${n}`, "water", m("psych.badge.water.title", { n }), m("psych.badge.water.desc", { n }), waterDays >= n);
  for (const n of [10, 30, 100]) add(`persona-${n}`, "persona", m("psych.badge.persona.title", { n }), m("psych.badge.persona.desc", { n }), persona >= n);
  const tradeDays = Object.values(s.days).filter((d) => d.trade).length;
  const disciplined = Object.values(s.days).filter((d) => d.trade?.result === "skip").length;
  for (const n of [10, 30, 100]) add(`trade-${n}`, "trade", m("psych.badge.trade.title", { n }), m("psych.badge.trade.desc", { n }), tradeDays >= n);
  add("trade-discipline", "trade", m("psych.badge.tradeDiscipline.title"), m("psych.badge.tradeDiscipline.desc"), disciplined >= 5);
  for (const n of [7, 30]) add(`journal-${n}`, "journal", m("psych.badge.journal.title", { n }), m("psych.badge.journal.desc", { n }), journals >= n);
  return out;
}
