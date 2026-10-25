// Whitelisted brain levers (pure): compile/validate/clamp -> typed ops, preview lines, apply, undo, stale/lost checks.
// Nothing here runs without a tap; the hook applies ops through store.update.
import { setDayTemplate, setVoiceRest } from "../actions";
import { addDays, hm } from "../date";
import { targets } from "../health";
import { dayFor, plannedType, type DayLog, type ScheduleCfg, type State } from "../model";
import { buildDay, itemsFor, resolveTemplate, templateExists, type Item } from "../schedule";
import { timeBudget, weightStats } from "../stats";
import { AREA_LABEL, CLIP_MOVE, CLIP_SAFE, dowName, itemLabel, templateLabel, thaiDate, thaiRange } from "./copy";
import { DEFAULT_DUR, T, round15 } from "./math";
import { LAST, baseOf, isRestTpl, planDays, plannedWakeOf } from "./signals";
import { isBrainAction } from "./state";
import type { BrainAction, BrainOp, Deload, Focus, Mode, SettingKey } from "./types";

export const MOVABLE = new Set(["sing", "mc", "mc2", "mc-check", "gym", "trade", "meal2", "meal3", "snack", "game-stop", "caf", "presleep"]);
export const TOGGLEABLE = new Set(["posture", "persona", "mc-check", "cardio", "caf", "review"]);
export const CORE = new Set(["weigh", "meal1", "supp1", "meal2", "meal2c", "snack", "meal3", "supp3", "presleep", "night", "sleep", "gym", "trade"]);

export type DiffLine = { label: string; before: string; after: string; text: string };
export type Compiled = { ok: true; ops: BrainOp[]; diff: DiffLine[]; clipped: string[] } | { ok: false; reason: string };
const no = (reason: string): Compiled => ({ ok: false, reason });
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const uniq = <X,>(a: X[]) => [...new Set(a)];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Copy-on-write draft: applyOps replaces (never mutates) nested objects, so `s` is untouched.
export const shadow = (s: State): State => ({
  ...s, days: { ...s.days }, settings: { ...s.settings, weekPlan: [...s.settings.weekPlan] },
  schedule: { ...s.schedule, overrides: { ...s.schedule.overrides } }, brain: { ...s.brain },
});
const keyOf = (cfg: ScheduleCfg, tpl: string, item: string) => `${resolveTemplate(cfg, tpl).key}:${item}`;
const splitKey = (key: string) => { const i = key.indexOf(":"); return [key.slice(0, i), key.slice(i + 1)] as const; };
// The template item with one override field ignored (template default for that field).
function itemWithout(cfg: ScheduleCfg, tpl: string, id: string, field: "min" | "enabled"): Item | undefined {
  const k = keyOf(cfg, tpl, id);
  const o = { ...(cfg.overrides[k] ?? {}) };
  delete o[field];
  return buildDay(tpl, undefined, { ...cfg, overrides: { ...cfg.overrides, [k]: o } }, 0, { all: true }).find((i) => i.id === id);
}
const enabledOf = (cfg: ScheduleCfg, tpl: string, it: Item) => cfg.overrides[keyOf(cfg, tpl, it.id)]?.enabled ?? !it.defaultOff;

// Order invariants (checked only for pairs with the moved item that were valid before: no-regression).
type G = (id: string) => Item | undefined;
const gymEnd = (g: G) => { const x = g("gym"); return x ? x.min + (x.dur ?? 75) : undefined; };
const INV: { ids: string[]; label: string; ok: (g: G, L: Item[]) => boolean | null }[] = [
  { ids: ["weigh", "meal1"], label: "ชั่งน้ำหนักก่อนมื้อแรก", ok: (g) => (g("weigh") && g("meal1") ? g("weigh")!.min < g("meal1")!.min : null) },
  { ids: ["meal2", "gym"], label: "มื้อ 2 ก่อนยิมอย่างน้อย 45 นาที", ok: (g) => (g("meal2") && g("gym") ? g("meal2")!.min + 45 <= g("gym")!.min : null) },
  { ids: ["gym", "sleep"], label: "ยิมจบก่อนนอนอย่างน้อย 1 ชม.", ok: (g) => (g("gym") && g("sleep") ? gymEnd(g)! + 60 <= g("sleep")!.min : null) },
  { ids: ["game", "game-stop"], label: "หยุดเกมแข่งหลังเริ่มเกมอย่างน้อย 1 ชม.", ok: (g) => (g("game") && g("game-stop") ? g("game-stop")!.min >= g("game")!.min + 60 : null) },
  { ids: ["game-stop", "sleep"], label: "หยุดเกมแข่งก่อนนอนอย่างน้อย 1 ชม.", ok: (g) => (g("game-stop") && g("sleep") ? g("game-stop")!.min + 60 <= g("sleep")!.min : null) },
  { ids: ["meal3", "sleep"], label: "มื้อ 3 ก่อนนอน", ok: (g) => (g("meal3") && g("sleep") ? g("meal3")!.min < g("sleep")!.min : null) },
  { ids: ["presleep", "sleep"], label: "โปรตีนก่อนนอนอยู่ก่อนนอน", ok: (g) => (g("presleep") && g("sleep") ? g("presleep")!.min < g("sleep")!.min : null) },
  { ids: ["night", "sleep"], label: "Journal ก่อนนอน", ok: (g) => (g("night") && g("sleep") ? g("night")!.min < g("sleep")!.min : null) },
  { ids: ["sing", "gym"], label: "ไม่ร้องภายใน 1 ชม. หลังยิม", ok: (g) => { const e = gymEnd(g), x = g("sing"); return e === undefined || !x ? null : !(x.min >= e && x.min <= e + 60); } },
  { ids: ["gym", "stream"], label: "ยิมจบก่อนเริ่มไลฟ์อย่างน้อย 1 ชม.", ok: (g) => (g("gym") && g("stream") ? gymEnd(g)! + 60 <= g("stream")!.min : null) },
  { ids: ["meal3", "stream"], label: "มื้อเย็นก่อนเริ่มไลฟ์", ok: (g) => (g("meal3") && g("stream") ? g("meal3")!.min < g("stream")!.min : null) },
  { ids: ["gym", "work-out"], label: "ยิมหลังเลิกงานอย่างน้อย 15 นาที", ok: (g) => (g("gym") && g("work-out") ? g("gym")!.min >= g("work-out")!.min + 15 : null) },
  { ids: ["*"], label: "นอนเป็นรายการสุดท้าย", ok: (_g, L) => sleepLast(L) },
];
function sleepLast(L: Item[]): boolean | null {
  const ring = L.filter((i) => i.ring);
  const sl = ring.find((i) => i.kind === "sleep");
  return sl ? ring.every((i) => i === sl || i.min <= sl.min) : null;
}
function brokenInvariant(before: Item[], after: Item[], moved: string): string | null {
  const gb: G = (id) => before.find((i) => i.id === id), ga: G = (id) => after.find((i) => i.id === id);
  for (const v of INV) if ((v.ids.includes(moved) || v.ids[0] === "*") && v.ok(gb, before) === true && v.ok(ga, after) === false) return `ลำดับเสีย: ${v.label}`;
  return null;
}
const newlyPinned = (before: Item[], after: Item[]) => after.some((i) => i.ring && i.min >= LAST && !before.some((b) => b.id === i.id && b.min >= LAST));

export function compileAction(s: State, a: BrainAction, today: string, mode: Mode): Compiled {
  if (!isBrainAction(a)) return no("ไม่อยู่ในรายการที่ปรับได้");
  const cfg = s.schedule, set = s.settings;
  const ops: BrainOp[] = [], clipped: string[] = [];
  const ok = (): Compiled => ({ ok: true, ops, diff: describeOps(s, ops), clipped });
  const inDays = (date: string, max: number) => DATE.test(date) && date >= today && date <= addDays(today, max);
  switch (a.k) {
    case "move_item": case "reset_time": {
      if (!templateExists(cfg, a.tpl)) return no("ไม่มีเทมเพลตนี้");
      const { key, def } = resolveTemplate(cfg, a.tpl);
      if (!MOVABLE.has(a.item)) return no("ย้ายรายการนี้ไม่ได้");
      const list = buildDay(a.tpl, undefined, cfg, 0, { all: true });
      const it = list.find((i) => i.id === a.item);
      const okey = `${key}:${a.item}`, o = cfg.overrides[okey];
      if (!it || it.custom || it.session || !enabledOf(cfg, a.tpl, it)) return no("ย้ายรายการนี้ไม่ได้");
      const wi = def.work ? list.find((i) => i.id === "work-in") : undefined;
      if (def.work && (!wi || it.min >= wi.min)) return no("รายการช่วงทำงานย้ายไม่ได้");
      let after: number | undefined;
      if (a.k === "move_item") {
        let d = round15(a.delta);
        if (Math.abs(d) > T.moveMax) { d = Math.sign(d) * T.moveMax; clipped.push(CLIP_MOVE); }
        else if (d !== a.delta) clipped.push(CLIP_SAFE);
        if (d === 0) return no("ไม่มีการเปลี่ยนแปลง");
        after = it.min + d;
        if (after < plannedWakeOf(list) + 10 || after > LAST) return no("เวลาใหม่อยู่นอกช่วงของวัน");
        // Pre-shift items must still end before work starts (a +60 snack at 15:30 would land at 16:30, mid-shift).
        if (wi && after + (it.dur ?? DEFAULT_DUR[it.kind] ?? 15) > wi.min) return no("เวลาใหม่ชนเวลาเข้างาน");
        ops.push({ t: "override", key: okey, field: "min", before: o?.min, after });
      } else {
        if (o?.min === undefined) return no("ยังไม่ได้ตั้งเวลาเอง");
        ops.push({ t: "override", key: okey, field: "min", before: o.min, after: undefined });
      }
      const draft = shadow(s);
      applyOps(draft, ops);
      const bL = buildDay(a.tpl, undefined, cfg, 0), aL = buildDay(a.tpl, undefined, draft.schedule, 0);
      if (after !== undefined && aL.find((i) => i.id === a.item)?.min !== after) return no("เวลาใหม่อยู่นอกช่วงของวัน");
      const bad = brokenInvariant(bL, aL, a.item);
      if (bad) return no(bad);
      if (newlyPinned(bL, aL)) return no("เวลาใหม่ชนขอบท้ายวัน");
      return ok();
    }
    case "toggle_item": {
      if (!TOGGLEABLE.has(a.item) || CORE.has(a.item)) return no("เปิด/ปิดรายการนี้ไม่ได้");
      if (!templateExists(cfg, a.tpl)) return no("ไม่มีเทมเพลตนี้");
      const it = itemWithout(cfg, a.tpl, a.item, "enabled");
      if (!it || it.custom) return no("ไม่มีรายการนี้ในเทมเพลต");
      const okey = keyOf(cfg, a.tpl, a.item), o = cfg.overrides[okey];
      if ((o?.enabled ?? !it.defaultOff) === a.on) return no("ไม่มีการเปลี่ยนแปลง");
      ops.push({ t: "override", key: okey, field: "enabled", before: o?.enabled, after: a.on });
      return ok();
    }
    case "set_reminder": {
      if (!templateExists(cfg, a.tpl)) return no("ไม่มีเทมเพลตนี้");
      const it = buildDay(a.tpl, undefined, cfg, 0).find((i) => i.id === a.item);
      if (!it || !it.ring || it.kind === "sleep") return no("ตั้งเตือนรายการนี้ไม่ได้");
      const okey = keyOf(cfg, a.tpl, a.item), o = cfg.overrides[okey];
      if ((o?.remind ?? true) === a.on) return no("ไม่มีการเปลี่ยนแปลง");
      ops.push({ t: "override", key: okey, field: "remind", before: o?.remind, after: a.on });
      return ok();
    }
    case "set_day_template": {
      if (!inDays(a.date, 7)) return no("วันที่อยู่นอกช่วง");
      if (!templateExists(cfg, a.tpl)) return no("ไม่มีเทมเพลตนี้");
      const d = dayFor(s, a.date);
      if (resolveTemplate(cfg, d.type).key === resolveTemplate(cfg, a.tpl).key) return no("เป็นแผนนี้อยู่แล้ว");
      if (a.date === today) {
        const ids = new Set(itemsFor(cfg, { ...d, type: a.tpl }, a.date).map((i) => i.id));
        if (Object.keys(d.done).some((id) => !ids.has(id))) return no("รายการที่ติ๊กแล้วจะหายไป");
      }
      ops.push({ t: "dayType", date: a.date, before: s.days[a.date]?.type ?? null, after: a.tpl, created: !s.days[a.date] });
      return ok();
    }
    case "set_week_slot": {
      if (mode !== "weekly") return no("ปรับแผนสัปดาห์ได้ตอนรีวิวสัปดาห์");
      if (!Number.isInteger(a.dow) || a.dow < 0 || a.dow > 6) return no("วันไม่ถูกต้อง");
      if (!templateExists(cfg, a.tpl)) return no("ไม่มีเทมเพลตนี้");
      const cur = set.weekPlan[a.dow] ?? null;
      if (cur === a.tpl) return no("ไม่มีการเปลี่ยนแปลง");
      const eff = (plan: (string | null)[]) => plan.map((p, i) => (p && templateExists(cfg, p) ? p : set.offWeekdays.includes(i) ? "off" : "work"));
      const fine = (plan: (string | null)[]) => {
        const lists = eff(plan).map((t) => ({ t, L: buildDay(t, undefined, cfg, 0) }));
        const sing = lists.filter((x) => x.L.some((i) => i.kind === "sing")).length;
        return lists.some((x) => !x.L.some((i) => i.id === "gym")) && (sing < 5 || lists.some((x) => isRestTpl(baseOf(s, resolveTemplate(cfg, x.t).key))));
      };
      const next = set.weekPlan.map((p, i) => (i === a.dow ? a.tpl : p));
      if (fine(set.weekPlan) && !fine(next)) return no("จะไม่เหลือวันไม่ยกหรือวันพักในสัปดาห์");
      ops.push({ t: "weekPlan", dow: a.dow, before: cur, after: a.tpl });
      return ok();
    }
    case "set_voice_rest": {
      if (!inDays(a.date, 3)) return no("วันที่อยู่นอกช่วง");
      if (dayFor(s, a.date).voiceRest) return no("พักเสียงอยู่แล้ว");
      ops.push({ t: "voiceRest", date: a.date, before: false, after: true, created: !s.days[a.date] });
      return ok();
    }
    case "set_game_break": {
      if (!(set.gameBreakMin === 0 || set.gameBreakMin > a.min)) return no("ไม่มีการเปลี่ยนแปลง");
      ops.push({ t: "setting", key: "gameBreakMin", before: set.gameBreakMin, after: a.min });
      return ok();
    }
    case "set_water_goal": {
      if (set.waterGoalMl === 0) return no("ไม่มีการเปลี่ยนแปลง");
      ops.push({ t: "setting", key: "waterGoalMl", before: set.waterGoalMl, after: 0 });
      return ok();
    }
    case "set_water_every": {
      if (set.waterEveryMin === a.min) return no("ไม่มีการเปลี่ยนแปลง");
      ops.push({ t: "setting", key: "waterEveryMin", before: set.waterEveryMin, after: a.min });
      return ok();
    }
    case "kcal_adjust": {
      if (a.delta === 0 || Math.abs(a.delta) > T.kcalMaxStep || a.delta % T.kcalStep !== 0) return no("ปรับได้ครั้งละ 50-250 kcal");
      const wi = s.weights.filter((w) => w.date >= addDays(today, -13) && w.date <= today).length;
      if (wi < 5 || weightStats(s, today).rate === null) return no("ชั่งน้ำหนักยังไม่ถึง 5 ครั้งใน 14 วัน");
      const cur = set.kcalAdjust ?? 0;
      const total = Math.max(T.kcalMin, Math.min(T.kcalMax, cur + a.delta));
      if (total !== cur + a.delta) clipped.push(CLIP_SAFE);
      if (total === cur) return no("ถึงขอบเขตที่ปรับได้แล้ว");
      ops.push({ t: "setting", key: "kcalAdjust", before: cur, after: total });
      return ok();
    }
    case "plan_deload": {
      if (!inDays(a.from, 7)) return no("วันที่อยู่นอกช่วง");
      const to = addDays(a.from, a.days - 1), cur = s.brain.deload;
      if (cur && cur.to >= today && (to < cur.to || (a.from >= cur.from && to <= cur.to))) return no("มีช่วง deload อยู่แล้ว");
      if (a.days === 7) {
        const last = lastDeload7(s);
        if (last && addDays(last, 21) > today) return no("deload ครั้งก่อนเพิ่งจบไม่ถึง 21 วัน");
      }
      const after: Deload = { from: a.from, to };
      if (same(cur, after)) return no("ไม่มีการเปลี่ยนแปลง");
      ops.push({ t: "brain", key: "deload", before: cur, after });
      return ok();
    }
    case "set_flag": {
      if (set.notifyLastMatch) return no("เปิดอยู่แล้ว");
      ops.push({ t: "setting", key: "notifyLastMatch", before: false, after: true });
      return ok();
    }
    case "focus_step": {
      const after: Focus = { area: a.area, ref: a.ref, from: today, to: addDays(today, 6) };
      const cur = s.brain.focus;
      if (cur && cur.area === a.area && cur.ref === a.ref && cur.to >= today) return no("ปักไว้อยู่แล้ว");
      ops.push({ t: "brain", key: "focus", before: cur, after });
      return ok();
    }
    case "tip": return ok();
  }
}

// End date of the last 7-day deload: applied records (capped at 20), else the deload slot when it is a full week.
export function lastDeload7(s: State): string | undefined {
  const dl = s.brain.deload;
  return [...s.brain.applied.filter((r) => !r.undoneAt).flatMap((r) => r.actions)
    .flatMap((x) => (x.k === "plan_deload" && x.days === 7 ? [addDays(x.from, 6)] : [])),
  ...(dl && addDays(dl.from, 6) === dl.to ? [dl.to] : [])].sort().at(-1);
}

// Compile actions in order on a draft (each sees the previous ops), then the global sanity checks.
export function compileVariant(s: State, actions: BrainAction[], today: string, mode: Mode): Compiled {
  if (!actions.length) return no("ว่าง");
  if (actions.filter((a) => a?.k === "set_week_slot").length > 2) return no("เปลี่ยนแผนสัปดาห์ได้ไม่เกิน 2 วันต่อครั้ง");
  const draft = shadow(s);
  const ops: BrainOp[] = [], diff: DiffLine[] = [], clipped: string[] = [];
  for (const a of actions) {
    const r = compileAction(draft, a, today, mode);
    if (!r.ok) return r;
    applyOps(draft, r.ops);
    ops.push(...r.ops); diff.push(...r.diff); clipped.push(...r.clipped);
  }
  const tkeys = uniq(ops.flatMap((o) => (o.t === "override" ? [splitKey(o.key)[0]] : o.t === "dayType" && o.after ? [o.after] : o.t === "weekPlan" && o.after ? [o.after] : [])));
  for (const t of tkeys) {
    const bL = buildDay(t, undefined, s.schedule, 0), aL = buildDay(t, undefined, draft.schedule, 0);
    if (sleepLast(bL) === true && sleepLast(aL) === false) return no("ลำดับเสีย: นอนเป็นรายการสุดท้าย");
    if (newlyPinned(bL, aL)) return no("เวลาใหม่ชนขอบท้ายวัน");
  }
  if (ops.some((o) => o.t === "override" || o.t === "dayType" || o.t === "weekPlan" || o.t === "voiceRest")) {
    const pb = planDays(s, today, 8), pa = planDays(draft, today, 8);
    if (pa.some((p, i) => !p.work && p.load > T.loadMax && p.load > pb[i].load + 1e-9)) return no("แผนวันนั้นจะแน่นเกินไป");
  }
  return { ok: true, ops, diff, clipped: uniq(clipped) };
}

export function readOp(x: State, op: BrainOp): unknown {
  switch (op.t) {
    case "override": return x.schedule.overrides[op.key]?.[op.field];
    case "dayType": return x.days[op.date]?.type ?? null;
    case "voiceRest": return !!x.days[op.date]?.voiceRest;
    case "weekPlan": return x.settings.weekPlan[op.dow] ?? null;
    case "setting": return x.settings[op.key];
    case "brain": return x.brain[op.key];
  }
}

// A day log holds nothing but what the brain created (`ignore` = the field the op itself set).
function isEmptyLog(x: State, date: string, d: DayLog, ignore: "type" | "voiceRest"): boolean {
  const e = d as DayLog & { gameOver?: unknown; sing?: unknown };
  return !Object.keys(d.done ?? {}).length && !d.waterMl && !d.checkin && !d.journal && !d.trade && !d.wakeAt && !d.sleepAt
    && e.gameOver === undefined && !e.sing && !d.meal2 && !d.shiftMin && d.dndBefore === undefined && !d.moved && !d.skip
    && (ignore === "voiceRest" || !d.voiceRest) && (ignore === "type" || d.type === plannedType(x, date));
}

export function applyOps(x: State, ops: BrainOp[]) {
  for (const op of ops) {
    switch (op.t) {
      case "override": {
        const o: Record<string, unknown> = { ...(x.schedule.overrides[op.key] ?? {}) };
        if (op.after === undefined) delete o[op.field]; else o[op.field] = op.after;
        if (Object.keys(o).length) x.schedule.overrides[op.key] = o; else delete x.schedule.overrides[op.key];
        break;
      }
      case "dayType": {
        const cur = x.days[op.date];
        if (op.after === null) {
          if (cur) { if (isEmptyLog(x, op.date, cur, "type")) delete x.days[op.date]; else x.days[op.date] = { ...cur, type: plannedType(x, op.date) }; }
        } else { if (cur) x.days[op.date] = { ...cur }; setDayTemplate(x, op.date, op.after); }
        break;
      }
      case "voiceRest": {
        const cur = x.days[op.date];
        if (!op.after) {
          if (!cur) break;
          if (op.created && isEmptyLog(x, op.date, cur, "voiceRest")) { delete x.days[op.date]; break; }
          const c = { ...cur }; delete c.voiceRest; x.days[op.date] = c;
        } else { if (cur) x.days[op.date] = { ...cur }; setVoiceRest(x, op.date, true); }
        break;
      }
      case "weekPlan": x.settings.weekPlan[op.dow] = op.after; break;
      case "setting": (x.settings as Record<SettingKey, number | boolean>)[op.key] = op.after; break;
      case "brain": x.brain = { ...x.brain, [op.key]: op.after == null ? null : structuredClone(op.after) }; break;
    }
  }
}

export const invertOps = (ops: BrainOp[]): BrainOp[] => [...ops].reverse().map((op) => ({ ...op, before: op.after, after: op.before }) as BrainOp);

// Plan changed since the ops were computed (simulated in order, so chained ops on one day compare correctly).
export function isStale(s: State, ops: BrainOp[]): boolean {
  const x = shadow(s);
  for (const op of ops) { if (!same(readOp(x, op), op.before)) return true; applyOps(x, [op]); }
  return false;
}
// Undo only ops whose value is still what the brain set; partial = something was edited afterwards.
export function undoOps(s: State, ops: BrainOp[]): { inverse: BrainOp[]; partial: boolean } {
  const keep = ops.filter((op) => same(readOp(s, op), op.after));
  return { inverse: invertOps(keep), partial: keep.length < ops.length };
}
export const undoable = (s: State, ops: BrainOp[]) => ops.map((op) => same(readOp(s, op), op.after));
// Ops overwritten since apply (e.g. another device's settings/schedule won the merge).
export const lostOps = (s: State, rec: { ops: BrainOp[] }) => rec.ops.filter((op) => !same(readOp(s, op), op.after));

const fmtN = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const onOff = (v: unknown) => (v ? "เปิด" : "ปิด");
const line = (label: string, before: string, after: string, colon = true): DiffLine =>
  ({ label, before, after, text: before ? `${label}${colon ? ":" : ""} ${before} -> ${after}` : `${label}: ${after}` });

// Thai "before -> after" lines. canonical = labels safe for the AI context (no user titles or names).
export function describeOps(s: State, ops: BrainOp[], opt: { canonical?: boolean } = {}): DiffLine[] {
  const cfg = s.schedule;
  const tl = (id: string) => templateLabel(cfg, id, opt);
  return ops.map((op) => {
    switch (op.t) {
      case "override": {
        const [tk, item] = splitKey(op.key);
        const label = `${tl(tk)} · ${itemLabel(cfg, tk, item, opt)}`;
        if (op.field === "min") {
          const def = itemWithout(cfg, tk, item, "min")?.min ?? 0;
          return line(label, hm((op.before as number | undefined) ?? def), hm((op.after as number | undefined) ?? def), false);
        }
        if (op.field === "enabled") {
          const it = itemWithout(cfg, tk, item, "enabled");
          const d = !it?.defaultOff;
          return line(label, onOff(op.before ?? d), onOff(op.after ?? d), false);
        }
        return line(`${label} · เตือน`, onOff(op.before ?? true), onOff(op.after ?? true), false);
      }
      case "dayType": {
        const p = plannedType(s, op.date);
        return line(`แผนวัน${thaiDate(op.date)}`, tl(op.before ?? p), tl(op.after ?? p));
      }
      case "voiceRest": return line(op.after ? "พักเสียง" : "เลิกพักเสียง", "", thaiDate(op.date));
      case "weekPlan": return line(`แผนสัปดาห์ วัน${dowName(op.dow)}`, op.before ? tl(op.before) : "ตามค่าเริ่ม", op.after ? tl(op.after) : "ตามค่าเริ่ม");
      case "setting": {
        if (op.key === "kcalAdjust") {
          const kg = weightStats(s, "9999-12-31").cur;
          return line("เป้าแคลอรี่", fmtN(targets(s.profile, kg, op.before as number).kcal), `${fmtN(targets(s.profile, kg, op.after as number).kcal)} kcal`);
        }
        if (op.key === "gameBreakMin") { const f = (v: unknown) => (v ? `ทุก ${v} นาที` : "ปิด"); return line("เตือนพักระหว่างเกม", f(op.before), f(op.after)); }
        if (op.key === "waterGoalMl") { const f = (v: unknown) => (v ? `${fmtN(v as number)} ml` : "อัตโนมัติ"); return line("เป้าน้ำ", f(op.before), f(op.after)); }
        if (op.key === "waterEveryMin") return line("เตือนดื่มน้ำ", `ทุก ${op.before} นาที`, `ทุก ${op.after} นาที`);
        return line("แจ้งเตือนแมตช์สุดท้าย", onOff(op.before), onOff(op.after));
      }
      case "brain": {
        if (op.key === "deload") {
          const f = (v: unknown) => { const d = v as Deload | null; return d ? (d.from === d.to ? thaiDate(d.from) : thaiRange(d.from, d.to)) : ""; };
          const d = (op.after ?? op.before) as Deload | null;
          return line(d && d.from === d.to ? "วันเล่นเบา" : "สัปดาห์ deload", f(op.before), f(op.after) || "ยกเลิก");
        }
        const f = (v: unknown) => { const x = v as Focus | null; return x ? AREA_LABEL[x.area] ?? "" : ""; };
        return line("โฟกัสสัปดาห์นี้", f(op.before), f(op.after) || "ยกเลิก");
      }
    }
  });
}

// Side effect on the planned 7-day time budget, non-zero parts only ("เกม -0.5 ชม. · ร้อง +30 น. · ยิม 4 -> 3").
export function budgetDelta(s: State, ops: BrainOp[], today: string): string {
  const x = shadow(s);
  applyOps(x, ops);
  const a = timeBudget(s, today, 7), b = timeBudget(x, today, 7);
  const sg = (n: number) => (n > 0 ? `+${n}` : String(n));
  const out: string[] = [];
  if (b.game !== a.game) out.push(`เกม ${sg(Math.round((b.game - a.game) / 6) / 10)} ชม.`);
  if (b.sing !== a.sing) out.push(`ร้อง ${sg(b.sing - a.sing)} น.`);
  if (b.mc !== a.mc) out.push(`เซิฟ ${sg(b.mc - a.mc)} น.`);
  if (b.gym !== a.gym) out.push(`ยิม ${a.gym} -> ${b.gym}`);
  if (b.cardio !== a.cardio) out.push(`คาร์ดิโอ ${a.cardio} -> ${b.cardio}`);
  if (b.trade !== a.trade) out.push(`เทรด ${a.trade} -> ${b.trade} วัน`);
  return out.join(" · ");
}
