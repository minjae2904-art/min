"use client";

import { useState } from "react";
import { fmt, langArr, msgs } from "@/i18n";
import { rich, useLang } from "@/i18n/react";
import { careCheckText, careTaskText } from "@/i18n/stored";
import * as C from "@/i18n/msg/components-brain";
import { Sparkline } from "@/components/Charts";
import { describeOps } from "@/lib/brain/actions";
import { AREA_LABEL, RULE_COPY, VERDICT_LABEL, evalCaveat, templateLabel, thaiDate } from "@/lib/brain/copy";
import { pickReviewFocus, weekKey } from "@/lib/brain/review";
import { AREAS, type AreaKey, type BriefItem } from "@/lib/brain/types";
import { checkNext, shopList } from "@/lib/care/body";
import { dueTasks } from "@/lib/care/progress";
import type { State } from "@/lib/model";
import { play } from "@/lib/sound";
import { BRAIN_MSG, useBrain } from "@/lib/useBrain";
import { Sheet } from "../ui";
import { TasksSheet } from "../care/TasksSheet";
import { ArrowDiff, ProposalCard } from "./ProposalCard";

const m = msgs(C);
const STEPS = langArr(() => [m("weeklyReview.step.0"), m("weeklyReview.step.1"), m("weeklyReview.step.2"), m("weeklyReview.step.3")]);
const sgn = (n: number) => (n > 0 ? `+${n}` : String(n));

// v1.7 "ร่างกายสัปดาห์นี้": periodic tasks that came due, health checks past their date and the
// shopping list. Info only: nothing here scores or pushes.
function BodyWeek({ s, today }: { s: State; today: string }) {
  const [open, setOpen] = useState(false);
  if (s.care.level === null) return null;
  // Every un-postponed task overdue 2x is also due, so the list matches what TasksSheet shows.
  const due = dueTasks(s, today);
  const checks = s.care.checks.filter((c) => c.last && c.everyM > 0 && checkNext(c, today).due);
  const shop = shopList(s.care, today);
  if (!due.length && !checks.length && !shop.length) return null;
  const titles = due.map((t) => careTaskText(t.title));
  return (
    <>
      <div className="review-step">{m("weeklyReview.body.header")}</div>
      <div className="group review-list">
        {titles.length > 0 && (
          <button className="review-row" style={{ width: "100%", textAlign: "left" }} onClick={() => { play("tap"); setOpen(true); }}>
            <span>{rich(m("weeklyReview.body.due"), { num: <span className="num">{titles.length}</span> })}</span><span className="row-sub link">{titles.slice(0, 2).join(", ")}</span>
          </button>
        )}
        {checks.map((c) => <div key={c.id} className="review-row"><span>{careCheckText(c.name)}</span><span className="badge warn">{m("weeklyReview.body.overdue")}</span></div>)}
        {shop.length > 0 && <div className="review-row"><span>{m("weeklyReview.body.low")}</span><span className="row-sub">{shop.slice(0, 3).map((p) => p.name).join(", ")}</span></div>}
      </div>
      <TasksSheet open={open} date={today} onClose={() => setOpen(false)} />
    </>
  );
}

// 4-step weekly review. Every change is a tap; "เสร็จ" stores the week snapshot and marks the week reviewed.
export function WeeklyReview({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Sheet open={open} title={m("weeklyReview.title")} onClose={onClose}>{open && <Review onDone={onClose} />}</Sheet>;
}

function Review({ onDone }: { onDone: () => void }) {
  useLang(); // STEPS follow the language
  const b = useBrain("weekly");
  const { s, report, brief, today, update } = b;
  const [step, setStep] = useState(0);
  const [snap, setSnap] = useState<{ at: number | null; items: BriefItem[] }>(() => ({ at: b.aiAt, items: brief.items }));
  const [sel, setSel] = useState<Record<string, number>>({});
  // An AI answer re-ranks the list and may pick other variants: cards remount (key has snap.at) with the new variant
  // while sel empties, so card, highlight and "ใช้ทั้งหมด" agree.
  if (snap.at !== b.aiAt) { setSnap({ at: b.aiAt, items: brief.items }); setSel({}); }
  const [done, setDone] = useState<Record<string, string>>({}); // cid -> applied record id
  const [hidden, setHidden] = useState<Set<string>>(() => new Set()); // cards declined in this review
  // Focus default is derived each render (follows a late AI answer, never a paused area); only a tap is stored.
  const [picked, setPicked] = useState<AreaKey | null>(null);
  const live = (k: AreaKey | null | undefined): k is AreaKey => !!k && s.settings.areaPriority[k] !== 0;
  const aiFocus = brief.src === "ai" ? brief.focus.find(live) : undefined;
  const focus = picked ?? aiFocus ?? (live(report.balance.weakest) ? report.balance.weakest : null);
  const wk = weekKey(s, today);
  const last = s.brain.weeks.filter((w) => w[0] !== wk).at(-1);
  const score = (k: AreaKey) => report.areas.find((a) => a.key === k)?.score ?? null;

  // v1.8 honest: a week-over-week delta only when both weeks have the score and this week's confidence is >= 0.4.
  const rows = AREAS.map((k, i) => {
    const prev = last ? Number(last[i + 2]) : -1, a = report.areas.find((x) => x.key === k), cur = a?.score ?? null;
    return { k, cur, d: cur !== null && prev >= 0 && (a?.conf ?? 0) >= 0.4 ? cur - prev : null };
  }).sort((x, y) => (y.d ?? -999) - (x.d ?? -999) || (y.cur ?? -1) - (x.cur ?? -1));
  const prevB = last ? Number(last[1]) : -1;
  // Weekly balance trend: stored weeks (not this one) plus the current score.
  const balWeeks = [...s.brain.weeks.filter((w) => w[0] !== wk).map((w) => Number(w[1])).filter((v) => v >= 0), ...(report.balance.b !== null ? [report.balance.b] : [])];

  const evRows = s.brain.applied.filter((r) => !r.undoneAt && r.outcome === undefined && r.eval)
    .map((r) => ({ r, e: b.evals.find((e) => e.id === r.id) })).filter((x) => x.e && x.e.status !== "none");
  const items = snap.items;
  const variantOf = (it: BriefItem) => sel[it.cand.id] ?? it.variant;
  const slotDows = new Set(items.flatMap((it) => (it.cand.variants[variantOf(it)]?.actions ?? []).flatMap((a) => (a.k === "set_week_slot" ? [a.dow] : []))));
  const snoozed = (sig: string) => { const v = s.brain.snooze[sig]; return v === "mute" || (!!v && v >= today); };
  const liveIds = new Set(report.candidates.map((c) => c.id));
  const open = items.filter((it) => !done[it.cand.id] && !hidden.has(it.cand.id) && !snoozed(it.cand.sig) && liveIds.has(it.cand.id));

  function finish() {
    play("complete");
    const row = [wk, report.balance.b ?? -1, ...AREAS.map((k) => score(k) ?? -1)];
    update((x) => {
      x.brain.weeks = [...x.brain.weeks.filter((w) => w[0] !== wk), row].sort((p, q) => String(p[0]).localeCompare(String(q[0]))).slice(-12);
      x.brain.reviewDone = wk;
    });
    onDone();
  }
  function pickFocus() {
    if (!focus) return;
    play("done");
    update((x) => pickReviewFocus(x, focus));
    const c = report.candidates.find((x) => x.area === focus && x.variants.some((v) => v.actions.some((a) => a.k === "focus_step")));
    if (c) b.apply(c.id, c.variants.findIndex((v) => v.actions.some((a) => a.k === "focus_step")));
    setStep(4);
  }

  return (
    <div className="review">
      <div className="review-dots" aria-label={m("weeklyReview.aria.step", { n: Math.min(step, 3) + 1 })}>{STEPS.map((t, i) => <span key={t} className={i <= step ? "on" : ""} />)}</div>
      <div className="review-step">{STEPS[Math.min(step, 3)]}</div>

      {step === 0 && (
        <div className="group review-list">
          <div className="review-row"><b>{m("weeklyReview.balance", { b: report.balance.b ?? "-" })}</b><span className="row-sub">{prevB >= 0 && report.balance.b !== null ? m("weeklyReview.lastWeek", { prev: prevB, d: sgn(report.balance.b - prevB) }) : m("weeklyReview.noLastWeek")}</span></div>
          {balWeeks.length >= 2 && <div className="review-row"><span className="row-sub">{m("weeklyReview.balWeeks", { n: balWeeks.length })}</span><Sparkline values={balWeeks} label={m("weeklyReview.balWeeksLabel")} domain={[0, 100]} tone="var(--accent)" /></div>}
          {rows.map(({ k, cur, d }) => (
            <div key={k} className="review-row"><span>{AREA_LABEL[k]}</span><span className="num">{cur ?? "-"}{d !== null && <span className={d >= 0 ? "pos" : "neg"}> ({sgn(d)})</span>}</span></div>
          ))}
        </div>
      )}
      {step === 0 && <div className="section-footer review-note">{m("weeklyReview.estimate")}</div>}
      {step === 0 && <BodyWeek s={s} today={today} />}

      {step === 1 && (
        <>
          {!evRows.length && <p className="confirm-body">{m("weeklyReview.noEvals")}</p>}
          {evRows.map(({ r, e }) => {
            const worse = e!.verdict === "worse";
            const d0 = describeOps(s, r.ops)[0], fb = RULE_COPY[r.rule as keyof typeof RULE_COPY]?.short ?? "";
            return (
              <div key={r.id} className="card prop">
                <div className="prop-title">{RULE_COPY[r.rule as keyof typeof RULE_COPY]?.short ?? r.rule}</div>
                {(d0 || fb) && <div className="prop-why"><ArrowDiff d={d0} fallback={fb} /></div>}
                {e!.status === "waiting" ? <div className="prop-note">{m("weeklyReview.waitUntil", { date: thaiDate(e!.due!) })}</div> : (
                  <>
                    <div className="prop-note"><span className={`badge ${e!.verdict === "better" ? "ok" : worse ? "warn" : ""}`}>{VERDICT_LABEL[e!.verdict ?? "nodata"]}</span> {evalCaveat()}</div>
                    <div className="prop-actions">
                      <button className={`chip ${worse ? "" : "prop-go"}`} onClick={() => b.keep(r.id, e!.verdict ?? "nodata")}>{m("weeklyReview.keep")}</button>
                      {r.ops.length > 0 && <button className={`chip ${worse ? "prop-go" : ""}`} onClick={() => b.undo(r.id, { outcome: e!.verdict ?? "nodata" })}>{m("weeklyReview.revert")}</button>}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </>
      )}

      {step === 2 && (
        <>
          <div className="week-strip">
            {report.plan.map((p) => {
              const dow = new Date(p.date + "T12:00:00").getDay();
              return <div key={p.date} className={`week-day ${slotDows.has(dow) ? "hl" : ""}`}><b>{fmt.dowShort(dow)}</b><span>{templateLabel(s.schedule, p.tpl)}</span></div>;
            })}
          </div>
          {brief.src === "ai" && (brief.headline || brief.summary) && (
            <div className="card review-ai"><div className="prop-title">{brief.headline}</div>{brief.summary && <div className="prop-why">{brief.summary}</div>}
              {brief.notes.map((n) => <div key={n.area} className="prop-note">{AREA_LABEL[n.area]}: {n.note}</div>)}</div>
          )}
          {b.aiBusy && <div className="ai-skel" aria-hidden><span className="skel" style={{ width: "90%" }} /><span className="skel" style={{ width: "70%" }} /></div>}
          {!items.length && <p className="confirm-body">{m("weeklyReview.nothing")}</p>}
          {items.filter((it) => !hidden.has(it.cand.id)).map((it) => (
            <ProposalCard key={`${snap.at ?? 0}:${it.cand.id}`} item={it} b={b} full appliedId={done[it.cand.id] ?? null}
              onApplied={(id) => setDone((d) => ({ ...d, [it.cand.id]: id }))} onVariant={(v) => setSel((x) => ({ ...x, [it.cand.id]: v }))}
              onHide={() => setHidden((h) => new Set(h).add(it.cand.id))} />
          ))}
          <div className="confirm-actions">
            {open.length > 1 && <button className="btn" onClick={() => setDone((d) => ({ ...d, ...b.applyAll(open.map((it) => ({ cid: it.cand.id, variant: variantOf(it) }))) }))}>{m("weeklyReview.applyAll", { n: open.length })}</button>}
            {b.aiState === "ok" ? (
              <button className="btn secondary" disabled={b.aiBusy} onClick={() => { play("tap"); void b.requestAi("weekly"); }}>
                {b.aiBusy ? m("weeklyReview.aiBusy") : m("weeklyReview.askAi", { rem: b.remaining !== null ? m("weeklyReview.askAiLeft", { n: b.remaining }) : "" })}
              </button>
            ) : <div className="section-footer" style={{ textAlign: "center" }}>{BRAIN_MSG[b.aiState]}</div>}
            {b.aiMsg && <div className="section-footer" style={{ textAlign: "center" }}>{b.aiMsg}</div>}
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <p className="confirm-body">{m("weeklyReview.pickFocus", { ai: aiFocus ? m("weeklyReview.aiPick", { area: AREA_LABEL[aiFocus] }) : "" })}</p>
          <div className="chips" style={{ justifyContent: "center", marginBottom: 18 }}>
            {AREAS.filter((k) => s.settings.areaPriority[k] !== 0).map((k) => (
              <button key={k} className={`chip ${focus === k ? "on" : ""}`} aria-pressed={focus === k} onClick={() => { play("tap"); setPicked(k); }}>{AREA_LABEL[k]}</button>
            ))}
          </div>
          <button className="btn" disabled={!focus} onClick={pickFocus}>{m("weeklyReview.setFocus")}</button>
          <button className="btn secondary" style={{ marginTop: 10 }} onClick={() => setStep(4)}>{m("weeklyReview.skip")}</button>
        </>
      )}

      {step === 4 && <p className="confirm-body">{m("weeklyReview.allSet")}</p>}

      <div className="review-nav">
        {step > 0 && <button className="btn secondary" onClick={() => { play("tap"); setStep(step - 1); }}>{m("weeklyReview.back")}</button>}
        {step < 3 && <button className="btn" onClick={() => { play("tap"); setStep(step + 1); }}>{m("weeklyReview.next")}</button>}
        {step === 4 && <button className="btn" onClick={finish}>{m("weeklyReview.done")}</button>}
      </div>
    </div>
  );
}
