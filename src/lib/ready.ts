// v1.8 morning readiness (pure): a transparent 0-100 from the user's own taps. General wellness only, never medical.
// Hidden until there are 5 nights of sleep times in 14 days and at least one input beyond the sleep buttons.
import { langObj, msgs } from "../i18n";
import * as M from "../i18n/msg/lib-10";
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

const m = msgs(M);

export type ReadyKey = "sleep" | "reg" | "bed" | "load" | "voice" | "mood";
export const READY_KEYS: ReadyKey[] = ["sleep", "reg", "bed", "load", "voice", "mood"];
export const READY_W: Record<ReadyKey, number> = { sleep: 30, reg: 10, bed: 15, load: 15, voice: 10, mood: 20 };
export const READY_LABEL: Record<ReadyKey, string> = langObj(() => ({
  sleep: m("ready.label.sleep"), reg: m("ready.label.reg"), bed: m("ready.label.bed"), load: m("ready.label.load"), voice: m("ready.label.voice"), mood: m("ready.label.mood"),
}));
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
  out.sleep = h === null ? null : { k: "sleep", score: pts(h, 5, 7.5), text: m("ready.part.sleep", { h: half(h) }) };
  const wakes = Array.from({ length: 7 }, (_, i) => { const dt = addDays(today, -i), w = s.days[dt]?.wakeAt; return typeof w === "number" ? wakeMinOf(dt, w) : null; }).filter((w): w is number => w !== null);
  const wsd = wakes.length >= 4 ? sd(wakes) : null;
  out.reg = wsd === null ? null : { k: "reg", score: pts(wsd, 90, 20), text: wsd < 15 ? m("ready.part.regOk") : m("ready.part.regVar", { about: aboutMin(wsd) }) };
  const plan = plannedSleepOf(itemsFor(s.schedule, dayFor(s, y), y));
  if (typeof dy?.sleepAt === "number" && plan !== null) {
    const late = bkkMin(dy.sleepAt) - plan;
    out.bed = { k: "bed", score: late <= 15 ? 100 : pts(late, 120, 15), text: late <= 15 ? m("ready.part.bedOk") : m("ready.part.bedLate", { n: round15(late) }) };
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
    const txt = [c > 2 ? m("ready.part.streak", { c }) : "", sore === 1 ? m("ready.part.sore1") : sore === 2 ? m("ready.part.sore2") : "", spike ? m("ready.part.spike") : ""].filter(Boolean);
    out.load = { k: "load", score, text: txt.length ? txt.join(" · ") : m("ready.part.bodyOk") };
  } else out.load = null;
  const v = dy?.live && typeof dy.live === "object" && typeof dy.live.v === "number" ? dy.live.v : null;
  const strain = !!(dy?.sing && typeof dy.sing === "object" && dy.sing.strain);
  const vsym = Array.isArray(d?.sym) && d.sym.includes("voice");
  out.voice = v === null && !strain && !vsym ? null
    : v === 2 || vsym ? { k: "voice", score: 20, text: m("ready.part.voiceTired") }
    : v === 1 || strain ? { k: "voice", score: 60, text: m("ready.part.voiceHoarse") }
    : { k: "voice", score: 100, text: m("ready.part.voiceOk") };
  out.mood = d && hasCheckin(d) ? { k: "mood", score: pts((d.checkin.energy + d.checkin.mood) / 2, 1, 4), text: m("ready.part.mood", { energy: d.checkin.energy, mood: d.checkin.mood }) } : null;
  return out;
}

function tipOf(s: State, today: string, score: number, p: Record<ReadyKey, ReadyPart | null>): ReadyTip | null {
  const d = dayFor(s, today), cfg = s.schedule;
  const items = itemsFor(cfg, d, today);
  const gymOpen = items.some((i) => i.id === "gym") && !d.done.gym;
  if (p.voice && p.voice.score! <= 20 && items.some((i) => i.kind === "sing") && !d.voiceRest)
    return { k: "voice", text: m("ready.tip.voice"), act: m("ready.act.voice") };
  const { key } = resolveTemplate(cfg, d.type);
  if (score < 40 && gymOpen) {
    // On class days prefer the in-term no-gym swap (same class-day timings). Every candidate passes the same gate as a
    // brain lever (class clash, ticked items, same plan); none passing falls through to the light/shift tips.
    const base = cfg.templates?.find((x) => x.id === key)?.from ?? key;
    const alt = classesOn(cfg.term, today).length ? TERM_ALT[base] : undefined;
    for (const tpl of [alt, restFor(cfg, d.type)]) {
      if (!tpl || tpl === key || !compileAction(s, { k: "set_day_template", date: today, tpl }, today, "brief").ok) continue;
      return { k: "rest", text: m("ready.tip.rest"), act: m("ready.act.rest", { name: resolveTemplate(cfg, tpl).def.name }), tpl };
    }
  }
  const dl = s.brain.deload;
  if (score < 55 && gymOpen && (!dl || (dl.from === dl.to && dl.to < today)) && compileAction(s, { k: "plan_deload", from: today, days: 1 }, today, "brief").ok)
    return { k: "light", text: m("ready.tip.light"), act: m("ready.act.light") };
  if (!isSeason(cfg, d.type) && !d.shiftMin && typeof d.wakeAt === "number") {
    const late = wakeMinOf(today, d.wakeAt) - plannedWakeOf(items);
    const by = Math.min(round15(late), maxDayShift(d.type, d.meal2, cfg));
    if (late >= 45 && by >= 15) return { k: "shift", text: m("ready.tip.shift", { by }), act: m("ready.act.shift", { by }), by };
  }
  if (score >= 75 && gymOpen) return { k: "go", text: m("ready.tip.go"), act: null };
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
    : nights < READY_NIGHTS ? m("ready.need.nights", { n: READY_NIGHTS - nights })
    : !p.sleep ? m("ready.need.sleep")
    : !other ? m("ready.need.checkin") : null;
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
