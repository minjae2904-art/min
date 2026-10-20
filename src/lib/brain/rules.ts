// R01-R22: deterministic candidates built only from whitelisted actions (pure). The AI may rank/explain these,
// never add to them. Every variant is pre-compiled; ids carry no date so server and client agree.
import { addDays } from "../date";
import type { State } from "../model";
import { buildDay, resolveTemplate } from "../schedule";
import { timeBudget } from "../stats";
import { shadow, compileVariant, lastDeload7, MOVABLE } from "./actions";
import { rateAt, weighInsIn } from "./areas";
import { RULE_COPY, VARIANT_LABEL, itemLabel, templateLabel } from "./copy";
import { ruleMult } from "./evaluate";
import { T, fnv1a, lin, mean, round15 } from "./math";
import type { AreaKey, BrainAction, Candidate, Conflict, EvalSpec, Mode, Report, RuleId, TipId } from "./types";

export type RuleInput = Omit<Report, "candidates" | "gaps">;
type V = { label: string; actions: BrainAction[] };
type Draft = Omit<Candidate, "id" | "prio" | "title" | "why" | "ifThen"> & { copy: Record<string, number | string | undefined>; fallback?: V };

const SAFETY: RuleId[] = ["R03", "R18"];
const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const evNum = (ev: Record<string, number | null | undefined>) => Object.fromEntries(Object.entries(ev).filter(([, v]) => fin(v))) as Record<string, number>;
const mostCommon = (xs: string[]) => { const m = new Map<string, number>(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1])[0]?.[0]; };
const dayMs = (date: string) => Date.parse(date + "T12:00:00+07:00");
const tip = (ref: TipId): V => ({ label: "จะลองดู", actions: [{ k: "tip", ref }] });
const halfFull = (tpl: string, item: string, avg: number, cap = 60): V[] => {
  const half = Math.max(15, round15(avg / 2)), full = Math.min(cap, Math.max(15, round15(avg)));
  const v: V[] = [{ label: VARIANT_LABEL[0], actions: [{ k: "move_item", tpl, item, delta: half }] }];
  if (full !== half) v.push({ label: VARIANT_LABEL[2], actions: [{ k: "move_item", tpl, item, delta: full }] });
  return v;
};

export function runRules(r: RuleInput, s: State, today: string, mode: Mode): Candidate[] {
  const cfg = s.schedule, set = s.settings;
  const A = (k: AreaKey) => r.areas.find((a) => a.key === k)!;
  const C = (id: Conflict["id"]) => r.conflicts.find((c) => c.id === id);
  const Wc = r.sigs.filter((d) => d.date >= addDays(today, -13) && d.date < today);
  const W = r.sigs.filter((d) => d.date >= addDays(today, -13));
  const todaySig = r.sigs.find((d) => d.date === today);
  const tl = (t: string) => templateLabel(cfg, t);
  const isWork = (t: string) => resolveTemplate(cfg, t).def.work;
  const remindOff = (t: string, id: string) => cfg.overrides[`${resolveTemplate(cfg, t).key}:${id}`]?.remind === false;
  const singFree = (max: number) => r.plan.slice(0, max + 1).find((p) => p.singPlanned && !p.voiceRest && !(p.date === today && todaySig?.sing.done))?.date;
  const nextGym = () => r.plan.find((p) => p.gym && !(p.date === today && todaySig?.gym.done))?.date;
  const out: Draft[] = [];
  const add = (rule: RuleId, area: AreaKey, sev: 1 | 2 | 3, target: string, ev: Record<string, number | null | undefined>, variants: V[], evalSpec: EvalSpec | null,
    o: { tips?: TipId[]; copy?: Record<string, number | string | undefined>; weeklyOnly?: boolean; safety?: boolean; fallback?: V } = {}) => {
    const e = evNum(ev);
    out.push({ rule, area, sev, sig: `${rule}:${target}`, ev: e, tips: o.tips ?? [], variants, evalSpec, copy: { ...e, ...o.copy }, fallback: o.fallback,
      ...(o.weeklyOnly ? { weeklyOnly: true } : {}), ...(o.safety || SAFETY.includes(rule) ? { safety: true } : {}) });
  };
  const ev = (metric: string, windowDays: number, dir: 1 | -1, min: number): EvalSpec => ({ metric, windowDays, dir, min });

  // R01 last match: earlier game-stop on the implicated templates, or the last-match push
  const c1 = C("C1");
  if (c1) {
    const tpls = (c1.tpls ?? []).filter((t) => { const g = buildDay(t, undefined, cfg, 0).find((i) => i.id === "game-stop"); return g && !g.session; }).slice(0, 2);
    const gb: BrainAction[] = set.gameBreakMin === 0 ? [{ k: "set_game_break", min: 60 }] : [];
    const flag: V[] = set.notifyLastMatch ? [] : [{ label: "แจ้งเตือนแมตช์สุดท้าย", actions: [{ k: "set_flag", key: "notifyLastMatch", on: true }] }];
    for (const t of tpls) {
      add("R01", "leisure", c1.sev, `${t}:game-stop`, c1.ev, [
        { label: VARIANT_LABEL[0], actions: [{ k: "move_item", tpl: t, item: "game-stop", delta: -15 }, ...gb] },
        { label: VARIANT_LABEL[1], actions: [{ k: "move_item", tpl: t, item: "game-stop", delta: -30 }, ...gb] }, ...flag,
      ], ev("leisure.bedLate", 7, -1, 15), { tips: ["last-match"], copy: { tpl: tl(t) } });
    }
    if (!tpls.length && flag.length) add("R01", "leisure", c1.sev, "flag", c1.ev, flag, ev("leisure.bedLate", 7, -1, 15), { tips: ["last-match"] });
  }

  // R02 wake anchor
  const sl = A("sleep");
  if ((sl.ev.wakeSd ?? 0) > 90 && (sl.ev.wakes ?? 0) >= 5) {
    add("R02", "sleep", 2, "sleep-anchor", { wakeSd: sl.ev.wakeSd, wakes: sl.ev.wakes }, [{ label: "ปักโฟกัส", actions: [{ k: "focus_step", area: "sleep", ref: "sleep-anchor" }] }],
      ev("sleep.wakeSd", 14, -1, 20), { tips: ["light-after-wake"] });
  }

  // R03 sleep debt vs gym today (safety)
  const c2 = C("C2");
  if (c2 && todaySig) {
    add("R03", "sleep", 2, "gym", c2.ev, [
      { label: "วันเล่นเบา", actions: [{ k: "plan_deload", from: today, days: 1 }] },
      { label: "เปลี่ยนเป็นวันพัก", actions: [{ k: "set_day_template", date: today, tpl: todaySig.work ? "work-game" : "rest" }] },
    ], ev("sleep.debt", 7, -1, 2), { tips: ["sleep-before-volume"] });
  }

  // R04 social jet lag
  const c6 = C("C6");
  if (c6) add("R04", "sleep", c6.sev, "sleep-anchor-both", c6.ev, [{ label: "ปักโฟกัส", actions: [{ k: "focus_step", area: "sleep", ref: "sleep-anchor-both" }] }], ev("sleep.jetlag", 14, -1, 20), { tips: ["wake-anchor"] });

  // R05 / R06 weight pace two weeks in a row
  const now = rateAt(s, today), wk = rateAt(s, addDays(today, -7));
  const wi = weighInsIn(s, addDays(today, -13), today), kc = set.kcalAdjust ?? 0;
  if (wi >= 5 && now.rate !== null && wk.rate !== null) {
    const pev = { rate: Math.round(now.rate * 100) / 100, lo: Math.round(now.lo * 100) / 100, hi: Math.round(now.hi * 100) / 100, rate7: Math.round(wk.rate * 100) / 100 };
    if (now.rate < now.lo && wk.rate < wk.lo && kc < T.kcalMax) {
      const ds = [...new Set([150, 200, 250].map((d) => Math.floor(Math.min(d, T.kcalMax - kc) / 50) * 50).filter((d) => d > 0))];
      add("R05", "nutrition", 2, "kcal", pev, ds.map((d, i) => ({ label: VARIANT_LABEL[ds.length === 1 ? 1 : i], actions: [{ k: "kcal_adjust", delta: d }, { k: "focus_step", area: "nutrition", ref: "kcal-up" }] })),
        ev("nutrition.rate", 14, -1, 0.05), { tips: ["shake-400"], copy: { c12: C("C12") ? 1 : 0 } });
    }
    if (now.rate > now.hi && wk.rate > wk.hi && kc > T.kcalMin) {
      const d = Math.max(-150, T.kcalMin - kc);
      add("R06", "nutrition", 2, "kcal", pev, [
        { label: VARIANT_LABEL[1], actions: [{ k: "kcal_adjust", delta: d }, { k: "focus_step", area: "nutrition", ref: "kcal-down" }] }, tip("kcal-down"),
      ], ev("nutrition.rate", 14, -1, 0.05), { tips: ["kcal-down"] });
    }
  }

  // R07 worst food item (done rate or lateness)
  type St = { id: string; planned: number; done: number; delays: number[]; tpls: string[] };
  const stats = new Map<string, St>();
  for (const d of Wc) if (d.logged) for (const i of d.items) {
    if ((i.kind !== "meal" && i.kind !== "supp") || i.custom || i.session) continue;
    const st = stats.get(i.id) ?? { id: i.id, planned: 0, done: 0, delays: [], tpls: [] };
    st.planned++; st.tpls.push(d.tpl);
    if (i.done) { st.done++; if (i.delay !== null) st.delays.push(i.delay); }
    stats.set(i.id, st);
  }
  const food = [...stats.values()].map((st) => {
    const tpl = mostCommon(st.tpls)!;
    const avg = mean(st.delays);
    const late = st.delays.length >= 4 && avg !== null && avg > 45;
    const L = buildDay(tpl, undefined, cfg, 0, { all: true });
    const wi2 = L.find((i) => i.id === "work-in")?.min, it = L.find((i) => i.id === st.id);
    const ok = !isWork(tpl) || (wi2 !== undefined && !!it && it.min < wi2);
    return { ...st, tpl, avg, late, rate: st.done / st.planned, ok };
  }).filter((x) => x.planned >= 4 && x.ok && (x.rate < 0.6 || x.late)).sort((a, b) => a.rate - b.rate || (b.avg ?? 0) - (a.avg ?? 0))[0];
  if (food) {
    const copy = { item: itemLabel(cfg, food.tpl, food.id), tpl: tl(food.tpl), mode: food.late && MOVABLE.has(food.id) ? "delay" : "done", delay: food.avg === null ? undefined : Math.round(food.avg) };
    const e = { done: food.done, planned: food.planned, delay: food.avg === null ? null : Math.round(food.avg) };
    if (food.late && MOVABLE.has(food.id)) add("R07", "nutrition", 1, `${food.tpl}:${food.id}`, e, halfFull(food.tpl, food.id, food.avg!), ev(`item.delay:${food.id}`, 7, -1, 15), { copy, tips: ["protein-split"] });
    else if (food.rate < 0.6 && remindOff(food.tpl, food.id)) add("R07", "nutrition", 1, `${food.tpl}:${food.id}`, e, [{ label: "เปิดเตือน", actions: [{ k: "set_reminder", tpl: food.tpl, item: food.id, on: true }] }], ev(`item.done:${food.id}`, 7, 1, 0.15), { copy });
    else add("R07", "nutrition", 1, `${food.tpl}:${food.id}`, e, [{ label: "ปักโฟกัส", actions: [{ k: "focus_step", area: "nutrition", ref: "meal-half" }] }], ev(food.rate < 0.6 ? `item.done:${food.id}` : `item.delay:${food.id}`, 7, food.rate < 0.6 ? 1 : -1, food.rate < 0.6 ? 0.15 : 15), { copy });
  }

  // R08 water
  const lc = Wc.filter((d) => d.logged), met = lc.filter((d) => d.water.ml >= d.water.goal).length;
  if (lc.length >= 5 && met / lc.length < 0.5) {
    const v: V = set.waterGoalMl !== 0 ? { label: "เป้าน้ำอัตโนมัติ", actions: [{ k: "set_water_goal", ml: 0 }] }
      : set.waterEveryMin > 90 ? { label: "เตือนทุก 90 นาที", actions: [{ k: "set_water_every", min: 90 }] }
        : { label: "ปักโฟกัส", actions: [{ k: "focus_step", area: "nutrition", ref: "water-bottle" }] };
    add("R08", "nutrition", 1, "water", { waterMet: met, logged: lc.length }, [v], ev("nutrition.water", 7, 1, 0.15));
  }

  // R09 gym lateness on non-work templates
  const gl = Wc.filter((d) => d.logged && d.gym.done && !d.work && d.gym.delay !== null);
  const gavg = mean(gl.map((d) => d.gym.delay!));
  if (gl.length >= 4 && gavg !== null && gavg > 45) {
    const t = mostCommon(gl.map((d) => d.tpl))!;
    add("R09", "training", 1, `${t}:gym`, { delay: Math.round(gavg), n: gl.length }, halfFull(t, "gym", gavg), ev("item.delay:gym", 7, -1, 15), { copy: { tpl: tl(t) } });
  }

  // R10 meal right before the gym
  const c5 = C("C5");
  if (c5) {
    const t = (c5.tpls ?? []).find((x) => !isWork(x));
    add("R10", "training", 1, `${t ?? "any"}:meal2`, c5.ev, t ? [{ label: "มื้อ 2 เร็วขึ้น 30 นาที", actions: [{ k: "move_item", tpl: t, item: "meal2", delta: -30 }] }] : [],
      ev("area:training", 7, 1, 5), { tips: ["protein-split"], fallback: tip("protein-split") });
  }

  // R11 deload week
  const dl = s.brain.deload;
  if (!(dl && dl.to >= today)) {
    const lastDl = lastDeload7(s);
    const dws = s.workouts.filter((w) => w.code.startsWith("D") && w.date <= today).map((w) => w.date).sort();
    let start = dws.at(-1);
    for (let i = dws.length - 1; i > 0; i--) { if ((dayMs(dws[i]) - dayMs(dws[i - 1])) / 86_400_000 > 14) break; start = dws[i - 1]; }
    const ref = lastDl ?? start;
    const weeks = ref ? (dayMs(today) - dayMs(ref)) / (7 * 86_400_000) : 0;
    const sessions = ref ? dws.filter((d) => (lastDl ? d > ref : d >= ref)).length : 0;
    const rc = A("recovery");
    const lowE = rc.ev.lowE ?? 0;
    const tired = lowE >= 3 && (rc.trend ?? 0) <= -5;
    const g = nextGym();
    if (g && ((weeks >= 5 && sessions >= 12) || tired)) {
      add("R11", "training", 2, "deload", tired ? { lowE } : { weeks: Math.round(weeks * 10) / 10, sessions }, [{ label: "สัปดาห์ deload", actions: [{ k: "plan_deload", from: g, days: 7 }] }],
        ev("recovery.level", 14, 1, 0.3), { tips: ["deload-explain"], copy: tired ? { lowE } : {} });
    }
  }

  // R12 voice rest (safety when strained)
  const c3 = C("C3");
  if (c3) {
    const strainW = W.filter((d) => d.sing.strain === true).length;
    const day = singFree(3);
    add("R12", "voice", 2, "voice-rest", c3.ev, day ? [{ label: "พักเสียง", actions: [{ k: "set_voice_rest", date: day }] }] : [], ev("voice.rhythm", 7, 1, 0.15),
      { tips: strainW >= 2 ? ["voice-blocks", "voice-ent"] : ["voice-blocks"], safety: (c3.ev.strain ?? 0) >= 2, fallback: tip("voice-blocks") });
  }

  // R13 sing after gym
  const c4 = C("C4");
  if (c4) {
    const t = c4.tpls?.[0];
    const hasOv = t !== undefined && cfg.overrides[`${resolveTemplate(cfg, t).key}:sing`]?.min !== undefined;
    add("R13", "voice", 1, `${t ?? "any"}:sing`, c4.ev, hasOv ? [{ label: "คืนเวลาร้องเดิม", actions: [{ k: "reset_time", tpl: t!, item: "sing" }] }] : [],
      ev("area:voice", 7, 1, 5), { tips: ["sing-before-gym"], fallback: tip("sing-before-gym") });
  }

  // R14 singing adherence
  const vo = A("voice");
  if (vo.parts.adh !== null && vo.parts.adh < 50 && (vo.ev.planned ?? 0) >= 4) {
    const sd = Wc.filter((d) => d.logged && d.sing.planned);
    const delays = sd.flatMap((d) => d.items.filter((i) => i.kind === "sing" && i.done && i.delay !== null).map((i) => i.delay!));
    const avg = mean(delays);
    const focus: V = { label: "เริ่ม 2 นาที", actions: [{ k: "focus_step", area: "voice", ref: "sing-2min" }] };
    const t = mostCommon(sd.map((d) => d.tpl));
    const vs: V[] = delays.length >= 3 && avg !== null && avg > 30 && t ? [{ label: "ขยับเวลาร้อง", actions: [{ k: "move_item", tpl: t, item: "sing", delta: Math.min(30, Math.max(15, round15(avg))) }] }, focus] : [focus];
    add("R14", "voice", 1, "sing", { done: vo.ev.done, planned: vo.ev.planned, delay: avg === null ? null : Math.round(avg) }, vs, ev("voice.adh", 7, 1, 0.15), { tips: ["micro-2min"] });
  }

  // R15 / R16 trading discipline (tips only; trades per day can never rise)
  const c8 = C("C8"), c7 = C("C7");
  if (c8) add("R15", "trading", c8.sev, "limit", c8.ev, [tip("trade-checklist")], ev("trading.atLimit", 7, 1, 0.15), { tips: ["trade-checklist"] });
  if (c7) add("R16", "trading", c7.sev, "revenge", c7.ev, [{ label: "จะลองดู", actions: [{ k: "tip", ref: "trade-cooloff" }, { k: "tip", ref: "trade-review-line" }] }], ev("trading.atLimit", 7, 1, 0.15), { tips: ["trade-cooloff", "trade-review-line"] });

  // R17 MC build depth
  const pj = A("projects");
  if (pj.parts.build !== null && pj.parts.build < 40 && (pj.ev.planned ?? 0) >= 3) {
    const vs: V[] = [{ label: "ปักโฟกัส", actions: [{ k: "focus_step", area: "projects", ref: "mc-one-goal" }] }];
    if (mode === "weekly") {
      const dow = set.weekPlan.findIndex((p) => p && resolveTemplate(cfg, p).def.id === "game-max");
      if (dow >= 0) {
        const x = shadow(s); x.settings.weekPlan[dow] = "mc-build";
        if (lin(timeBudget(x, today, 7).game / 60, 0, 8) >= 0.7) vs.push({ label: "สลับเป็นวันลุยเซิฟ", actions: [{ k: "set_week_slot", dow, tpl: "mc-build" }] });
      }
    }
    add("R17", "projects", 1, "build", { done: pj.ev.done, planned: pj.ev.planned }, vs, ev("projects.build", 7, 1, 0.15), { tips: ["mc-one-goal"] });
  }

  // R18 burnout (safety, sev 3)
  const c11 = C("C11");
  if (c11) {
    const tom = r.plan[1];
    const v0: BrainAction[] = [];
    if (tom) {
      if (tom.singPlanned && !tom.voiceRest) v0.push({ k: "set_voice_rest", date: tom.date });
      const tgt = tom.work ? "work-game" : "rest";
      if (tom.tpl !== tgt) v0.push({ k: "set_day_template", date: tom.date, tpl: tgt });
    }
    const g = nextGym();
    const vs: V[] = [...(v0.length ? [{ label: "พรุ่งนี้เบาลง", actions: v0 }] : []), ...(g ? [{ label: "สัปดาห์ deload", actions: [{ k: "plan_deload", from: g, days: 7 } as BrainAction] }] : [])];
    add("R18", "recovery", 3, "burnout", c11.ev, vs, ev("recovery.level", 14, 1, 0.3), { tips: ["talk-support"], fallback: tip("talk-support") });
  }

  // R19 never miss twice
  const c13 = C("C13");
  const miss13 = (c13?.items ?? []).filter((id) => id !== "sleep"); // a missed bedtime press is R22's job
  const item13 = miss13.find((id) => !cfg.custom.some((c) => c.id === id)) ?? miss13[0];
  if (c13 && item13) {
    const t = c13.tpls?.[0] ?? today;
    const item = item13;
    const acts: BrainAction[] = [{ k: "focus_step", area: "consistency", ref: "mvd" }];
    if (item !== "sleep" && remindOff(t, item)) acts.push({ k: "set_reminder", tpl: t, item, on: true });
    add("R19", "consistency", 1, item, c13.ev, [{ label: "วันขั้นต่ำ", actions: acts }], ev("consistency.missTwice", 7, 1, 0.15), { tips: ["mvd"], copy: { item: itemLabel(cfg, t, item) } });
  }

  // R20 overload (weekly)
  const c9 = C("C9");
  if (c9) {
    const pool = r.plan.filter((p) => !p.work);
    const heavy = [...(pool.length ? pool : r.plan)].sort((a, b) => b.load - a.load)[0];
    const vs: V[] = [];
    if (heavy && !heavy.work && heavy.base !== "rest") vs.push({ label: "เปลี่ยนเป็นวันพัก", actions: [{ k: "set_week_slot", dow: new Date(heavy.date + "T12:00:00").getDay(), tpl: "rest" }] });
    if (heavy) {
      const L = buildDay(heavy.tpl, undefined, cfg, 0);
      const offs = ["posture", "persona", "review"].filter((id) => L.some((i) => i.id === id)).map((id): BrainAction => ({ k: "toggle_item", tpl: heavy.tpl, item: id, on: false }));
      if (offs.length) vs.push({ label: "ตัดรายการเสริม", actions: offs });
    }
    add("R20", "recovery", c9.sev, "overload", c9.ev, vs, ev("area:recovery", 14, 1, 5), { weeklyOnly: true });
  }

  // R21 no recovery day (weekly)
  const c10 = C("C10");
  if (c10) {
    const avgDow = (dow: number) => mean(r.sigs.filter((d) => d.logged && d.score !== null && new Date(d.date + "T12:00:00").getDay() === dow).map((d) => d.score!)) ?? 1;
    const cand = r.plan.filter((p) => !p.work && p.base !== "rest").map((p) => ({ dow: new Date(p.date + "T12:00:00").getDay(), a: 0 })).map((x) => ({ ...x, a: avgDow(x.dow) })).sort((a, b) => a.a - b.a)[0];
    const day = singFree(3);
    const vs: V[] = [...(cand ? [{ label: "เพิ่มวันพัก", actions: [{ k: "set_week_slot", dow: cand.dow, tpl: "rest" } as BrainAction] }] : []), ...(day ? [{ label: "พักเสียง", actions: [{ k: "set_voice_rest", date: day } as BrainAction] }] : [])];
    add("R21", "recovery", c10.sev, "rest-day", c10.ev, vs, ev("area:recovery", 14, 1, 5), { weeklyOnly: true });
  }

  // R22 log more (one, fixed low priority)
  const thin = (["sleep", "nutrition", "recovery"] as const).map(A).filter((a) => a.conf < T.conf && (set.areaPriority?.[a.key] ?? 1) !== 0).sort((a, b) => a.conf - b.conf)[0];
  if (thin) {
    const ref = thin.key === "sleep" ? "log-sleep" : thin.key === "nutrition" ? "log-weigh" : "log-checkin";
    add("R22", thin.key, 1, thin.key, { conf: thin.conf }, [{ label: "ปักโฟกัส", actions: [{ k: "focus_step", area: thin.key, ref }] }], null, { copy: { area: thin.key } });
  }

  // Filters (spec order), compile, priority, one per sig, cap.
  const active = s.brain.applied.filter((x) => !x.undoneAt && x.eval && addDays(x.date, x.eval.windowDays) > today);
  const prio = (d: Draft) => {
    if (d.rule === "R22") return 0.2;
    const a = A(d.area);
    const gap = a.score === null ? 0.5 : Math.max(0.1, 1 - a.score / 100);
    const st = r.ruleStats[d.rule];
    return d.sev * gap * a.conf * ((set.areaPriority?.[d.area] ?? 1) === 2 ? T.focusW : 1) * ruleMult(st) * ((st?.rej ?? 0) >= 3 ? 0.3 : 1);
  };
  const res: Candidate[] = [];
  for (const d of out) {
    if (!d.safety && d.rule !== "R22" && A(d.area).conf < T.conf) continue; // thin data: only log-more and safety
    if (!d.safety && (set.areaPriority?.[d.area] ?? 1) === 0) continue;
    const sn = s.brain.snooze[d.sig];
    if (sn === "mute" || (sn && sn >= today)) continue;
    if (active.some((x) => x.rule === d.rule)) continue;
    if (!d.safety && active.some((x) => x.area === d.area)) continue;
    if (d.weeklyOnly && mode === "brief") continue;
    let variants = d.variants.filter((v) => compileVariant(s, v.actions, today, mode).ok);
    if (!variants.length && d.fallback) variants = [d.fallback];
    if (!variants.length) continue;
    const c = RULE_COPY[d.rule];
    const { copy, fallback, ...rest } = d;
    void fallback;
    res.push({ ...rest, variants, id: `${d.rule}:${fnv1a(JSON.stringify(variants.map((v) => v.actions)))}`, prio: Math.round(prio(d) * 1000) / 1000, title: c.title(copy), why: c.why(copy), ifThen: c.ifThen(copy) });
  }
  res.sort((a, b) => Number(!!b.safety) - Number(!!a.safety) || b.prio - a.prio);
  const seen = new Set<string>();
  return res.filter((c) => (seen.has(c.sig) ? false : (seen.add(c.sig), true))).slice(0, T.maxCandidates);
}

