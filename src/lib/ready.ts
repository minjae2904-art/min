// v1.8 morning readiness (pure): a transparent 0-100 from the user's own taps. General wellness only, never medical.
// Hidden until there are 5 nights of sleep times in 14 days and at least one input beyond the sleep buttons.
import { setDayTemplate, setVoiceRest } from "./actions";
import { compileAction } from "./brain/actions";
import { lin, median, round15 } from "./brain/math";
import { isSeason, plannedSleepOf, plannedWakeOf, restFor } from "./brain/signals";
import type { Deload } from "./brain/types";
import { addDays } from "./date";
import { dec } from "./gymlog";
import { aboutMin, half, round5 } from "./honest";
import { TERM_ALT } from "./templates";
import { classesOn } from "./term";
import { dayFor, hasCheckin, plannedType, type DayLog, type GymLog, type State } from "./model";
import { itemsFor, maxDayShift, resolveTemplate } from "./schedule";
import { bkkMin, sd, sleepHours, wakeMinOf } from "./stats";

export type ReadyKey = "sleep" | "reg" | "bed" | "load" | "voice" | "mood";
export const READY_KEYS: ReadyKey[] = ["sleep", "reg", "bed", "load", "voice", "mood"];
export const READY_W: Record<ReadyKey, number> = { sleep: 30, reg: 10, bed: 15, load: 15, voice: 10, mood: 20 };
export const READY_LABEL: Record<ReadyKey, string> = { sleep: "ชั่วโมงนอน", reg: "เวลาตื่นสม่ำเสมอ", bed: "เข้านอนตามแผน", load: "ร่างกายจากการยก", voice: "เสียง", mood: "พลังงานและอารมณ์" };
export type ReadyPart = { k: ReadyKey; score: number | null; text: string };
export type ReadyTip = { k: "voice" | "rest" | "light" | "shift" | "go"; text: string; act: string | null; tpl?: string; by?: number };
export type Ready = { show: boolean; score: number | null; level: "high" | "mid" | "low" | null; parts: ReadyPart[]; missing: string[]; need: string | null; tip: ReadyTip | null };

export const READY_NIGHTS = 5;
const pts = (x: number, x0: number, x1: number) => Math.round(lin(x, x0, x1) * 100);
const isD = (code: string) => code.startsWith("D");
const logVol = (l: GymLog) => l.x.reduce((a, [, str]) => a + dec(str).reduce((b, [k, r]) => b + k * r, 0), 0);

function partsOf(s: State, today: string): Record<ReadyKey, ReadyPart | null> {
  const y = addDays(today, -1), d = s.days[today], dy = s.days[y];
  const out = {} as Record<ReadyKey, ReadyPart | null>;
  const h = sleepHours(s, today);
  out.sleep = h === null ? null : { k: "sleep", score: pts(h, 5, 7.5), text: `นอนราว ${half(h)} ชม.` };
  const wakes = Array.from({ length: 7 }, (_, i) => { const dt = addDays(today, -i), w = s.days[dt]?.wakeAt; return typeof w === "number" ? wakeMinOf(dt, w) : null; }).filter((w): w is number => w !== null);
  const wsd = wakes.length >= 4 ? sd(wakes) : null;
  out.reg = wsd === null ? null : { k: "reg", score: pts(wsd, 90, 20), text: wsd < 15 ? "เวลาตื่นสม่ำเสมอ" : `เวลาตื่นแกว่ง${aboutMin(wsd)}` };
  const plan = plannedSleepOf(itemsFor(s.schedule, dayFor(s, y), y));
  if (typeof dy?.sleepAt === "number" && plan !== null) {
    const late = bkkMin(dy.sleepAt) - plan;
    out.bed = { k: "bed", score: late <= 15 ? 100 : pts(late, 120, 15), text: late <= 15 ? "เข้านอนตรงแผน" : `ช้ากว่าแผนราว ${round15(late)} นาที` };
  } else out.bed = null;
  const sore = d?.sore === 0 || d?.sore === 1 || d?.sore === 2 ? d.sore : null;
  const recent = s.workouts.some((w) => w.date >= addDays(today, -6) && w.date <= today);
  if (recent || sore !== null) {
    let c = 0;
    while (c < 14 && s.workouts.some((w) => w.date === addDays(y, -c) && isD(w.code))) c++;
    const logs = (s.gym?.log ?? []).filter((l) => l.d <= y);
    const yv = logs.filter((l) => l.d === y).reduce((a, l) => a + logVol(l), 0);
    const base = median(logs.filter((l) => l.d < y).slice(-6).map(logVol));
    const spike = yv > 0 && base !== null && base > 0 && yv > 1.25 * base;
    const score = Math.max(0, Math.min(100, 100 - 20 * Math.max(0, c - 2) - (sore === 1 ? 25 : sore === 2 ? 50 : 0) - (spike ? 15 : 0)));
    const txt = [c > 2 ? `ยก ${c} วันติด` : "", sore === 1 ? "เมื่อยนิดหน่อย" : sore === 2 ? "เมื่อยมาก" : "", spike ? "เมื่อวานยกหนักกว่าปกติ" : ""].filter(Boolean);
    out.load = { k: "load", score, text: txt.length ? txt.join(" · ") : "ร่างกายพร้อม" };
  } else out.load = null;
  const v = dy?.live && typeof dy.live === "object" && typeof dy.live.v === "number" ? dy.live.v : null;
  const strain = !!(dy?.sing && typeof dy.sing === "object" && dy.sing.strain);
  const vsym = Array.isArray(d?.sym) && d.sym.includes("voice");
  out.voice = v === null && !strain && !vsym ? null
    : v === 2 || vsym ? { k: "voice", score: 20, text: "เสียงล้า" }
    : v === 1 || strain ? { k: "voice", score: 60, text: "แหบนิดหน่อย" }
    : { k: "voice", score: 100, text: "เสียงปกติ" };
  out.mood = d && hasCheckin(d) ? { k: "mood", score: pts((d.checkin.energy + d.checkin.mood) / 2, 1, 4), text: `พลังงาน ${d.checkin.energy}/5 อารมณ์ ${d.checkin.mood}/5` } : null;
  return out;
}

function tipOf(s: State, today: string, score: number, p: Record<ReadyKey, ReadyPart | null>): ReadyTip | null {
  const d = dayFor(s, today), cfg = s.schedule;
  const items = itemsFor(cfg, d, today);
  const gymOpen = items.some((i) => i.id === "gym") && !d.done.gym;
  if (p.voice && p.voice.score! <= 20 && items.some((i) => i.kind === "sing") && !d.voiceRest)
    return { k: "voice", text: "เมื่อวานเสียงล้า วันนี้พักเสียงไหม (ซ่อนรายการร้องเพลง ไลฟ์พูดเบาๆ)", act: "พักเสียงวันนี้" };
  const { key } = resolveTemplate(cfg, d.type);
  if (score < 40 && gymOpen) {
    // On class days prefer the in-term no-gym swap (same class-day timings). Every candidate passes the same gate as a
    // brain lever (class clash, ticked items, same plan); none passing falls through to the light/shift tips.
    const base = cfg.templates?.find((x) => x.id === key)?.from ?? key;
    const alt = classesOn(cfg.term, today).length ? TERM_ALT[base] : undefined;
    for (const tpl of [alt, restFor(cfg, d.type)]) {
      if (!tpl || tpl === key || !compileAction(s, { k: "set_day_template", date: today, tpl }, today, "brief").ok) continue;
      return { k: "rest", text: "ความพร้อมต่ำ เปลี่ยนวันนี้เป็นวันพักยิมไหม", act: `ใช้แผน "${resolveTemplate(cfg, tpl).def.name}" วันนี้`, tpl };
    }
  }
  const dl = s.brain.deload;
  if (score < 55 && gymOpen && (!dl || (dl.from === dl.to && dl.to < today)) && compileAction(s, { k: "plan_deload", from: today, days: 1 }, today, "brief").ok)
    return { k: "light", text: "ร่างกายยังล้า ยิมวันนี้เล่นเบาไหม (ท่าเดิม ราวครึ่งเซ็ต)", act: "เล่นเบาวันนี้" };
  if (!isSeason(cfg, d.type) && !d.shiftMin && typeof d.wakeAt === "number") {
    const late = wakeMinOf(today, d.wakeAt) - plannedWakeOf(items);
    const by = Math.min(round15(late), maxDayShift(d.type, d.meal2, cfg));
    if (late >= 45 && by >= 15) return { k: "shift", text: `ตื่นช้ากว่าแผนราว ${by} นาที เลื่อนตารางวันนี้ตามไหม`, act: `เลื่อน +${by} นาที`, by };
  }
  if (score >= 75 && gymOpen) return { k: "go", text: "พร้อมดี ถ้าเซ็ตครั้งก่อนครบ ลองเพิ่มน้ำหนักตามคำแนะนำในหน้ายิม", act: null };
  return null;
}

// Clock-free (the window check lives in readyWindow), so callers memo it on [s, today].
export function readyOf(s: State, today: string): Ready {
  const p = partsOf(s, today);
  const present = READY_KEYS.filter((k) => p[k]);
  const sw = present.reduce((a, k) => a + READY_W[k], 0);
  const score = sw ? round5(present.reduce((a, k) => a + READY_W[k] * p[k]!.score!, 0) / sw) : null;
  const level = score === null ? null : score >= 75 ? "high" : score >= 50 ? "mid" : "low";
  const nights = Array.from({ length: 14 }, (_, i) => sleepHours(s, addDays(today, -i))).filter((h) => h !== null).length;
  const d = s.days[today];
  const awake = typeof d?.wakeAt === "number" && typeof d.sleepAt !== "number";
  const other = !!(p.load || p.voice || p.mood);
  const need = !s.settings.ready ? null
    : nights < READY_NIGHTS ? `ต้องมีเวลานอนอีก ${READY_NIGHTS - nights} คืน (กดเข้านอน/ตื่นแล้ว)`
    : !p.sleep ? "ยังไม่มีเวลานอนเมื่อคืน"
    : !other ? "เช็กอินตอนเช้าเพื่อดูความพร้อม" : null;
  const show = s.settings.ready && awake && !!p.sleep && other && nights >= READY_NIGHTS;
  return {
    show, score, level,
    parts: READY_KEYS.map((k) => p[k] ?? { k, score: null, text: "" }),
    missing: READY_KEYS.filter((k) => !p[k]).map((k) => READY_LABEL[k]),
    need,
    tip: score === null ? null : tipOf(s, today, score, p),
  };
}

// The morning slot where Ready replaces Balance on the glance strip: from wake-up (tap, else plan) to 5 h after the planned wake.
export function readyWindow(s: State, today: string, nowMin: number): boolean {
  const d = dayFor(s, today);
  const plan = plannedWakeOf(itemsFor(s.schedule, d, today));
  const from = typeof d.wakeAt === "number" ? wakeMinOf(today, d.wakeAt) : plan;
  return nowMin >= from && nowMin <= Math.max(plan, from) + 300;
}

export function applyReadyTip(x: State, today: string, t: ReadyTip) {
  if (t.k === "voice") setVoiceRest(x, today, true);
  else if (t.k === "rest" && t.tpl) setDayTemplate(x, today, t.tpl);
  else if (t.k === "light") x.brain = { ...x.brain, deload: { from: today, to: today } };
  else if (t.k === "shift" && t.by) { const d = dayFor(x, today); d.shiftMin = t.by; x.days[today] = d; }
}

export type ReadySnap = { day: DayLog | null; deload: Deload | null };
export const snapReady = (s: State, today: string): ReadySnap => structuredClone({ day: s.days[today] ?? null, deload: s.brain.deload });
// Restores what a tip can touch (type, voiceRest, shiftMin, brain.deload); keeps every tick logged since.
export function undoReady(x: State, today: string, snap: ReadySnap) {
  x.brain = { ...x.brain, deload: snap.deload };
  const d = x.days[today], o = snap.day;
  if (!d) return;
  d.type = o?.type ?? plannedType(x, today);
  if (o?.voiceRest) d.voiceRest = true; else delete d.voiceRest;
  if (o?.shiftMin !== undefined) d.shiftMin = o.shiftMin; else delete d.shiftMin;
}
