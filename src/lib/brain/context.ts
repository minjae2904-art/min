// Numbers-only AI context (pure, client-importable: the transparency screen shows exactly this).
// Never included: journal text, trade notes, custom/override titles, user template names (aliased),
// profile name/identity, email, epoch timestamps, push data. Enforced by the sentinel test.
import { hm } from "../date";
import { age, targets } from "../health";
import type { State } from "../model";
import { paceBand, weightStats } from "../stats";
import { compileVariant, describeOps } from "./actions";
import { ITEM_LABEL, templateLabel } from "./copy";
import { AREAS, type Mode, type Report } from "./types";

export const CTX_MAX_BYTES = 6144;

const r2 = (v: number) => Math.round(v * 100) / 100;
const r1 = (v: number) => Math.round(v * 10) / 10;
const nums = (o: Record<string, number | null>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === null ? null : r2(v)]));
const md = (date: string) => date.slice(5);

// Sorted keys at every level, so equal data always hashes the same.
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : stableStringify(x))).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

export const ctxBytes = (ctx: unknown) => new TextEncoder().encode(JSON.stringify(ctx)).length;

export function buildAiContext(r: Report, s: State, today: string, mode: Mode) {
  const brief = mode === "brief";
  const cfg = s.schedule;
  const tl = (key: string) => templateLabel(cfg, key, { canonical: true });
  const custom = new Set(cfg.custom.map((c) => c.id));
  const itemId = (id: string) => (custom.has(id) || !ITEM_LABEL[id] ? "custom" : id);
  const p = s.profile;
  const w = weightStats(s, today);
  const t = targets(p, w.cur, s.settings.kcalAdjust);
  const sigT = r.sigs.find((d) => d.date === today);

  // Brief mode stops at yesterday so ticking items today keeps the hash (and the cached plan) stable.
  const end = brief ? r.sigs.filter((d) => d.date < today) : r.sigs;
  const win = end.slice(-14).filter((d) => d.logged);
  const agg = new Map<string, { done: number; plan: number; dSum: number; dN: number }>();
  for (const d of win) for (const it of d.items) {
    const a = agg.get(itemId(it.id)) ?? { done: 0, plan: 0, dSum: 0, dN: 0 };
    a.plan++;
    if (it.done) a.done++;
    if (it.delay !== null) { a.dSum += it.delay; a.dN++; }
    agg.set(itemId(it.id), a);
  }
  const items14 = [...agg].filter(([, a]) => a.plan >= 2)
    .map(([id, a]) => ({ id, done: a.done, plan: a.plan, delay: a.dN ? Math.round(a.dSum / a.dN) : null }))
    .sort((a, b) => a.done / a.plan - b.done / b.plan).slice(0, 8);
  const logs = win.flatMap((d) => (d.trade.log ? [d.trade.log] : []));
  const trade14 = {
    days: logs.length, plan: win.filter((d) => d.trade.planned).length, atLimit: logs.filter((l) => l.count <= 1).length,
    lossThenMore: logs.filter((l) => l.result === "loss" && l.count > 1).length, skip: logs.filter((l) => l.result === "skip").length,
  };

  const ctx = {
    v: 1, mode, date: today, dow: new Date(today + "T12:00:00").getDay(),
    profile: {
      age: age(p.birth, new Date(today + "T12:00:00")), sex: p.sex, heightCm: p.heightCm, kg: r1(w.cur), goalKg: p.goalKg,
      rate: w.rate === null ? null : r2(w.rate), band: paceBand(w.cur).map(r2), kcal: t.kcal, kcalAdjust: s.settings.kcalAdjust, protein: t.protein,
    },
    life: {
      job: s.settings.job ?? "unknown", wake: sigT ? hm(sigT.plannedWake) : null,
      sleep: sigT && sigT.plannedSleep !== null ? hm(sigT.plannedSleep) : null, shiftMin: cfg.shiftMin,
    },
    balance: {
      b: r.balance.b, wmean: r.balance.wmean === null ? null : Math.round(r.balance.wmean), low2: r.balance.low2 === null ? null : Math.round(r.balance.low2),
      load7: r.load,
      areas: r.areas.map((a) => ({ a: a.key, s: a.score, t: a.target, d: a.trend, c: r2(a.conf), p: a.parts, ev: nums(a.ev) })),
    },
    conflicts: r.conflicts.map((c) => ({
      id: c.id, sev: c.sev, areas: c.areas, ev: nums(c.ev),
      ...(c.tpls?.length ? { tpls: c.tpls.map(tl) } : {}),
      ...(c.dates?.length ? { dates: c.dates.map(md) } : {}),
      ...(c.items?.length ? { items: c.items.map(itemId) } : {}),
    })),
    patterns: r.patterns.map((x) => ({ id: x.id, eff: r2(x.eff), n: x.n ?? [x.nA ?? 0, x.nB ?? 0], conf: x.conf })),
    candidates: r.candidates.slice(0, 8).map((c) => ({
      id: c.id, rule: c.rule, area: c.area, sev: c.sev, prio: r2(c.prio), ev: nums(c.ev),
      ...(c.tips.length ? { tips: c.tips } : {}),
      v: c.variants.map((v, i) => {
        const res = compileVariant(s, v.actions, today, mode);
        const refs = v.actions.flatMap((a) => (a.k === "tip" || a.k === "focus_step" ? [a.ref] : []));
        return {
          i, diff: res.ok ? describeOps(s, res.ops, { canonical: true }).map((l) => [l.label, l.before, l.after]) : [],
          ...(refs.length ? { refs } : {}),
        };
      }),
    })),
    plan7: r.plan.map((d) => ({ d: md(d.date), t: tl(d.tpl), work: d.work, gameH: r1(d.gameMin / 60), streamH: r1(d.streamMin / 60), singMin: d.singMin, mcMin: d.mcMin, gym: d.gym, load: Math.round(d.load * 100), ...(d.classMin ? { classH: r1(d.classMin / 60) } : {}) })),
    today: {
      t: sigT ? tl(sigT.tpl) : null, checkin: sigT?.checkin ? [sigT.checkin.e, sigT.checkin.m, sigT.checkin.sq] : null, voiceRest: !!sigT?.sing.voiceRest,
      ...(!brief && sigT ? { done: sigT.items.filter((i) => i.done).length, total: sigT.items.length } : {}),
    },
    items14, trade14,
    history: r.ruleStats,
    evals: brief ? [] : r.evals.filter((e) => e.status !== "none").map((e) => ({
      rule: e.rule, status: e.status, verdict: e.verdict ?? null, base: e.base === null ? null : r2(e.base), post: e.post === null ? null : r2(e.post), due: e.due,
    })),
    paused: AREAS.filter((a) => s.settings.areaPriority[a] === 0),
    focusAreas: AREAS.filter((a) => s.settings.areaPriority[a] === 2),
    gaps: r.gaps,
  };

  // Hard cap: oldest plan7 rows, then patterns, then candidates down to 6 (then a last-resort trim).
  while (ctxBytes(ctx) > CTX_MAX_BYTES && ctx.plan7.length) ctx.plan7.shift();
  if (ctxBytes(ctx) > CTX_MAX_BYTES) ctx.patterns = [];
  if (ctxBytes(ctx) > CTX_MAX_BYTES) ctx.candidates = ctx.candidates.slice(0, 6);
  while (ctxBytes(ctx) > CTX_MAX_BYTES && (ctx.items14.length || ctx.evals.length || ctx.candidates.length > 2)) {
    if (ctx.evals.length) ctx.evals.pop(); else if (ctx.items14.length) ctx.items14.pop(); else ctx.candidates.pop();
  }
  return ctx;
}

export type AiContext = ReturnType<typeof buildAiContext>;

export const userText = (ctx: AiContext, mode: Mode) => `data: ${JSON.stringify(ctx)}\nงาน: ${mode === "brief" ? "สรุปวันนี้" : "ทบทวนสัปดาห์"}`;
