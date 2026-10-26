"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/components/ui";
import { applyOps, compileVariant, isStale, lostOps, shadow, undoOps, type DiffLine } from "./brain/actions";
import { baselineFor } from "./brain/evaluate";
import { brainReport, composeBrief } from "./brain/report";
import { validateAiOutput } from "./brain/schema";
import type { AppliedRec, BrainOp, Candidate, Decision, Mode, Verdict } from "./brain/types";
import { askBrain, getBrain, noKey, readCache, writeCache, type CachedPlan } from "./brain-client";
import { addDays, logicalDate } from "./date";
import type { State } from "./model";
import { play } from "./sound";
import { useStore } from "./store";
import { langObj, msgs, withLang } from "../i18n";
import { useLang } from "../i18n/react";
import * as M from "../i18n/msg/lib-5";
import * as Common from "../i18n/msg/common";

const m = msgs(M), c = msgs(Common);

// State copy (spec 5.8).
type BrainMsgKey = "offline" | "unsynced" | "quota" | "failed" | "nokey" | "off" | "syncAgain" | "noData" | "session";
export const BRAIN_MSG: Readonly<Record<BrainMsgKey, string>> = langObj(() => ({
  offline: m("useBrain.msg.offline"),
  unsynced: m("useBrain.msg.unsynced"),
  quota: m("useBrain.msg.quota"),
  failed: m("useBrain.msg.failed"),
  nokey: m("useBrain.msg.nokey"),
  off: m("useBrain.msg.off"),
  syncAgain: m("useBrain.msg.syncAgain"),
  noData: m("useBrain.msg.noData"),
  session: m("useBrain.msg.session"),
}));
export type AiState = "ok" | "off" | "nokey" | "offline" | "unsynced";
export const PROVIDER_LABEL: Record<string, string> = { gemini: "AI · Gemini", anthropic: "AI · Claude" };
export const RULES_LABEL = m.in("th", "useBrain.rulesLabel"); // legacy th constant (tests)
export const rulesLabel = () => m("useBrain.rulesLabel");

type ApplyResult = { ok: true; id: string } | { ok: false; reason: "stale" | "gone" };
type CandRef = Pick<Candidate, "id" | "sig" | "rule">;
const short = (diff: DiffLine[]) => (diff[0]?.text ?? "") + (diff.length > 1 ? ` (+${diff.length - 1})` : "");
// Newest first; same caps as sanitizeBrain (applied 20, decisions 40, snooze 60 with expired dates dropped first).
function record(x: State, recs: AppliedRec[], decs: Decision[]) {
  x.brain.applied = [...recs, ...x.brain.applied].slice(0, 20);
  x.brain.decisions = [...decs, ...x.brain.decisions].slice(0, 40);
}
const capSnooze = (o: Record<string, string>, today: string) => {
  const live = Object.entries(o).filter(([, v]) => v === "mute" || v >= today);
  return Object.fromEntries([...live.filter(([, v]) => v === "mute"), ...live.filter(([, v]) => v !== "mute")].slice(0, 60));
};

// Brain for one mode: derived report + brief (rules, or a validated AI plan mapped onto LOCAL candidates), and the
// tap-only writes. Nothing here changes the plan without a call from a button.
export function useBrain(mode: Mode) {
  const { s, update, flush, repull, auth, pulled, sync, remoteRev } = useStore();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    const onVis = () => { if (!document.hidden) setNow(new Date()); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  const today = logicalDate(now);
  const lang = useLang();
  const report = useMemo(() => withLang(lang, () => brainReport(s, today, mode)), [s, today, mode, lang]);
  const sRef = useRef(s);
  useEffect(() => { sRef.current = s; }, [s]);

  // AI plan: local cache for this date + mode, else the server's cached plan (fetched once per date).
  const key = `${today}:${mode}:${lang}`;
  const [cache, setCache] = useState<{ key: string; e: CachedPlan | null }>(() => ({ key, e: readCache(today, mode, lang) }));
  if (cache.key !== key) setCache({ key, e: readCache(today, mode, lang) });
  const got = useRef("");
  useEffect(() => {
    if (cache.e || auth.mode !== "server" || !auth.token || !s.settings.brainAi || got.current === key) return;
    got.current = key;
    void getBrain(auth.token, mode).then((r) => {
      if (!r) return;
      const e: CachedPlan = { at: r.at ?? Date.now(), src: "ai", provider: r.provider, plan: r.plan };
      writeCache(today, mode, e, lang);
      setCache((c) => (c.key === key ? { key, e } : c));
    });
  }, [cache.e, auth.mode, auth.token, s.settings.brainAi, key, today, mode, lang]);

  const plan = useMemo(() => (cache.e?.src === "ai" ? validateAiOutput(cache.e.plan, report.candidates, mode, lang) : null), [cache.e, report, mode, lang]);
  const brief = useMemo(() => {
    const b = withLang(lang, () => composeBrief(report, plan, mode, s.brain, today));
    return b.src === "ai" ? { ...b, provider: cache.e?.provider } : b;
  }, [report, plan, mode, s.brain, today, cache.e, lang]);

  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const online = typeof navigator === "undefined" || navigator.onLine;
  const aiState: AiState = !s.settings.brainAi ? "off" : auth.mode !== "server" || noKey.is(today) ? "nokey" : !online ? "offline" : !pulled || sync === "error" ? "unsynced" : "ok";

  const makeRec = (cand: Candidate, vi: number, ops: BrainOp[], at: number): AppliedRec => {
    const spec = cand.evalSpec;
    return { id: "a-" + at.toString(36), cid: cand.id, rule: cand.rule, area: cand.area, at, date: today, actions: cand.variants[vi].actions, ops, eval: spec ? { ...spec, base: baselineFor(s, spec, today).v } : null };
  };

  function undo(id: string, extra?: { outcome?: Verdict }): "ok" | "partial" | "none" {
    const cur = sRef.current;
    const rec = cur.brain.applied.find((r) => r.id === id);
    if (!rec || rec.undoneAt) return "none";
    const partial = undoOps(cur, rec.ops).partial;
    update((x) => {
      const r = x.brain.applied.find((a) => a.id === id);
      if (!r || r.undoneAt) return;
      applyOps(x, undoOps(x, r.ops).inverse);
      r.undoneAt = Date.now();
      if (extra?.outcome) { r.outcome = extra.outcome; r.kept = false; }
    }, { flush: true });
    toast(partial ? m("useBrain.toast.undoPartial") : m("useBrain.toast.undone"));
    return partial ? "partial" : "ok";
  }

  // Re-compile against the current state at tap time; a stale or failed compile never writes anything. seen = JSON of
  // the ops the card showed: a different result at tap time (e.g. a merge moved the plan) is stale too.
  function apply(cid: string, vi: number, seen?: string | null): ApplyResult {
    const cand = report.candidates.find((c) => c.id === cid);
    const v = cand?.variants[vi];
    if (!cand || !v) return { ok: false, reason: "gone" };
    const r = compileVariant(s, v.actions, today, mode);
    if (!r.ok || isStale(s, r.ops) || (seen != null && JSON.stringify(r.ops) !== seen)) { play("error"); return { ok: false, reason: "stale" }; }
    const at = Date.now();
    const rec = makeRec(cand, vi, r.ops, at);
    update((x) => {
      if (isStale(x, r.ops)) return;
      applyOps(x, r.ops);
      record(x, [rec], [{ sig: cand.sig, rule: cand.rule, cid: cand.id, d: "a", at }]);
    }, { flush: true });
    play("done");
    if (r.ops.length) toast(m("useBrain.toast.applied", { diff: short(r.diff) }), { action: c("undo"), ms: 10_000, onAction: () => undo(rec.id) });
    else toast(m("useBrain.toast.noted"));
    return { ok: true, id: rec.id };
  }

  // Weekly "ใช้ทั้งหมด": one update, one record per candidate (each undoable on its own). Each card is compiled
  // against the state it was shown on; one that touches a lever an earlier card already changed is skipped as stale.
  // Like runRules' cooldown and one-experiment-per-area filters, a batch takes one card per rule and one non-safety
  // card per area (list order = ranking, so the top card wins); only cards with an evaluation block others.
  function applyAll(list: { cid: string; variant: number }[]): Record<string, string> {
    const draft = shadow(s);
    const recs: AppliedRec[] = [], decs: Decision[] = [], opsList: BrainOp[][] = [], ids: Record<string, string> = {};
    const rules = new Set<string>(), areas = new Set<string>();
    const at0 = Date.now();
    let stale = 0, wait = 0;
    list.forEach(({ cid, variant }, i) => {
      const cand = report.candidates.find((c) => c.id === cid);
      const v = cand?.variants[variant];
      if (cand && (rules.has(cand.rule) || (!cand.safety && areas.has(cand.area)))) { wait++; return; }
      const r = cand && v ? compileVariant(s, v.actions, today, mode) : null;
      if (!cand || !v || !r?.ok || isStale(draft, r.ops)) { stale++; return; }
      const c = compileVariant(draft, v.actions, today, mode); // cumulative load / order checks
      if (!c.ok || JSON.stringify(c.ops) !== JSON.stringify(r.ops)) { stale++; return; }
      if (cand.evalSpec) { rules.add(cand.rule); areas.add(cand.area); }
      applyOps(draft, r.ops);
      opsList.push(r.ops);
      const rec = makeRec(cand, variant, r.ops, at0 + i);
      recs.unshift(rec);
      decs.unshift({ sig: cand.sig, rule: cand.rule, cid: cand.id, d: "a", at: at0 + i });
      ids[cid] = rec.id;
    });
    if (!recs.length) { play("error"); toast(m("useBrain.toast.planChanged")); return ids; }
    update((x) => {
      const y = shadow(x); // the chain must still match the latest state, else write nothing
      for (const ops of opsList) { if (isStale(y, ops)) return; applyOps(y, ops); }
      for (const ops of opsList) applyOps(x, ops);
      record(x, recs, decs);
    }, { flush: true });
    play("done");
    toast(m("useBrain.toast.appliedAll", { n: recs.length, stale: stale ? m("useBrain.toast.allStale", { n: stale }) : "", wait: wait ? m("useBrain.toast.allWait", { n: wait }) : "" }));
    return ids;
  }

  function keep(id: string, outcome: Verdict) {
    play("done");
    update((x) => { const r = x.brain.applied.find((a) => a.id === id); if (r) { r.kept = true; r.outcome = outcome; } });
  }

  function reject(c: CandRef, reason?: 1 | 2 | 3) {
    const at = Date.now();
    play("tap");
    update((x) => {
      x.brain.snooze = capSnooze({ ...x.brain.snooze, [c.sig]: addDays(today, 7) }, today);
      record(x, [], [{ sig: c.sig, rule: c.rule, cid: c.id, d: "r", ...(reason ? { reason } : {}), at }]);
    });
    toast(m("useBrain.toast.reject"));
  }

  // days: hidden through today + days (0 = back tomorrow). "ไม่เห็นด้วย" counts as a reject (demotes the rule).
  function snooze(c: CandRef, days: number | "mute", reason?: 1 | 2 | 3) {
    if (reason === 2 && days !== "mute") return reject(c, reason);
    const at = Date.now();
    play("tap");
    update((x) => {
      x.brain.snooze = capSnooze({ ...x.brain.snooze, [c.sig]: days === "mute" ? "mute" : addDays(today, days) }, today);
      record(x, [], [{ sig: c.sig, rule: c.rule, d: days === "mute" ? "m" : "s", ...(reason ? { reason } : {}), at }]);
    });
    toast(days === "mute" ? m("useBrain.toast.mute") : days === 0 ? m("useBrain.toast.tomorrow") : m("useBrain.toast.nextWeek"));
  }

  const ack = (cid: string, vi = 0) => apply(cid, vi);

  // Overwrite detection (3.6): only changes that arrived with a server copy (adopt/merge) count, not local edits.
  const [lostIds, setLostIds] = useState<string[]>([]);
  const prev = useRef({ rev: remoteRev, s });
  useEffect(() => {
    const p = prev.current;
    prev.current = { rev: remoteRev, s };
    if (p.rev === remoteRev) return;
    const ids = s.brain.applied.filter((r) => !r.undoneAt && r.ops.length && r.date >= addDays(today, -2) && lostOps(s, r).length > 0 && !lostOps(p.s, r).length).map((r) => r.id);
    if (ids.length) setLostIds((x) => [...new Set([...x, ...ids])]);
  }, [s, remoteRev, today]);
  const lost = useMemo(() => s.brain.applied.filter((r) => lostIds.includes(r.id) && !r.undoneAt && lostOps(s, r).length > 0
    && !s.brain.decisions.some((d) => d.d === "u" && d.sig === r.id)), [s, lostIds]);

  function dismissLost(rec: AppliedRec) {
    play("tap");
    update((x) => record(x, [], [{ sig: rec.id, rule: rec.rule, d: "u", at: Date.now() }]));
  }
  function reapply(rec: AppliedRec): boolean {
    const md: Mode = rec.actions.some((a) => a.k === "set_week_slot") ? "weekly" : mode;
    const r = compileVariant(s, rec.actions, today, md);
    if (!r.ok || !r.ops.length) { play("error"); toast(m("useBrain.toast.reapplyFail")); return false; }
    const at = Date.now();
    const nrec: AppliedRec = { id: "a-" + at.toString(36), cid: rec.cid, rule: rec.rule, area: rec.area, at, date: today, actions: rec.actions, ops: r.ops,
      eval: rec.eval ? { ...rec.eval, base: baselineFor(s, rec.eval, today).v } : null };
    update((x) => { applyOps(x, r.ops); record(x, [nrec], [{ sig: rec.id, rule: rec.rule, d: "u", at }]); }, { flush: true });
    play("done");
    toast(m("useBrain.toast.reapplied", { diff: short(r.diff) }));
    return true;
  }

  // Manual or automatic AI call. Rules stay on screen whatever happens; returns the message shown (null on success).
  async function requestAi(m: Mode = mode): Promise<string | null> {
    const say = (msg: string | null) => { setAiMsg(msg); return msg; };
    if (aiState === "off") return say(BRAIN_MSG.off);
    if (aiState === "nokey") return say(BRAIN_MSG.nokey);
    if (!navigator.onLine) return say(BRAIN_MSG.offline);
    if (!auth.token) return say(BRAIN_MSG.session);
    setAiBusy(true);
    try {
      if (!(await flush())) return say(BRAIN_MSG.unsynced);
      const r = await askBrain(auth.token, m, sRef.current.updatedAt);
      if (r.unauthorized) { auth.dropSession(); return say(BRAIN_MSG.session); }
      if (r.syncFirst) { repull(); return say(BRAIN_MSG.syncAgain); }
      if (typeof r.remaining === "number") setRemaining(r.remaining);
      if (r.src === "ai" && r.plan) {
        const e: CachedPlan = { at: Date.now(), src: "ai", provider: r.provider, plan: r.plan };
        writeCache(today, m, e, lang);
        noKey.clear();
        if (m === mode) setCache({ key, e });
        return say(null);
      }
      if (r.reason === "no-key") { noKey.set(today); return say(BRAIN_MSG.nokey); }
      if (r.reason === "quota" || r.reason === "sub-quota") return say(BRAIN_MSG.quota);
      if (r.reason === "off") return say(BRAIN_MSG.off);
      if (r.reason === "no-data") return say(BRAIN_MSG.noData);
      return say(BRAIN_MSG.failed);
    } finally {
      setAiBusy(false);
    }
  }

  return {
    s, today, now, mode, report, brief, plan, aiAt: cache.e?.at ?? null, evals: report.evals,
    aiState, aiBusy, aiMsg, remaining, requestAi,
    apply, applyAll, undo, keep, snooze, reject, ack, lost, reapply, dismissLost, update,
  };
}
export type BrainApi = ReturnType<typeof useBrain>;
