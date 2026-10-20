// One-pass brain report + the rules brief + merging a validated AI plan onto LOCAL candidates (pure).
import { addDays } from "../date";
import type { State } from "../model";
import { balanceOf, scoreAreas } from "./areas";
import { AREA_LABEL, LOW_DATA_HEADLINE, RULE_COPY, logMoreDays } from "./copy";
import { detectConflicts } from "./conflicts";
import { evalPool, evaluateAll, ruleStats } from "./evaluate";
import { findPatterns } from "./patterns";
import { runRules } from "./rules";
import { extractDays, planDays } from "./signals";
import type { AiPlan, AreaKey, Brain, Brief, BriefItem, Candidate, GapId, Mode, Report } from "./types";

export function brainReport(s: State, today: string, mode: Mode = "brief"): Report {
  const pool = evalPool(s, today); // one signal pass shared by the report and every follow-up evaluation
  const sigs = pool.all!.slice(-28);
  const plan = planDays(s, today, 7);
  const areas = scoreAreas(sigs, s, today);
  const balance = balanceOf(areas, s.settings);
  const conflicts = detectConflicts(sigs, plan, areas, s, today);
  const patterns = findPatterns(sigs);
  const evals = evaluateAll(s, today, pool);
  const stats = ruleStats(s, today, evals);
  const base = { today, mode, sigs, plan, areas, balance, load: plan.map((p) => Math.round(p.load * 100)), conflicts, patterns, evals, ruleStats: stats };
  const candidates = runRules(base, s, today, mode);

  const W = sigs.filter((d) => d.date >= addDays(today, -13));
  const A = (k: AreaKey) => areas.find((a) => a.key === k)!;
  const gaps: GapId[] = [];
  if ((A("sleep").ev.nights ?? 0) < 4) gaps.push("sleep-buttons");
  if (W.filter((d) => d.checkin).length < 4) gaps.push("checkin");
  if ((A("nutrition").ev.weighIns ?? 0) < 4) gaps.push("weigh");
  if ((A("trading").ev.planned ?? 0) >= 3 && !A("trading").ev.tradeDays) gaps.push("trade-log");
  if (W.some((d) => d.sing.planned) && !W.some((d) => d.sing.has)) gaps.push("sing-chip");
  if (W.some((d) => d.game.planned && (d.bedLate ?? 0) > 45 && d.game.over === undefined)) gaps.push("game-chip");
  if (s.settings.job === null) gaps.push("job-status");
  return { ...base, candidates, gaps };
}

const loggedDays = (r: Report) => r.sigs.filter((d) => d.logged && d.date < r.today && d.date >= addDays(r.today, -13)).length;

function headlineOf(r: Report): string {
  const b = r.balance;
  if (b.b === null) { const n = Math.max(0, 3 - loggedDays(r)); return n > 0 ? logMoreDays(n) : LOW_DATA_HEADLINE; }
  const score = (k: AreaKey | null) => r.areas.find((a) => a.key === k)?.score;
  const top = r.candidates.find((c) => c.area === b.weakest) ?? r.candidates[0];
  const good = b.best ? `${AREA_LABEL[b.best]} ${score(b.best)} ดีมาก` : "";
  const weak = b.weakest && b.weakest !== b.best
    ? `${AREA_LABEL[b.weakest]} ${score(b.weakest)}${top ? ` ลอง${RULE_COPY[top.rule].short}ไหม` : " ค่อยๆ ดูแลต่อ"}`
    : top ? `ลอง${RULE_COPY[top.rule].short}ไหม` : "";
  return [good, weak].filter(Boolean).join(" · ") || `สมดุล ${b.b}/100`;
}

export function rulesBrief(r: Report, mode: Mode): Brief {
  return {
    src: "rules", headline: headlineOf(r), summary: "", focus: r.balance.weakest ? [r.balance.weakest] : [], notes: [],
    items: r.candidates.filter((c) => mode === "weekly" || !c.weeklyOnly).slice(0, mode === "brief" ? 2 : 5).map((cand) => ({ cand, variant: 0 })), tips: [], question: "", gaps: r.gaps,
  };
}

// AI picks map to this device's own candidates by id; unknown ids are dropped, nothing new can be introduced.
export function composeBrief(r: Report, ai: AiPlan | null, mode: Mode, brain: Brain, today: string): Brief {
  const rules = rulesBrief(r, mode);
  // Filter before capping so hidden top candidates make room for the next ones.
  const shown = (c: Candidate) => {
    const sn = brain.snooze[c.sig];
    return (mode === "weekly" || !c.weeklyOnly) && sn !== "mute" && !(sn && sn >= today) && !brain.decisions.some((d) => d.d === "a" && d.cid === c.id);
  };
  const cap = mode === "brief" ? 2 : 5;
  const fallback = r.candidates.filter(shown).slice(0, cap).map((cand): BriefItem => ({ cand, variant: 0 }));
  const picks: BriefItem[] = [];
  for (const p of ai?.picks ?? []) {
    const cand = r.candidates.find((c) => c.id === p.id);
    if (!cand || !shown(cand) || picks.some((x) => x.cand.id === cand.id)) continue;
    const variant = Number.isInteger(p.variant) && p.variant >= 0 && p.variant < cand.variants.length ? p.variant : 0;
    picks.push({ cand, variant, ...(p.why ? { aiWhy: p.why } : {}), ...(p.ifThen ? { aiIfThen: p.ifThen } : {}) });
  }
  const items = (picks.length ? picks : fallback).slice(0, cap);
  const usedAi = !!ai && (!!ai.headline || picks.length > 0 || !!ai.summary || ai.areaNotes.length > 0 || ai.tips.length > 0);
  return {
    src: usedAi ? "ai" : "rules",
    headline: ai?.headline || rules.headline,
    summary: mode === "brief" ? "" : ai?.summary ?? "",
    focus: ai?.focus.length ? ai.focus.slice(0, 2) : rules.focus,
    notes: mode === "brief" ? [] : ai?.areaNotes ?? [],
    items,
    tips: (ai?.tips ?? []).slice(0, 3),
    question: ai?.question ?? "",
    gaps: ai ? [...new Set([...r.gaps, ...ai.dataGaps])] : r.gaps,
  };
}

// Cheap areas + balance pass for reminders and the coach summary.
export function brainHeadline(s: State, date: string): { balance: number; weakest: AreaKey | null; label: string } | null {
  const areas = scoreAreas(extractDays(s, date, 28), s, date);
  const b = balanceOf(areas, s.settings);
  if (b.b === null) return null;
  return { balance: b.b, weakest: b.weakest, label: b.weakest ? AREA_LABEL[b.weakest] : "" };
}
