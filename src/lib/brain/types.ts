// Krob Brain types and id tables. Type-only imports from model/schedule, so model.ts can import this at runtime.
import type { TradeResult } from "../model";
import type { Kind } from "../schedule";

export const AREAS = ["sleep", "nutrition", "training", "voice", "trading", "projects", "leisure", "recovery", "consistency"] as const;
export type AreaKey = (typeof AREAS)[number];
export type Mode = "brief" | "weekly";

export const TIP_IDS = [
  "wake-anchor", "light-after-wake", "last-match", "eye-20-20-20", "stand-60", "protein-split", "shake-400", "kcal-up", "kcal-down",
  "micro-2min", "mvd", "trade-cooloff", "trade-checklist", "trade-review-line", "voice-blocks", "voice-ent", "sing-focus-rotate",
  "sing-before-gym", "mc-one-goal", "deload-explain", "sleep-before-volume", "talk-support", "log-sleep-buttons", "log-checkin", "weigh-daily",
] as const;
export type TipId = (typeof TIP_IDS)[number];
export const GAP_IDS = ["sleep-buttons", "checkin", "weigh", "trade-log", "sing-chip", "game-chip", "job-status"] as const;
export type GapId = (typeof GAP_IDS)[number];
export const MICRO_STEP_IDS = [
  "sleep-anchor", "sleep-anchor-both", "mvd", "sing-2min", "mc-one-goal", "meal-half", "water-bottle", "kcal-up", "kcal-down",
  "log-sleep", "log-weigh", "log-checkin",
] as const;
export type MicroStepId = (typeof MICRO_STEP_IDS)[number];
export const RULE_IDS = ["R01", "R02", "R03", "R04", "R05", "R06", "R07", "R08", "R09", "R10", "R11", "R12", "R13", "R14", "R15", "R16", "R17", "R18", "R19", "R20", "R21", "R22"] as const;
export type RuleId = (typeof RULE_IDS)[number];
export type ConflictId = "C1" | "C2" | "C3" | "C4" | "C5" | "C6" | "C7" | "C8" | "C9" | "C10" | "C11" | "C12" | "C13";
export type PatternId = "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P7" | "P8" | "P9";

// Whitelisted levers. Anything else is rejected before any id check (actions.ts).
export type BrainAction =
  | { k: "move_item"; tpl: string; item: string; delta: number }
  | { k: "reset_time"; tpl: string; item: string }
  | { k: "toggle_item"; tpl: string; item: string; on: boolean }
  | { k: "set_reminder"; tpl: string; item: string; on: boolean }
  | { k: "set_day_template"; date: string; tpl: string }
  | { k: "set_week_slot"; dow: number; tpl: string }
  | { k: "set_voice_rest"; date: string }
  | { k: "set_game_break"; min: 60 | 90 }
  | { k: "set_water_goal"; ml: 0 }
  | { k: "set_water_every"; min: 60 | 90 | 120 }
  | { k: "kcal_adjust"; delta: number }
  | { k: "plan_deload"; from: string; days: 1 | 7 }
  | { k: "set_flag"; key: "notifyLastMatch"; on: true }
  | { k: "focus_step"; area: AreaKey; ref: MicroStepId }
  | { k: "tip"; ref: TipId };
export type ActionKind = BrainAction["k"];

export type SettingKey = "gameBreakMin" | "waterGoalMl" | "waterEveryMin" | "kcalAdjust" | "notifyLastMatch";
// Field-level change with before/after. dayType/voiceRest `created` = the op created the day log;
// an inverted created op (after null / false) deletes the log again only while it is still empty.
export type BrainOp =
  | { t: "override"; key: string; field: "min" | "enabled" | "remind"; before: number | boolean | undefined; after: number | boolean | undefined }
  | { t: "dayType"; date: string; before: string | null; after: string | null; created: boolean }
  | { t: "voiceRest"; date: string; before: boolean; after: boolean; created: boolean }
  | { t: "weekPlan"; dow: number; before: string | null; after: string | null }
  | { t: "setting"; key: SettingKey; before: number | boolean; after: number | boolean }
  | { t: "brain"; key: "deload" | "focus"; before: unknown; after: unknown };

export type EvalSpec = { metric: string; windowDays: number; dir: 1 | -1; min: number };
export type Verdict = "better" | "same" | "worse" | "nodata";
export type AppliedRec = {
  id: string; cid: string; rule: string; area: AreaKey; at: number; date: string;
  actions: BrainAction[]; ops: BrainOp[];
  eval: (EvalSpec & { base: number | null }) | null;
  undoneAt?: number; kept?: boolean; outcome?: Verdict;
};
export type Decision = { sig: string; rule: string; cid?: string; d: "a" | "r" | "s" | "m" | "u"; reason?: 1 | 2 | 3; at: number };
export type Focus = { area: AreaKey; ref: string; from: string; to: string };
export type Deload = { from: string; to: string };
export type Brain = {
  v: 1;
  applied: AppliedRec[]; // cap 20, newest first
  decisions: Decision[]; // cap 40, newest first
  snooze: Record<string, string>; // sig -> "YYYY-MM-DD" | "mute", cap 60
  focus: Focus | null;
  deload: Deload | null;
  weeks: (string | number)[][]; // [weekKey, balance, ...9 scores], -1 = none, cap 12, oldest first
  reviewDone: string;
  reviewFocus: AreaKey | null; // area the weekly review raised to "เน้น" (returned to ปกติ when a new one is picked)
};
export const DEFAULT_BRAIN: Brain = { v: 1, applied: [], decisions: [], snooze: {}, focus: null, deload: null, weeks: [], reviewDone: "", reviewFocus: null };

// One logical day as the engine sees it (signals.ts).
export type SigItem = { id: string; kind: Kind; ring: string; min: number; done: number; delay: number | null; custom: boolean; session: boolean };
export type DaySig = {
  date: string; logged: boolean; tpl: string; base: string; work: boolean;
  score: number | null;
  ring: { food: [number, number]; body: [number, number]; habit: [number, number] };
  items: SigItem[]; // ring items of the day as shown and scored
  plannedWake: number; plannedSleep: number | null;
  sleepH: number | null; bedMin: number | null; wakeMin: number | null; bedLate: number | null; midSleep: number | null;
  gym: { planned: boolean; done: boolean; code: string | null; delay: number | null; ts: number };
  sing: { planned: boolean; done: boolean; voiceRest: boolean; has: boolean; min?: number; strain?: boolean; ts: number };
  mc: { checkPlanned: boolean; checkDone: boolean; buildPlanned: boolean; buildDone: boolean };
  trade: { planned: boolean; log: { count: number; result: TradeResult } | null };
  game: { planned: boolean; plannedMin: number; stopMin: number | null; over?: 0 | 30 | 60 };
  water: { ml: number; goal: number };
  checkin: { e: number; m: number; sq: number } | null;
  core: number | null;
  foodItems: { id: string; min: number; done: number }[];
  restDay: boolean; inDeload: boolean;
};
export type PlanDay = {
  date: string; tpl: string; base: string; work: boolean; load: number; sleepWinH: number;
  gameMin: number; streamMin: number; singMin: number; mcMin: number; gym: 0 | 1; singPlanned: boolean; voiceRest: boolean;
};

export type AreaResult = {
  key: AreaKey; score: number | null; conf: number; target: number; trend: number | null;
  parts: Record<string, number | null>; ev: Record<string, number | null>;
};
export type Balance = {
  b: number | null; wmean: number | null; low2: number | null; spread: number | null;
  weakest: AreaKey | null; best: AreaKey | null; eligible: AreaKey[];
};
export type Conflict = { id: ConflictId; sev: 1 | 2 | 3; areas: AreaKey[]; ev: Record<string, number>; tpls?: string[]; dates?: string[]; items?: string[] };
export type Pattern = { id: PatternId; eff: number; nA?: number; nB?: number; n?: number; mA?: number; mB?: number; conf: "medium" | "high"; text: string };

export type Candidate = {
  id: string; rule: RuleId; area: AreaKey; sev: 1 | 2 | 3; prio: number; sig: string;
  title: string; why: string; ifThen: string; ev: Record<string, number>; tips: TipId[];
  variants: { label: string; actions: BrainAction[] }[];
  evalSpec: EvalSpec | null; weeklyOnly?: boolean; safety?: boolean;
};
export type EvalResult = { id: string; rule: string; status: "none" | "waiting" | "done"; verdict?: Verdict; base: number | null; post: number | null; due: string | null };
export type RuleStats = Record<string, { ap: number; better: number; worse: number; rej: number }>;

export type Report = {
  today: string; mode: Mode; sigs: DaySig[]; plan: PlanDay[]; areas: AreaResult[]; balance: Balance; load: number[];
  conflicts: Conflict[]; patterns: Pattern[]; candidates: Candidate[]; evals: EvalResult[]; ruleStats: RuleStats; gaps: GapId[];
};

// Validated model output (schema in schema.ts, group 2). Picks may only name engine candidate ids.
export type AiPlan = {
  headline: string; summary: string; focus: AreaKey[]; areaNotes: { area: AreaKey; note: string }[];
  picks: { id: string; variant: number; why: string; ifThen: string }[];
  tips: { tip: TipId; why: string }[]; question: string; dataGaps: GapId[];
};
export type BriefItem = { cand: Candidate; variant: number; aiWhy?: string; aiIfThen?: string };
export type Brief = {
  src: "ai" | "rules"; provider?: string; headline: string; summary: string; focus: AreaKey[];
  notes: { area: AreaKey; note: string }[]; items: BriefItem[]; tips: { tip: TipId; why?: string }[]; question: string; gaps: GapId[];
};
