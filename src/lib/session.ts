// v1.7 session engine (pure): Live mode and sing timer runs, silent on-screen cues, the post-live recap and the gym rest timer.
// Every function takes an explicit now (epoch ms); only taps (and the cue auto-hide) call the mutations inside update().
import { langObj, msgs } from "../i18n";
import * as M from "../i18n/msg/lib-12";
import { addDays, hm } from "./date";
import { setDone, setVoiceRest } from "./actions";
import { dayFor, type DayLog, type LiveLog, type Run, type RunKind, type State } from "./model";
import { blockEnd, itemsFor, type Item } from "./schedule";
import { planEpoch } from "./ticks";
import { PRELIVE } from "./care/presets";
import { careIds, rowOf, tickStep } from "./care/progress";

const m = msgs(M);

export type CueKind = "eyes" | "stand" | "water" | "voice" | "sip";
export type Cue = { slot: number; kind: CueKind; atMin: number };
type Preset = { label: string; eyes: boolean; brk: "setting" | number; kinds: CueKind[]; item: (items: Item[]) => Item | undefined };
// Labels and cue texts follow the UI language (langObj); names and types are unchanged.
export const PRESET: Partial<Record<RunKind, Preset>> = langObj<Partial<Record<RunKind, Preset>>>(() => ({
  live: { label: m("session.preset.live"), eyes: true, brk: "setting", kinds: ["stand", "water", "voice"], item: (items) => items.find((i) => i.id === "stream") },
  sing: { label: m("session.preset.sing"), eyes: false, brk: 10, kinds: ["sip"], item: (items) => items.find((i) => i.kind === "sing") },
}));
export const CUE_TEXT: Record<CueKind, string> = langObj(() => ({
  eyes: m("session.cue.eyes"),
  stand: m("session.cue.stand"),
  water: m("session.cue.water"),
  voice: m("session.cue.voice"),
  sip: m("session.cue.sip"),
}));
const MIN = 60_000;
const BREAK_GAP = 5 * MIN;
const preset = (k: RunKind): Preset => PRESET[k] ?? PRESET.live!;
export const runLabel = (k: RunKind) => preset(k).label;
// Mid-sentence noun ("End stream"); th equals runLabel.
export const runNoun = (k: RunKind) => (k === "sing" ? m("session.noun.sing") : m("session.noun.live"));

// Cues up to untilMin elapsed minutes: eyes every 20 min (when on), a break cue every run.b min with rotating kinds
// (b = 0 -> none); an eyes cue within 5 min of a break minute is dropped. The drop is decided from the full break schedule
// (not the list cut at untilMin), so every list is a prefix of every later one and slots stay stable.
export function cueList(run: Run, untilMin: number): Cue[] {
  const p = preset(run.k);
  const brk: { kind: CueKind; atMin: number }[] = [];
  if (run.b > 0) for (let m = run.b, k = 0; m <= untilMin && brk.length < 300; m += run.b, k++) brk.push({ kind: p.kinds[k % p.kinds.length], atMin: m });
  const eyes: { kind: CueKind; atMin: number }[] = [];
  const nearBrk = (m: number) => { const n = run.b > 0 ? Math.round(m / run.b) : 0; return n >= 1 && Math.abs(m - n * run.b) <= 5; };
  if (run.eyes !== false && p.eyes) for (let m = 20; m <= untilMin && eyes.length < 300; m += 20) if (!nearBrk(m)) eyes.push({ kind: "eyes", atMin: m });
  return [...brk, ...eyes].sort((a, b) => a.atMin - b.atMin || (a.kind === "eyes" ? 1 : 0) - (b.kind === "eyes" ? 1 : 0))
    .slice(0, 300).map((c, slot) => ({ ...c, slot }));
}

export const elapsedMs = (run: Run, now: number) => Math.max(0, now - run.at);

// The latest due cue not yet answered; missed = earlier due cues skipped over (counted as seen, not taken).
export function nextCue(run: Run, nowMs: number): { cue: Cue; missed: number } | null {
  const due = cueList(run, Math.floor(elapsedMs(run, nowMs) / MIN)).filter((c) => c.slot >= run.slot);
  return due.length ? { cue: due[due.length - 1], missed: due.length - 1 } : null;
}

const prepIds = (s: State) => {
  const r = s.schedule.care?.find((x) => x.id === "prep");
  return new Set([...PRELIVE.map((x) => x.id), ...(r?.steps.map((x) => x.id) ?? [])]);
};

// Starts a run and ticks its item with the real time. Live writes the pre-live ticks into DayLog.care.prep; a full PRELIVE
// ticks "stream-prep" (a hosted prep routine syncs its own row through tickStep).
export function startRun(x: State, date: string, k: RunKind, now: number, o: { pre?: string[]; eyes?: boolean } = {}) {
  const p = preset(k);
  const b = p.brk === "setting" ? x.settings.gameBreakMin : p.brk;
  x.run = { k, date, at: now, b: Number.isInteger(b) && b >= 0 && b <= 240 ? b : 0, slot: 0, ok: 0, seen: 0, br: 0, eyes: o.eyes ?? p.eyes };
  const items = itemsFor(x.schedule, dayFor(x, date), date);
  const it = p.item(items);
  if (it && !dayFor(x, date).done[it.id]) setDone(x, date, it, true, undefined, { at: now, src: "now" });
  if (k !== "live") return;
  const ok = prepIds(x);
  for (const id of o.pre ?? []) if (ok.has(id)) tickStep(x, date, "prep", id, true);
  if (rowOf(x, date, "prep")) return; // hosted: tickStep already synced the row
  const ids = careIds(dayFor(x, date), "prep");
  const sp = items.find((i) => i.id === "stream-prep");
  if (sp && PRELIVE.every((st) => ids.has(st.id)) && !dayFor(x, date).done[sp.id]) setDone(x, date, sp, true, undefined, { at: now, src: "now" });
}

export const canBreak = (run: Run, now: number) => !run.lb || now - run.lb > BREAK_GAP;

// "พักแล้ว" or a taken stand/voice cue: at most one break per 5 min. Returns whether one was counted.
export function addBreak(x: State, now: number): boolean {
  const run = x.run;
  if (!run || !canBreak(run, now)) return false;
  const d = dayFor(x, run.date);
  d.breaks = (typeof d.breaks === "number" && Number.isFinite(d.breaks) ? d.breaks : 0) + 1;
  x.days[run.date] = d;
  run.br += 1;
  run.lb = now;
  return true;
}

// Answering a cue (or its auto-hide / a silent resume ack). Never logs water: the "+250 ml" button does.
export function ackCue(x: State, cue: Cue, took: boolean, missed: number, now: number) {
  const run = x.run;
  if (!run || cue.slot < run.slot) return;
  run.slot = cue.slot + 1;
  run.seen += 1 + Math.max(0, missed);
  if (took) run.ok += 1;
  if (took && (cue.kind === "stand" || cue.kind === "voice")) addBreak(x, now);
}

export function markClip(x: State, now: number) {
  const run = x.run;
  if (!run) return;
  const m = Math.min(1440, Math.floor(elapsedMs(run, now) / MIN));
  run.mk = [...(run.mk ?? []), m].slice(0, 20);
}

const liveOf = (d: DayLog): LiveLog | undefined => (d.live && typeof d.live === "object" && typeof d.live.min === "number" ? d.live : undefined);
const snapSing = (m: number): 10 | 20 | 30 | 45 => (m >= 40 ? 45 : m >= 25 ? 30 : m >= 15 ? 20 : 10);

// Ends the run: live minutes accumulate into DayLog.live (a second session adds up), sing snaps DayLog.sing.min.
export function endRun(x: State, now: number, endAt?: number): { date: string; k: RunKind; min: number } | null {
  const run = x.run;
  if (!run) return null;
  const end = endAt ?? now;
  const min = Math.max(0, Math.min(960, Math.round((end - run.at) / MIN)));
  const d = dayFor(x, run.date);
  if (run.k === "live") {
    const l = liveOf(d);
    d.live = {
      ...l,
      min: Math.min(1440, (l?.min ?? 0) + min), n: (l?.n ?? 0) + 1, at: l?.at ?? run.at, end: Math.max(l?.end ?? 0, Math.max(end, run.at)),
      ok: (l?.ok ?? 0) + run.ok, seen: (l?.seen ?? 0) + run.seen, br: (l?.br ?? 0) + run.br,
    };
    // A second session the same day appends its marks (each VOD keeps its own timestamps).
    if (run.mk?.length) d.live.mk = [...(l?.mk ?? []), ...run.mk].slice(0, 20);
  } else if (min >= 5) d.sing = { ...d.sing, min: snapSing(min) };
  x.days[run.date] = d;
  x.run = null;
  x.runEnd = run.at; // merge tombstone: a stale copy of this run never comes back
  return { date: run.date, k: run.k, min };
}

// Recap chips. Voice strain feeds sing.strain only when that day's sing item is done (brain strainFree counts sing days).
export function setRecap(x: State, date: string, r: { mood?: 1 | 2 | 3; v?: 0 | 1 | 2; restTomorrow?: boolean }) {
  const d = dayFor(x, date);
  const l = liveOf(d);
  if (l) {
    if (r.mood !== undefined) l.mood = r.mood;
    if (r.v !== undefined) l.v = r.v;
  }
  if ((r.v ?? 0) >= 1) {
    const sing = itemsFor(x.schedule, d, date).find((i) => i.kind === "sing");
    if (sing && d.done[sing.id]) d.sing = { ...d.sing, strain: true };
  }
  x.days[date] = d;
  if (r.restTomorrow) setVoiceRest(x, addDays(date, 1), true);
}

export function recapOf(s: State, date: string) {
  const d = dayFor(s, date);
  const l = liveOf(d);
  const items = itemsFor(s.schedule, d, date);
  const st = items.find((i) => i.id === "stream");
  const stEnd = st ? blockEnd(items, st) : undefined;
  const planMin = st && stEnd !== undefined ? stEnd - st.min : null;
  const overMin = l && stEnd !== undefined && l.end > 0 ? Math.round((l.end - planEpoch(date, stEnd)) / MIN) : null;
  const tmr = addDays(date, 1);
  const clips = itemsFor(s.schedule, dayFor(s, tmr), tmr).find((i) => i.id === "clips");
  const sleep = items.find((i) => i.kind === "sleep");
  return {
    min: l?.min ?? 0, planMin, overMin, ok: l?.ok ?? 0, seen: l?.seen ?? 0, br: l?.br ?? 0, marks: Array.isArray(l?.mk) ? l!.mk! : [],
    clipsAt: clips ? hm(clips.min) : null, sleepAt: sleep ? hm(sleep.min) : null,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");
export const hmClock = (ms: number) => { const m = Math.floor(Math.max(0, ms) / MIN); return `${Math.floor(m / 60)}:${pad(m % 60)}`; };
export const msClock = (sec: number) => { const v = Math.max(0, Math.round(sec)); return `${Math.floor(v / 60)}:${pad(v % 60)}`; };
export const staleRun = (run: Run, today: string, now: number) => run.date < today || now - run.at > 12 * 60 * MIN;

// Planned end of the run's block as an epoch (stream -> stream-end, sing -> min + dur); null when none or not after the start.
export function plannedEndMs(s: State, run: Run): number | null {
  const items = itemsFor(s.schedule, dayFor(s, run.date), run.date);
  const it = preset(run.k).item(items);
  const end = it ? blockEnd(items, it) : undefined;
  if (end === undefined) return null;
  const e = planEpoch(run.date, end);
  return e > run.at ? e : null;
}

// ---- gym rest timer (lives on s.gym.run.rest; the accessory shows it) ----
const clampDur = (v: number) => Math.max(15, Math.min(900, Math.round(v)));
export function startRest(x: State, ex: string, sec: number, now: number) {
  if (!x.gym.run) return;
  const dur = clampDur(sec);
  x.gym.run.rest = { end: now + dur * 1000, ex, dur };
}
export function bumpRest(x: State, deltaSec: number, now: number) {
  const r = x.gym.run?.rest;
  if (!r) return;
  const end = r.end + deltaSec * 1000;
  if (end <= now) { clearRest(x); return; }
  r.end = end;
  r.dur = clampDur(r.dur + deltaSec);
}
export function clearRest(x: State) { if (x.gym.run) delete x.gym.run.rest; }
// Seconds left (0 while "done" for 30 s after the end); null when there is no rest or it ended more than 30 s ago.
export function restLeft(s: State, nowMs: number): number | null {
  const r = s.gym?.run?.rest;
  if (!r) return null;
  const left = (r.end - nowMs) / 1000;
  if (left < -30) return null;
  return Math.max(0, Math.ceil(left));
}
