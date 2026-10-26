// Thai copy for the brain (pure). Invitational tone: "ลอง...ไหม", "ถ้า...แล้ว...". No emoji.
// Canonical labels (static tables, built-in template names) are what the AI context may see; user titles never.
// Round E: every text follows the ambient language (dictionary lib-brain-3); tables are langObj, functions read m() at call time.
import { fill, fmt, getLang, langArr, langObj, msgs } from "../../i18n";
import * as M from "../../i18n/msg/lib-brain-3";
import type { ScheduleCfg } from "../model";
import { microStep } from "../psych";
import { resolveTemplate, type Item } from "../schedule";
import { TEMPLATE_BY_ID } from "../templates";
import type { AreaKey, ConflictId, MicroStepId, PatternId, RuleId, TipId } from "./types";

const m = msgs(M);
const S = (v: unknown) => String(v); // same coercion as the legacy template literals (undefined -> "undefined")

export const AREA_LABEL: Record<AreaKey, string> = langObj(() => ({
  sleep: m("copy.area.sleep"), nutrition: m("copy.area.nutrition"), training: m("copy.area.training"), voice: m("copy.area.voice"),
  trading: m("copy.area.trading"), projects: m("copy.area.projects"), leisure: m("copy.area.leisure"), recovery: m("copy.area.recovery"),
  consistency: m("copy.area.consistency"),
}));
export const STATUS: Record<"good" | "ok" | "low" | "thin", string> = langObj(() => ({
  good: m("copy.status.good"), ok: m("copy.status.ok"), low: m("copy.status.low"), thin: m("copy.status.thin"),
}));
export const statusLabel = (score: number | null, conf: number) =>
  score === null || conf < 0.4 ? STATUS.thin : score >= 75 ? STATUS.good : score >= 50 ? STATUS.ok : STATUS.low;

// Static canonical label for every built-in item id (never the user's override title).
export const ITEM_LABEL: Record<string, string> = langObj(() => ({
  weigh: m("copy.item.weigh"), posture: m("copy.item.posture"), meal1: m("copy.item.meal1"), supp1: "Whey #1 + Creatine", persona: m("copy.item.persona"),
  trade: m("copy.item.trade"), snack: m("copy.item.snack"), "snack-b": m("copy.item.snack-b"), meal2: m("copy.item.meal2"), meal2c: m("copy.item.meal2c"), supp2: "Whey #2",
  gym: m("copy.item.gym"), supp3: m("copy.item.supp3"), meal3: m("copy.item.meal3"), night: "Skincare + Journal", sleep: m("copy.item.sleep"), cardio: m("copy.item.cardio"),
  "mc-check": m("copy.item.mc-check"), mc: m("copy.item.mc"), mc2: m("copy.item.mc2"), sing: m("copy.item.sing"), review: m("copy.item.review"), presleep: m("copy.item.presleep"),
  game: m("copy.item.game"), game1: m("copy.item.game1"), "game-stop": m("copy.item.game-stop"), caf: m("copy.item.caf"), "work-in": m("copy.item.work-in"), "work-out": m("copy.item.work-out"),
  stream: m("copy.item.stream"), "stream-prep": m("copy.item.stream-prep"), clips: m("copy.item.clips"), snack2: m("copy.item.snack2"),
  "r-am": m("copy.item.r-am"), "r-gym": m("copy.item.r-gym"),
}));
export const CUSTOM_LABEL = m.in("th", "copy.custom"); // legacy th constant; display goes through m("copy.custom")
const builtinLabel = (id: string) => ITEM_LABEL[id] ?? (id.startsWith("r-u-") ? m("copy.routine") : undefined);

type LabelOpt = { canonical?: boolean };
// canonical: built-in name, or the built-in it was copied from + " (สำเนา #n)". Otherwise the user's own name.
export function templateLabel(cfg: ScheduleCfg | undefined, id: string, opt: LabelOpt = {}): string {
  const b = TEMPLATE_BY_ID.get(id);
  if (b) return b.name;
  const list = cfg?.templates ?? [];
  const i = list.findIndex((t) => t.id === id);
  const from = i >= 0 ? TEMPLATE_BY_ID.get(list[i].from) : undefined;
  if (from) return opt.canonical ? m("copy.copyOf", { name: from.name, n: i + 1 }) : list[i].name;
  return TEMPLATE_BY_ID.get("off")!.name;
}
export function itemLabel(cfg: ScheduleCfg | undefined, tpl: string, id: string, opt: LabelOpt = {}): string {
  const custom = cfg?.custom.find((c) => c.id === id);
  if (opt.canonical) return custom ? m("copy.custom") : builtinLabel(id) ?? m("copy.itemFallback");
  const title = cfg?.overrides[`${resolveTemplate(cfg, tpl).key}:${id}`]?.title || custom?.title;
  return title || builtinLabel(id) || m("copy.itemFallback");
}

// Day and month names come from the fmt tables (no Intl: identical on every runtime).
export const dowName = (dow: number) => fmt.dowLong(dow);
// "ศุกร์ 24 ต.ค." / "Fri 24 Oct"
export const thaiDate = (date: string) => fmt.dateShort(date);
export const thaiRange = (from: string, to: string) => fmt.range(from, to);

export const CONFLICT_LABEL: Record<ConflictId, string> = langObj(() => ({
  C1: m("copy.conflict.C1"), C2: m("copy.conflict.C2"), C3: m("copy.conflict.C3"), C4: m("copy.conflict.C4"), C5: m("copy.conflict.C5"),
  C6: m("copy.conflict.C6"), C7: m("copy.conflict.C7"), C8: m("copy.conflict.C8"), C9: m("copy.conflict.C9"), C10: m("copy.conflict.C10"),
  C11: m("copy.conflict.C11"), C12: m("copy.conflict.C12"), C13: m("copy.conflict.C13"),
}));

// ev key -> unfilled template with {v} (en may use {v|# day|# days}); evText fills it. Used by the "ทำไม?" disclosure and area sheets.
export const EV_LABEL: Record<string, string> = langObj(() => ({
  avgH: m("copy.ev.avgH"), wakeSd: m("copy.ev.wakeSd"), bedSd: m("copy.ev.bedSd"), debtH: m("copy.ev.debtH"),
  nights: m("copy.ev.nights"), wakes: m("copy.ev.wakes"), sleepH: m("copy.ev.sleepH"), sq: m("copy.ev.sq"),
  rate: m("copy.ev.rate"), lo: m("copy.ev.lo"), hi: m("copy.ev.hi"), weighIns: m("copy.ev.weighIns"),
  kg: m("copy.ev.kg"), waterMet: m("copy.ev.waterMet"), logged: m("copy.ev.logged"),
  planned: m("copy.ev.planned"), done: m("copy.ev.done"), excused: m("copy.ev.excused"), sessions: m("copy.ev.sessions"),
  delay: m("copy.ev.delay"), run: m("copy.ev.run"), strain: m("copy.ev.strain"),
  days: m("copy.ev.days"), of: m("copy.ev.of"), avgLate: m("copy.ev.avgLate"), avgSleepH: m("copy.ev.avgSleepH"),
  tradeDays: m("copy.ev.tradeDays"), one: m("copy.ev.one"), over: m("copy.ev.over"), lossThenMore: m("copy.ev.lossThenMore"),
  gameH: m("copy.ev.gameH"), gameDays: m("copy.ev.gameDays"), m7: m("copy.ev.m7"), base: m("copy.ev.base"),
  burnout: m("copy.ev.burnout"), lowDays: m("copy.ev.lowDays"), checkins: m("copy.ev.checkins"),
  avgScore: m("copy.ev.avgScore"), bad: m("copy.ev.bad"), pairs: m("copy.ev.pairs"),
  sjlMin: m("copy.ev.sjlMin"), minWinH: m("copy.ev.minWinH"), load: m("copy.ev.load"),
}));
export const evText = (key: string, v: number) => fill(getLang(), EV_LABEL[key] ?? `${key} {v}`, { v: Math.round(v * 100) / 100 });

export const TIP_TEXT: Record<TipId, string> = langObj(() => ({
  "wake-anchor": m("copy.tip.wake-anchor"),
  "light-after-wake": m("copy.tip.light-after-wake"),
  "last-match": m("copy.tip.last-match"),
  "eye-20-20-20": m("copy.tip.eye-20-20-20"),
  "stand-60": m("copy.tip.stand-60"),
  "protein-split": m("copy.tip.protein-split"),
  "shake-400": m("copy.tip.shake-400"),
  "kcal-up": m("copy.tip.kcal-up"),
  "kcal-down": m("copy.tip.kcal-down"),
  "micro-2min": m("copy.tip.micro-2min"),
  mvd: m("copy.tip.mvd"),
  "trade-cooloff": m("copy.tip.trade-cooloff"),
  "trade-checklist": m("copy.tip.trade-checklist"),
  "trade-review-line": m("copy.tip.trade-review-line"),
  "voice-blocks": m("copy.tip.voice-blocks"),
  "voice-ent": m("copy.tip.voice-ent"),
  "sing-focus-rotate": m("copy.tip.sing-focus-rotate"),
  "sing-before-gym": m("copy.tip.sing-before-gym"),
  "mc-one-goal": m("copy.tip.mc-one-goal"),
  "deload-explain": m("copy.tip.deload-explain"),
  "sleep-before-volume": m("copy.tip.sleep-before-volume"),
  "talk-support": m("copy.tip.talk-support"),
  "log-sleep-buttons": m("copy.tip.log-sleep-buttons"),
  "log-checkin": m("copy.tip.log-checkin"),
  "weigh-daily": m("copy.tip.weigh-daily"),
  "spf-door": m("copy.tip.spf-door"),
}));

const GENERIC_ITEM: Item = { id: "x", min: 0, title: "", kind: "habit" };
// mvd = minimum viable day: sleep anchor + protein + water + one 2-minute step (psych.microStep).
export const mvdText = (item?: Item) => m("copy.mvd", { step: microStep(item ?? GENERIC_ITEM) });
export const MICRO_STEPS: Record<MicroStepId, string> = langObj(() => ({
  "sleep-anchor": m("copy.micro.sleep-anchor"),
  "sleep-anchor-both": m("copy.micro.sleep-anchor-both"),
  mvd: mvdText(),
  "sing-2min": m("copy.micro.sing-2min"),
  "mc-one-goal": m("copy.micro.mc-one-goal"),
  "meal-half": m("copy.micro.meal-half"),
  "water-bottle": m("copy.micro.water-bottle"),
  "kcal-up": m("copy.micro.kcal-up"),
  "kcal-down": m("copy.micro.kcal-down"),
  "log-sleep": m("copy.micro.log-sleep"),
  "log-weigh": m("copy.micro.log-weigh"),
  "log-checkin": m("copy.micro.log-checkin"),
  "care-min": m("copy.micro.care-min"),
}));

export const VARIANT_LABEL: readonly string[] = langArr(() => [m("copy.variant.0"), m("copy.variant.1"), m("copy.variant.2")]);

// Per-rule deterministic copy from engine numbers. a = ev numbers plus labels (tpl, item, area).
type CA = Record<string, number | string | undefined>;
type RuleCopy = { short: string; title: (a: CA) => string; why: (a: CA) => string; ifThen: (a: CA) => string };
const n1 = (v: unknown) => (typeof v === "number" ? String(Math.round(v * 10) / 10) : String(v ?? "-"));
const n2 = (v: unknown) => (typeof v === "number" ? v.toFixed(2) : String(v ?? "-"));
const delayNote = (a: CA) => (a.delay !== undefined ? m("copy.rule.delay", { delay: n1(a.delay) }) : "");

export const RULE_COPY: Record<RuleId, RuleCopy> = langObj((): Record<RuleId, RuleCopy> => {
  const R22_TITLE: Record<string, string> = { sleep: m("copy.r22.sleep"), nutrition: m("copy.r22.nutrition"), recovery: m("copy.r22.recovery") };
  const R22_IF: Record<string, string> = { sleep: MICRO_STEPS["log-sleep"], nutrition: MICRO_STEPS["log-weigh"], recovery: MICRO_STEPS["log-checkin"] };
  return {
    R01: {
      short: m("copy.rule.R01.short"),
      title: (a) => (a.tpl ? m("copy.rule.R01.title", { tpl: S(a.tpl) }) : m("copy.rule.R01.titleAlt")),
      why: (a) => m("copy.rule.R01.why", { days: S(a.days), of: S(a.of), late: n1(a.avgLate), extra: a.avgSleepH !== undefined ? m("copy.rule.R01.whySleep", { h: n1(a.avgSleepH) }) : "" }),
      ifThen: () => m("copy.rule.R01.ifThen"),
    },
    R02: {
      short: m("copy.rule.R02.short"),
      title: () => m("copy.rule.R02.title"),
      why: (a) => m("copy.rule.R02.why", { sd: n1(a.wakeSd), n: S(a.wakes) }),
      ifThen: () => MICRO_STEPS["sleep-anchor"],
    },
    R03: {
      short: m("copy.rule.R03.short"),
      title: () => m("copy.rule.R03.title"),
      why: (a) => m("copy.rule.R03.why", { why: typeof a.debtH === "number" && a.debtH > 5 ? m("copy.rule.R03.whyDebt", { h: n1(a.debtH) }) : m("copy.rule.R03.whySleep", { h: n1(a.sleepH) }) }),
      ifThen: () => m("copy.rule.R03.ifThen"),
    },
    R04: {
      short: m("copy.rule.R04.short"),
      title: () => m("copy.rule.R04.title"),
      why: (a) => m("copy.rule.R04.why", { min: n1(a.sjlMin) }),
      ifThen: () => MICRO_STEPS["sleep-anchor-both"],
    },
    R05: {
      short: m("copy.rule.R05.short"),
      title: () => m("copy.rule.R05.title"),
      why: (a) => m("copy.rule.R05.why", { rate: n2(a.rate), lo: n2(a.lo), hi: n2(a.hi), extra: a.c12 ? m("copy.rule.R05.whyC12") : "" }),
      ifThen: () => MICRO_STEPS["kcal-up"],
    },
    R06: {
      short: m("copy.rule.R06.short"),
      title: () => m("copy.rule.R06.title"),
      why: (a) => m("copy.rule.R06.why", { rate: n2(a.rate), lo: n2(a.lo), hi: n2(a.hi) }),
      ifThen: () => MICRO_STEPS["kcal-down"],
    },
    R07: {
      short: m("copy.rule.R07.short"),
      title: (a) => (a.mode === "delay" ? m("copy.rule.R07.titleDelay", { item: S(a.item), tpl: S(a.tpl) }) : m("copy.rule.R07.titleEasy", { item: S(a.item) })),
      why: (a) => m("copy.rule.R07.why", { item: S(a.item), done: S(a.done), planned: S(a.planned), extra: delayNote(a) }),
      ifThen: (a) => m("copy.rule.R07.ifThen", { item: S(a.item) }),
    },
    R08: {
      short: m("copy.rule.R08.short"),
      title: () => m("copy.rule.R08.title"),
      why: (a) => m("copy.rule.R08.why", { met: S(a.waterMet), logged: S(a.logged) }),
      ifThen: () => MICRO_STEPS["water-bottle"],
    },
    R09: {
      short: m("copy.rule.R09.short"),
      title: (a) => m("copy.rule.R09.title", { tpl: S(a.tpl) }),
      why: (a) => m("copy.rule.R09.why", { delay: n1(a.delay), n: S(a.n) }),
      ifThen: () => m("copy.rule.R09.ifThen"),
    },
    R10: {
      short: m("copy.rule.R10.short"),
      title: () => m("copy.rule.R10.title"),
      why: (a) => m("copy.rule.R10.why", { days: S(a.days) }),
      ifThen: () => m("copy.rule.R10.ifThen"),
    },
    R11: {
      short: m("copy.rule.R11.short"),
      title: () => m("copy.rule.R11.title"),
      why: (a) => (a.lowE !== undefined ? m("copy.rule.R11.whyLow", { n: S(a.lowE) }) : m("copy.rule.R11.whyWeeks", { weeks: n1(a.weeks), sessions: S(a.sessions) })),
      ifThen: () => m("copy.rule.R11.ifThen"),
    },
    R12: {
      short: m("copy.rule.R12.short"),
      title: () => m("copy.rule.R12.title"),
      why: (a) => (typeof a.run === "number" && a.run >= 7 ? m("copy.rule.R12.whyRun", { run: S(a.run) }) : m("copy.rule.R12.whyStrain", { n: S(a.strain) })),
      ifThen: () => m("copy.rule.R12.ifThen"),
    },
    R13: {
      short: m("copy.rule.R13.short"),
      title: () => m("copy.rule.R13.title"),
      why: (a) => (a.days ? m("copy.rule.R13.whyDays", { days: S(a.days) }) : m("copy.rule.R13.whyPlan")),
      ifThen: () => m("copy.rule.R13.ifThen"),
    },
    R14: {
      short: m("copy.rule.R14.short"),
      title: () => m("copy.rule.R14.title"),
      why: (a) => m("copy.rule.R14.why", { done: S(a.done), planned: S(a.planned), extra: delayNote(a) }),
      ifThen: () => MICRO_STEPS["sing-2min"],
    },
    R15: {
      short: m("copy.rule.R15.short"),
      title: () => m("copy.rule.R15.title"),
      why: (a) => m("copy.rule.R15.why", { one: S(a.one), over: S(a.over) }),
      ifThen: () => m("copy.rule.R15.ifThen"),
    },
    R16: {
      short: m("copy.rule.R16.short"),
      title: () => m("copy.rule.R16.title"),
      why: (a) => m("copy.rule.R16.why", { days: S(a.days) }),
      ifThen: () => m("copy.rule.R16.ifThen"),
    },
    R17: {
      short: m("copy.rule.R17.short"),
      title: () => m("copy.rule.R17.title"),
      why: (a) => m("copy.rule.R17.why", { done: S(a.done), planned: S(a.planned) }),
      ifThen: () => MICRO_STEPS["mc-one-goal"],
    },
    R18: {
      short: m("copy.rule.R18.short"),
      title: () => m("copy.rule.R18.title"),
      why: (a) => m("copy.rule.R18.why", { n: S(a.lowDays), extra: typeof a.debtH === "number" && a.debtH > 5 ? m("copy.rule.R18.whyDebt", { h: n1(a.debtH) }) : "" }),
      ifThen: () => m("copy.rule.R18.ifThen"),
    },
    R19: {
      short: m("copy.rule.R19.short"),
      title: (a) => m("copy.rule.R19.title", { item: S(a.item) }),
      why: (a) => m("copy.rule.R19.why", { item: S(a.item) }),
      ifThen: (a) => m("copy.rule.R19.ifThen", { item: S(a.item) }),
    },
    R20: {
      short: m("copy.rule.R20.short"),
      title: () => m("copy.rule.R20.title"),
      why: (a) => [a.days ? m("copy.rule.R20.whyLoad", { days: S(a.days) }) : "", typeof a.minWinH === "number" && a.minWinH < 7.5 ? m("copy.rule.R20.whyWin", { h: n1(a.minWinH) }) : ""].filter(Boolean).join(" · "),
      ifThen: () => m("copy.rule.R20.ifThen"),
    },
    R21: {
      short: m("copy.rule.R21.short"),
      title: () => m("copy.rule.R21.title"),
      why: (a) => m("copy.rule.R21.why", { sing: S(a.sing), gym: S(a.gym) }),
      ifThen: () => m("copy.rule.R21.ifThen"),
    },
    R22: {
      short: m("copy.rule.R22.short"),
      title: (a) => R22_TITLE[String(a.area)] ?? m("copy.rule.R22.title"),
      why: (a) => m("copy.rule.R22.why", { area: AREA_LABEL[a.area as AreaKey] ?? "" }),
      ifThen: (a) => R22_IF[String(a.area)] ?? MICRO_STEPS["log-checkin"],
    },
    R23: {
      short: m("copy.rule.R23.short"),
      title: () => m("copy.rule.R23.title"),
      why: (a) => m("copy.rule.R23.why", { done: S(a.done), planned: S(a.planned) }),
      ifThen: () => m("copy.rule.R23.ifThen", { step: MICRO_STEPS["care-min"] }),
    },
  };
});

// Hedged pattern copy: correlation only ("มักจะ", "ดูเหมือน").
const pctOf = (v: number | undefined) => `${Math.round((v ?? 0) * 100)}%`;
const r1 = (v: number | undefined) => String(Math.round((v ?? 0) * 10) / 10);
type PA = { eff: number; nA?: number; nB?: number; n?: number; mA?: number; mB?: number };
const cnt = (p: PA) => ({ nA: S(p.nA), nB: S(p.nB) });
const pct = (p: PA) => ({ a: pctOf(p.mA), b: pctOf(p.mB), ...cnt(p) });
const one = (p: PA) => ({ a: r1(p.mA), b: r1(p.mB), ...cnt(p) });
export const PATTERN_TEXT: Record<PatternId, (p: PA) => string> = {
  P1: (p) => m("copy.pattern.P1", { cmp: p.eff > 0 ? m("copy.pattern.P1.more") : m("copy.pattern.P1.less"), ...pct(p) }),
  P2: (p) => m("copy.pattern.P2", { cmp: p.eff > 0 ? m("copy.pattern.P2.better") : m("copy.pattern.P2.lower"), n: S(p.n) }),
  P3: (p) => m("copy.pattern.P3", { cmp: p.eff < 0 ? m("copy.pattern.cmp.lower") : m("copy.pattern.cmp.noLower"), ...one(p) }),
  P4: (p) => m("copy.pattern.P4", { cmp: p.eff > 0 ? m("copy.pattern.P4.later") : m("copy.pattern.P4.onPlan"), a: S(Math.round(p.mA ?? 0)), b: S(Math.round(p.mB ?? 0)), ...cnt(p) }),
  P5: (p) => m("copy.pattern.P5", { cmp: p.eff > 0 ? m("copy.pattern.P5.more") : m("copy.pattern.P5.less"), ...pct(p) }),
  P6: (p) => m("copy.pattern.P6", { cmp: p.eff > 0 ? m("copy.pattern.cmp.better") : m("copy.pattern.cmp.noBetter"), ...one(p) }),
  P7: (p) => m("copy.pattern.P7", { cmp: p.eff > 0 ? m("copy.pattern.cmp.better") : m("copy.pattern.cmp.noBetter"), ...one(p) }),
  P8: (p) => m("copy.pattern.P8", { cmp: p.eff > 0 ? m("copy.pattern.cmp.better") : m("copy.pattern.cmp.same"), ...one(p) }),
  P9: (p) => m("copy.pattern.P9", { cmp: p.eff < 0 ? m("copy.pattern.cmp.lower") : m("copy.pattern.cmp.same"), ...one(p) }),
};

export const LOW_DATA_HEADLINE = m.in("th", "copy.lowData");
export const logMoreDays = (n: number) => m("copy.logMore", { n });
export const EVAL_CAVEAT = m.in("th", "copy.evalCaveat");
export const VERDICT_LABEL: Record<"better" | "same" | "worse" | "nodata" | "waiting", string> = langObj(() => ({
  better: m("copy.verdict.better"), same: m("copy.verdict.same"), worse: m("copy.verdict.worse"), nodata: m("copy.verdict.nodata"), waiting: m("copy.verdict.waiting"),
}));
export const CLIP_SAFE = m.in("th", "copy.clipSafe");
export const CLIP_MOVE = m.in("th", "copy.clipMove");
// Round E accessors (spec 9.3): consumers call these; the legacy constants above stay th for tests.
export const lowDataHeadline = () => m("copy.lowData");
export const evalCaveat = () => m("copy.evalCaveat");
export const clipSafe = () => m("copy.clipSafe");
export const clipMove = () => m("copy.clipMove");
