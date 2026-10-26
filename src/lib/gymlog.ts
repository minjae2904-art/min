// v1.7 gym session logging (pure): exercise plans per D-code, set rows prefilled from last time, double-progression hints,
// a compact log (one string per exercise) and the per-exercise / per-code history. State stays small: logs cap at 24.
import { setDone } from "./actions";
import { dayFor, type GymEx, type GymLog, type GymSet, type State } from "./model";
import { GYM_LABEL } from "./rotation";
import { buildDay } from "./schedule";
import { startRest } from "./session";

type Code = "D1" | "D2" | "D3" | "D4";
export const GYM_CODES: Code[] = ["D1", "D2", "D3", "D4"];
const ex = (id: string, name: string, sets: number, lo: number, hi: number, rest: number, step: number, f: { c?: 1; bw?: 1 } = {}): GymEx =>
  ({ id, name, sets, lo, hi, rest, step, ...f });

// Compounds (c) rest 120 s, isolation 60-75 s. Names are plain Thai; no brands, no videos.
export const DEFAULT_PLAN: Record<Code, GymEx[]> = {
  D1: [ex("sq", "บาร์เบลสควอท", 3, 6, 8, 120, 2.5, { c: 1 }), ex("rdl", "โรมาเนียนเดดลิฟต์", 3, 8, 10, 120, 2.5, { c: 1 }), ex("lp", "เลกเพรส", 3, 10, 12, 120, 5, { c: 1 }),
    ex("lc", "เลกเคิร์ล", 3, 10, 12, 75, 2.5), ex("calf", "เขย่งน่อง", 3, 12, 15, 60, 5), ex("ab", "ยกเข่า/ครันช์", 3, 12, 15, 60, 2.5, { bw: 1 })],
  D2: [ex("bp", "เบนช์เพรส", 3, 6, 8, 120, 2.5, { c: 1 }), ex("idb", "อินไคลน์ดัมเบลเพรส", 3, 8, 10, 120, 2, { c: 1 }), ex("fly", "เคเบิลฟลาย/เพคเดค", 3, 10, 12, 75, 2.5),
    ex("dip", "ดิปส์", 3, 8, 12, 90, 2.5, { c: 1, bw: 1 }), ex("tpd", "ไตรเซปส์พุชดาวน์", 3, 10, 12, 60, 2.5), ex("oht", "ไตรเซปส์เหนือศีรษะ", 2, 10, 12, 60, 2.5)],
  D3: [ex("lpd", "แลตพูลดาวน์", 3, 8, 10, 120, 2.5, { c: 1 }), ex("row", "บาร์เบลโรว์", 3, 6, 8, 120, 2.5, { c: 1 }), ex("crow", "ซีทเต็ดเคเบิลโรว์", 3, 10, 12, 90, 2.5, { c: 1 }),
    ex("fp", "เฟซพูล", 2, 12, 15, 60, 2.5), ex("curl", "บาร์เบลเคิร์ล", 3, 8, 10, 75, 2.5), ex("hc", "แฮมเมอร์เคิร์ล", 2, 10, 12, 60, 2)],
  D4: [ex("ohp", "โอเวอร์เฮดเพรส", 3, 6, 8, 120, 2.5, { c: 1 }), ex("lat", "ยกดัมเบลด้านข้าง", 3, 12, 15, 60, 1), ex("rdf", "รีแอร์เดลต์ฟลาย", 3, 12, 15, 60, 1),
    ex("shr", "ชรัก", 2, 10, 12, 60, 2.5)],
};
export const isCode = (c: string): c is Code => (GYM_CODES as string[]).includes(c);
export const planFor = (s: State, code: string): GymEx[] => (isCode(code) ? s.gym.plan[code] ?? DEFAULT_PLAN[code] : []);
export const exById = (s: State, id: string): GymEx | undefined => {
  for (const c of GYM_CODES) { const e = s.gym.plan[c]?.find((x) => x.id === id); if (e) return e; }
  for (const c of GYM_CODES) { const e = DEFAULT_PLAN[c].find((x) => x.id === id); if (e) return e; }
  return undefined;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
export const fmtKg = (n: number) => String(r2(n));
export const enc = (sets: [number, number][]) => sets.slice(0, 6).map(([k, r]) => `${fmtKg(k)}x${r}`).join(",");
export const dec = (str: string): [number, number][] =>
  str.split(",").map((p) => p.split("x").map(Number)).filter((t) => t.length === 2 && t.every(Number.isFinite)).map((t) => [t[0], t[1]] as [number, number]);
export const e1rm = (kg: number, reps: number) => (reps > 0 ? kg * (1 + Math.min(reps, 12) / 30) : 0); // Epley, reps capped at 12
export const setTxt = ([k, r]: [number, number], bw?: boolean) => `${k > 0 || !bw ? fmtKg(k) : "BW"} x ${r}`;
const best = (sets: [number, number][]) => sets.reduce<[number, number] | null>((b, t) => (!b || e1rm(t[0], t[1]) > e1rm(b[0], b[1]) || (e1rm(t[0], t[1]) === e1rm(b[0], b[1]) && t[1] > b[1]) ? t : b), null);
const volOf = (sets: [number, number][]) => sets.reduce((a, [k, r]) => a + k * r, 0);

// Sessions of one exercise before a date, newest first.
function histOf(s: State, exId: string, before: string): { d: string; sets: [number, number][] }[] {
  const out: { d: string; sets: [number, number][] }[] = [];
  for (let i = s.gym.log.length - 1; i >= 0; i--) {
    const l = s.gym.log[i];
    if (l.d >= before) continue;
    const e = l.x.find((x) => x[0] === exId);
    if (e) out.push({ d: l.d, sets: dec(e[1]) });
  }
  return out.sort((a, b) => b.d.localeCompare(a.d));
}
export const lastSets = (s: State, exId: string, before: string): [number, number][] | null => histOf(s, exId, before)[0]?.sets ?? null;
export const pastSessions = (s: State, exId: string, before: string) => histOf(s, exId, before).map((h) => h.sets);

const inDeload = (s: State, date: string) => { const dl = s.brain.deload; return !!dl && dl.from <= date && date <= dl.to; };
function prefill(s: State, e: GymEx, date: string): GymSet[] {
  const n = Math.max(1, Math.min(6, inDeload(s, date) ? Math.ceil(e.sets / 2) : e.sets));
  const last = lastSets(s, e.id, date);
  return Array.from({ length: n }, (_, j): GymSet => {
    const t = last?.length ? last[Math.min(j, last.length - 1)] : null;
    return t ? [t[0], t[1], 0] : [0, e.lo, 0];
  });
}

export function startGym(x: State, date: string, code: string, now: number) {
  if (!isCode(code)) return;
  x.gym.run = { d: date, c: code, at: now, x: planFor(x, code).slice(0, 8).map((e) => ({ id: e.id, s: prefill(x, e, date) })) };
}

const setAt = (x: State, i: number, j: number) => x.gym.run?.x[i]?.s[j];
// kg clamps to 0-500 and rounds to 0.25; reps 0-50 whole.
export function setVal(x: State, i: number, j: number, kg?: number, reps?: number) {
  const t = setAt(x, i, j);
  if (!t) return;
  if (kg !== undefined && Number.isFinite(kg)) t[0] = Math.round(Math.max(0, Math.min(500, kg)) * 4) / 4;
  if (reps !== undefined && Number.isFinite(reps)) t[1] = Math.round(Math.max(0, Math.min(50, reps)));
}
export function tickSet(x: State, i: number, j: number, on: boolean, now: number) {
  const t = setAt(x, i, j);
  if (!t) return;
  t[2] = on ? 1 : 0;
  const id = x.gym.run!.x[i].id;
  if (on) { x.gym.run!.lt = now; startRest(x, id, exById(x, id)?.rest ?? 90, now); }
}
export function addSet(x: State, i: number) {
  const e = x.gym.run?.x[i];
  if (!e || e.s.length >= 6) return;
  const l = e.s[e.s.length - 1];
  e.s.push(l ? [l[0], l[1], 0] : [0, exById(x, e.id)?.lo ?? 8, 0]);
}
export function removeSet(x: State, i: number) {
  const e = x.gym.run?.x[i];
  if (e && e.s.length > 1) e.s.pop();
}
export const extrasOf = (s: State) => { const r = s.gym.run; if (!r) return []; const p = planFor(s, r.c); return r.x.filter((e) => !p.some((q) => q.id === e.id)); };
// Session-only extra exercise (from another day's plan); at most 2 per session, 10 in all.
export function addExercise(x: State, id: string) {
  const r = x.gym.run, e = exById(x, id);
  if (!r || !e || r.x.length >= 10 || r.x.some((q) => q.id === id) || extrasOf(x).length >= 2) return;
  r.x.push({ id, s: prefill(x, e, r.d) });
}
// "ใช้ {kg}": the hint weight on every set not ticked yet.
export function applyHint(x: State, i: number, kg: number) {
  const e = x.gym.run?.x[i];
  if (!e) return;
  e.s.forEach((t, j) => { if (!t[2]) setVal(x, i, j, kg); });
}

export type Hint = { k: "up" | "rep" | "hold" | "down"; text: string; kg?: number };
const roundStep = (v: number, step: number) => r2(Math.round(v / step) * step);
const top = (sets: [number, number][]) => sets.reduce((m, t) => Math.max(m, t[0]), 0);
// Double progression on one session's sets (only reps > 0 count); hist = earlier sessions, newest first.
export function hint(e: GymEx, sets: [number, number][], hist: [number, number][][]): Hint | null {
  const ss = sets.filter((t) => t[1] > 0);
  if (!ss.length) return null;
  const kg = top(ss);
  const kgT = kg > 0 || !e.bw ? `${fmtKg(kg)} kg` : "น้ำหนักตัว";
  if (ss.length >= e.sets && ss.every((t) => t[1] >= e.hi && t[0] === ss[0][0])) {
    if (e.bw && kg === 0) return { k: "up", text: `ครบ ${e.hi} ครั้งทุกเซ็ต · เพิ่มน้ำหนักถ่วง 2.5 kg หรือทำช้าลง` };
    const next = r2(kg + e.step);
    return { k: "up", text: `ครบ ${e.hi} ครั้งทุกเซ็ต · ครั้งหน้าลอง ${fmtKg(next)} kg`, kg: next };
  }
  if (ss.every((t) => t[1] >= e.lo)) return { k: "rep", text: `คงน้ำหนัก ${kgT} · เพิ่มทีละ 1 ครั้งจนครบ ${e.hi}`, kg };
  const last3 = [ss, ...hist.map((h) => h.filter((t) => t[1] > 0))].slice(0, 3);
  if (kg > 0 && last3.length === 3 && last3.every((h) => h.length && top(h) === kg && h.some((t) => t[1] < e.lo))) {
    const down = roundStep(kg * 0.9, e.step);
    return { k: "down", text: `ค้าง 3 ครั้ง · ลองลดเหลือ ${fmtKg(down)} kg แล้วไต่ใหม่`, kg: down };
  }
  return { k: "hold", text: `คงน้ำหนักเดิม ทำให้ครบ ${e.lo} ครั้งก่อน`, kg };
}

export type SummaryEx = { id: string; name: string; top: string; vol: number; reps: number; sets: number; pr: boolean; hint: Hint | null };
export type Summary = { d: string; code: string; label: string; min: number; sets: number; reps: number; vol: number; ex: SummaryEx[]; ticked?: boolean /* finishGym: the day's "gym" item was ticked */ };

export function summaryOf(s: State, log: GymLog): Summary {
  const ex = log.x.map(([id, str]): SummaryEx => {
    const sets = dec(str), e = exById(s, id);
    const hist = pastSessions(s, id, log.d);
    const b = best(sets);
    const bestE = b ? e1rm(b[0], b[1]) : 0;
    const pr = hist.length > 0 && bestE > 0 && hist.every((h) => h.every((t) => e1rm(t[0], t[1]) < bestE));
    return { id, name: e?.name ?? id, top: b ? setTxt(b, !!e?.bw) : "-", vol: volOf(sets), reps: sets.reduce((a, t) => a + t[1], 0), sets: sets.length, pr,
      hint: e ? hint(e, sets, hist) : null };
  });
  return { d: log.d, code: log.c, label: GYM_LABEL[log.c] ?? "", min: log.min, sets: ex.reduce((a, e) => a + e.sets, 0), reps: ex.reduce((a, e) => a + e.reps, 0),
    vol: Math.round(ex.reduce((a, e) => a + e.vol, 0)), ex };
}

// Ends the session. Zero ticked sets -> the run is dropped and null returned (the UI asks first).
// Logs only ticked sets with reps, replaces the same date|code, keeps the newest 24; ticks today's "เข้ายิม" with the start time
// (or upserts workouts on a day without a gym item). The D1-D4 rotation itself is untouched (setDone records the code).
export function finishGym(x: State, now: number): Summary | null {
  const run = x.gym.run;
  if (!run) return null;
  const xs = run.x.map((e) => [e.id, e.s.filter((t) => t[2] === 1 && t[1] > 0).map((t) => [t[0], t[1]] as [number, number])] as const)
    .filter(([, s]) => s.length).slice(0, 10).map(([id, s]): [string, string] => [id, enc(s)]);
  x.gym.run = null;
  x.gym.end = run.at; // merge tombstone: a stale copy of this run never comes back
  if (!xs.length) return null;
  const log: GymLog = { d: run.d, c: run.c, at: run.at, min: Math.max(0, Math.min(300, Math.round((now - run.at) / 60000))), x: xs };
  x.gym.log = [...x.gym.log.filter((l) => !(l.d === log.d && l.c === log.c)), log].sort((a, b) => a.d.localeCompare(b.d) || a.c.localeCompare(b.c)).slice(-24);
  const d = dayFor(x, run.d);
  const item = buildDay(d.type, d.meal2, x.schedule, d.shiftMin ?? 0).find((i) => i.id === "gym");
  if (item) setDone(x, run.d, item, true, run.c, { at: run.at, src: "now" });
  else x.workouts = x.workouts.filter((w) => w.date !== run.d).concat({ date: run.d, code: run.c });
  return { ...summaryOf(x, log), ticked: !!item };
}

export function history(s: State, exId: string, n = 8): { d: string; best: string; top: number; vol: number }[] {
  const bw = !!exById(s, exId)?.bw;
  return histOf(s, exId, "9999-12-31").slice(0, n).map(({ d, sets }) => {
    const b = best(sets);
    return { d, best: b ? setTxt(b, bw) : "-", top: b ? Math.round(e1rm(b[0], b[1]) * 10) / 10 : 0, vol: Math.round(volOf(sets)) };
  });
}

export function volumeTrend(s: State, code: string, n = 8): { d: string; vol: number }[] {
  return s.gym.log.filter((l) => l.c === code).slice(-n).map((l) => ({ d: l.d, vol: Math.round(l.x.reduce((a, [, str]) => a + volOf(dec(str)), 0)) }));
}

// Done / total sets of the running session (Today row sub).
export const runProgress = (s: State) => {
  const r = s.gym.run;
  if (!r) return null;
  const all = r.x.flatMap((e) => e.s);
  return { code: r.c, done: all.filter((t) => t[2] === 1).length, total: all.length };
};
