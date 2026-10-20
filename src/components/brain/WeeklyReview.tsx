"use client";

import { useState } from "react";
import { describeOps } from "@/lib/brain/actions";
import { AREA_LABEL, EVAL_CAVEAT, RULE_COPY, VERDICT_LABEL, templateLabel, thaiDate } from "@/lib/brain/copy";
import { pickReviewFocus, weekKey } from "@/lib/brain/review";
import { AREAS, type AreaKey, type BriefItem } from "@/lib/brain/types";
import { play } from "@/lib/sound";
import { BRAIN_MSG, useBrain } from "@/lib/useBrain";
import { Sheet } from "../ui";
import { ProposalCard } from "./ProposalCard";

const DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const STEPS = ["สัปดาห์นี้", "ที่ลองแล้วได้ผลไหม", "สัปดาห์หน้า", "โฟกัส 1 อย่าง"];
const sgn = (n: number) => (n > 0 ? `+${n}` : String(n));

// 4-step weekly review. Every change is a tap; "เสร็จ" stores the week snapshot and marks the week reviewed.
export function WeeklyReview({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Sheet open={open} title="รีวิวสัปดาห์" onClose={onClose}>{open && <Review onDone={onClose} />}</Sheet>;
}

function Review({ onDone }: { onDone: () => void }) {
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

  const rows = AREAS.map((k, i) => {
    const prev = last ? Number(last[i + 2]) : -1, cur = score(k);
    return { k, cur, d: cur !== null && prev >= 0 ? cur - prev : null };
  }).sort((x, y) => (y.d ?? -999) - (x.d ?? -999) || (y.cur ?? -1) - (x.cur ?? -1));
  const prevB = last ? Number(last[1]) : -1;

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
      <div className="review-dots" aria-label={`ขั้นที่ ${Math.min(step, 3) + 1} จาก 4`}>{STEPS.map((t, i) => <span key={t} className={i <= step ? "on" : ""} />)}</div>
      <div className="review-step">{STEPS[Math.min(step, 3)]}</div>

      {step === 0 && (
        <div className="group review-list">
          <div className="review-row"><b>สมดุล {report.balance.b ?? "-"}</b><span className="row-sub">{prevB >= 0 && report.balance.b !== null ? `สัปดาห์ก่อน ${prevB} (${sgn(report.balance.b - prevB)})` : "ยังไม่มีสัปดาห์ก่อนให้เทียบ"}</span></div>
          {rows.map(({ k, cur, d }) => (
            <div key={k} className="review-row"><span>{AREA_LABEL[k]}</span><span className="num">{cur ?? "-"}{d !== null && <span className={d >= 0 ? "pos" : "neg"}> ({sgn(d)})</span>}</span></div>
          ))}
        </div>
      )}

      {step === 1 && (
        <>
          {!evRows.length && <p className="confirm-body">ยังไม่มีการปรับที่ต้องดูผลสัปดาห์นี้</p>}
          {evRows.map(({ r, e }) => {
            const worse = e!.verdict === "worse";
            const label = describeOps(s, r.ops)[0]?.text ?? RULE_COPY[r.rule as keyof typeof RULE_COPY]?.short ?? "";
            return (
              <div key={r.id} className="card prop">
                <div className="prop-title">{RULE_COPY[r.rule as keyof typeof RULE_COPY]?.short ?? r.rule}</div>
                {label && <div className="prop-why">{label}</div>}
                {e!.status === "waiting" ? <div className="prop-note">รอผลถึง{thaiDate(e!.due!)}</div> : (
                  <>
                    <div className="prop-note"><span className={`badge ${e!.verdict === "better" ? "ok" : worse ? "warn" : ""}`}>{VERDICT_LABEL[e!.verdict ?? "nodata"]}</span> {EVAL_CAVEAT}</div>
                    <div className="prop-actions">
                      <button className={`chip ${worse ? "" : "prop-go"}`} onClick={() => b.keep(r.id, e!.verdict ?? "nodata")}>ใช้ต่อ</button>
                      {r.ops.length > 0 && <button className={`chip ${worse ? "prop-go" : ""}`} onClick={() => b.undo(r.id, { outcome: e!.verdict ?? "nodata" })}>ย้อนกลับ</button>}
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
              return <div key={p.date} className={`week-day ${slotDows.has(dow) ? "hl" : ""}`}><b>{DOW[dow]}</b><span>{templateLabel(s.schedule, p.tpl)}</span></div>;
            })}
          </div>
          {brief.src === "ai" && (brief.headline || brief.summary) && (
            <div className="card review-ai"><div className="prop-title">{brief.headline}</div>{brief.summary && <div className="prop-why">{brief.summary}</div>}
              {brief.notes.map((n) => <div key={n.area} className="prop-note">{AREA_LABEL[n.area]}: {n.note}</div>)}</div>
          )}
          {b.aiBusy && <div className="ai-skel" aria-hidden><span className="skel" style={{ width: "90%" }} /><span className="skel" style={{ width: "70%" }} /></div>}
          {!items.length && <p className="confirm-body">สัปดาห์นี้ยังไม่มีอะไรต้องปรับ</p>}
          {items.filter((it) => !hidden.has(it.cand.id)).map((it) => (
            <ProposalCard key={`${snap.at ?? 0}:${it.cand.id}`} item={it} b={b} full appliedId={done[it.cand.id] ?? null}
              onApplied={(id) => setDone((d) => ({ ...d, [it.cand.id]: id }))} onVariant={(v) => setSel((x) => ({ ...x, [it.cand.id]: v }))}
              onHide={() => setHidden((h) => new Set(h).add(it.cand.id))} />
          ))}
          <div className="confirm-actions">
            {open.length > 1 && <button className="btn" onClick={() => setDone((d) => ({ ...d, ...b.applyAll(open.map((it) => ({ cid: it.cand.id, variant: variantOf(it) }))) }))}>ใช้ทั้งหมด ({open.length})</button>}
            {b.aiState === "ok" ? (
              <button className="btn secondary" disabled={b.aiBusy} onClick={() => { play("tap"); void b.requestAi("weekly"); }}>
                {b.aiBusy ? "AI กำลังดู..." : `ให้ AI ช่วยดู (ใช้ 1 ครั้ง${b.remaining !== null ? ` · เหลือ ${b.remaining}` : ""})`}
              </button>
            ) : <div className="section-footer" style={{ textAlign: "center" }}>{BRAIN_MSG[b.aiState]}</div>}
            {b.aiMsg && <div className="section-footer" style={{ textAlign: "center" }}>{b.aiMsg}</div>}
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <p className="confirm-body">เลือก 1 ด้านที่อยากดูแลสัปดาห์นี้{aiFocus ? ` (AI แนะนำ: ${AREA_LABEL[aiFocus]})` : ""}</p>
          <div className="chips" style={{ justifyContent: "center", marginBottom: 18 }}>
            {AREAS.filter((k) => s.settings.areaPriority[k] !== 0).map((k) => (
              <button key={k} className={`chip ${focus === k ? "on" : ""}`} aria-pressed={focus === k} onClick={() => { play("tap"); setPicked(k); }}>{AREA_LABEL[k]}</button>
            ))}
          </div>
          <button className="btn" disabled={!focus} onClick={pickFocus}>ตั้งเป็นโฟกัส</button>
          <button className="btn secondary" style={{ marginTop: 10 }} onClick={() => setStep(4)}>ข้าม</button>
        </>
      )}

      {step === 4 && <p className="confirm-body">ครบแล้ว แตะ &quot;เสร็จ&quot; เพื่อบันทึกสัปดาห์นี้</p>}

      <div className="review-nav">
        {step > 0 && <button className="btn secondary" onClick={() => { play("tap"); setStep(step - 1); }}>ก่อนหน้า</button>}
        {step < 3 && <button className="btn" onClick={() => { play("tap"); setStep(step + 1); }}>ถัดไป</button>}
        {step === 4 && <button className="btn" onClick={finish}>เสร็จ</button>}
      </div>
    </div>
  );
}
