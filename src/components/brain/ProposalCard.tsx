"use client";

import { useMemo, useState } from "react";
import { budgetDelta, compileVariant } from "@/lib/brain/actions";
import { CONFLICT_LABEL, EV_LABEL, VARIANT_LABEL, evText } from "@/lib/brain/copy";
import type { BriefItem } from "@/lib/brain/types";
import { addDays } from "@/lib/date";
import { play } from "@/lib/sound";
import type { BrainApi } from "@/lib/useBrain";
import { IconCheck } from "../Icons";
import { Segmented, Sheet } from "../ui";

const REASONS: [1 | 2 | 3, string][] = [[1, "ไม่สะดวกช่วงนี้"], [2, "ไม่เห็นด้วย"], [3, "ทำอยู่แล้ว"]];

// One engine candidate. The deterministic why line is always shown; AI text is an extra line labelled AI.
// The preview is re-compiled from the current state; "ใช้เลย" re-checks again (stale -> nothing is written).
export function ProposalCard({ item, b, full, appliedId, onApplied, onVariant, onHide }: {
  item: BriefItem; b: BrainApi; full?: boolean; appliedId?: string | null; onApplied?: (id: string) => void; onVariant?: (v: number) => void; onHide?: () => void;
}) {
  const { cand } = item;
  const [vi, setVi] = useState(item.variant);
  const [stale, setStale] = useState(false);
  // A new variant from the parent (e.g. an AI answer re-picks it) replaces the shown one, so the card shows what applies.
  const [from, setFrom] = useState(item.variant);
  if (from !== item.variant) { setFrom(item.variant); setVi(item.variant); setStale(false); }
  const [recId, setRecId] = useState<string | null>(null);
  const [why, setWhy] = useState(false);
  const [later, setLater] = useState(false);
  const [reason, setReason] = useState<0 | 1 | 2 | 3>(0);
  const [gone, setGone] = useState(false);
  const v = cand.variants[vi] ?? cand.variants[0];
  const applied = appliedId ?? recId;
  const rec = applied ? b.s.brain.applied.find((r) => r.id === applied) : undefined;
  const comp = useMemo(() => (applied ? null : compileVariant(b.s, v.actions, b.today, b.mode)), [applied, b.s, v, b.today, b.mode]);
  // The ops the user saw for this variant; a later recompile that differs (e.g. a merge) marks the card stale.
  const opsKey = comp?.ok ? JSON.stringify(comp.ops) : null;
  const [seen, setSeen] = useState<{ vi: number; ops: string | null }>({ vi, ops: opsKey });
  if (seen.vi !== vi || (seen.ops === null && opsKey !== null)) setSeen({ vi, ops: opsKey });
  const budget = useMemo(() => (full && comp?.ok && comp.ops.length ? budgetDelta(b.s, comp.ops, b.today) : ""), [full, comp, b.s, b.today]);
  if (gone) return null;
  // No longer a live candidate (another change in the same area is being tried, a cooldown, the rule stopped firing).
  const out = !applied && !b.report.candidates.some((c) => c.id === cand.id);
  const busy = out && b.s.brain.applied.some((r) => !r.undoneAt && r.eval && r.area === cand.area && addDays(r.date, r.eval.windowDays) > b.today);
  const isStale = !applied && !out && (stale || !comp?.ok || (seen.ops !== null && opsKey !== seen.ops));
  const tipOnly = v.actions.every((a) => a.k === "tip" || a.k === "focus_step");
  const evs = Object.entries(cand.ev).filter(([k]) => EV_LABEL[k]).map(([k, x]) => evText(k, x));
  const conflicts = b.report.conflicts.filter((c) => c.areas.includes(cand.area)).map((c) => CONFLICT_LABEL[c.id]);

  function go() {
    const r = b.apply(cand.id, vi, seen.vi === vi ? seen.ops : null);
    if (r.ok) { setRecId(r.id); onApplied?.(r.id); } else if (r.reason === "stale") setStale(true);
  }
  function hide(days: number | "mute") {
    b.snooze(cand, days, reason || undefined);
    setLater(false);
    setGone(true);
    onHide?.();
  }

  return (
    <div className={`card prop ${full ? "full" : ""} ${isStale ? "stale" : ""} ${rec && !rec.undoneAt ? "applied" : ""}`}>
      <div className="prop-title">{rec && !rec.undoneAt && <span className="prop-ok" aria-hidden><IconCheck size={14} /></span>}{cand.title}</div>
      <div className="prop-why">{cand.why}</div>
      {item.aiWhy && <div className="prop-ai"><b>AI:</b> {item.aiWhy}</div>}
      {full && (
        <div className="prop-if">
          {cand.ifThen}
          {item.aiIfThen && <div className="prop-ai"><b>AI:</b> {item.aiIfThen}</div>}
        </div>
      )}
      {full && !applied && !out && cand.variants.length > 1 && (
        <div className="prop-seg">
          <Segmented label="ระดับ" value={String(vi)} options={cand.variants.map((x, i): [string, string] => [String(i), x.label || VARIANT_LABEL[i] || String(i + 1)])}
            onChange={(k) => { setVi(Number(k)); setStale(false); onVariant?.(Number(k)); }} />
        </div>
      )}
      {!out && comp?.ok && comp.diff.length > 0 && (
        <div className="prop-diff">
          {comp.diff.map((d, i) => (
            <div key={i} className="prop-diff-row"><span className="prop-diff-label">{d.label}</span><span className="num">{d.before ? `${d.before} -> ${d.after}` : d.after}</span></div>
          ))}
        </div>
      )}
      {budget && !out && <div className="prop-note">ผลต่อเวลา 7 วัน: {budget}</div>}
      {full && comp?.ok && comp.clipped.map((c) => <div key={c} className="prop-note">{c}</div>)}
      {isStale && <button className="prop-stale" onClick={() => { play("tap"); setStale(false); setSeen({ vi, ops: opsKey }); }}>แผนเปลี่ยนไปแล้ว แตะเพื่อคำนวณใหม่</button>}

      <div className="prop-actions">
        {rec?.undoneAt ? <span className="prop-done">เลิกทำแล้ว</span>
          : out ? <span className="prop-done">{busy ? "ข้อนี้รอก่อน ด้านนี้กำลังลองอย่างอื่นอยู่" : "ข้อนี้ไม่อยู่ในคำแนะนำตอนนี้แล้ว"}</span>
          : rec ? (
            <>
              <span className="prop-done">{rec.ops.length ? "ปรับแล้ว" : "จดไว้แล้ว"}</span>
              {rec.ops.length > 0 && <button className="link" onClick={() => { play("undo"); b.undo(rec.id); }}>เลิกทำ</button>}
            </>
          ) : (
            <>
              <button className="chip prop-go" disabled={isStale} onClick={go}>{tipOnly ? "จะลองดู" : "ใช้เลย"}</button>
              <button className="chip" onClick={() => { setReason(0); setLater(true); }}>ไม่ตอนนี้</button>
              <button className="link prop-whylink" aria-expanded={why} onClick={() => { play("tap"); setWhy(!why); }}>ทำไม?</button>
            </>
          )}
      </div>
      {why && (
        <div className="prop-whybox">
          {evs.map((t) => <div key={t}>{t}</div>)}
          {conflicts.length > 0 && <div>เรื่องที่ชนกัน: {conflicts.join(" · ")}</div>}
          <div className="prop-foot">เกณฑ์อ้างอิงงานวิจัย เป็นแนวทางทั่วไป</div>
        </div>
      )}

      <Sheet open={later} title="ไม่ตอนนี้" onClose={() => setLater(false)}>
        <div className="section-header">เหตุผล (ไม่บังคับ)</div>
        <div className="chips" style={{ padding: "0 4px 18px" }}>
          {REASONS.map(([k, t]) => (
            <button key={k} className={`chip ${reason === k ? "on" : ""}`} aria-pressed={reason === k} onClick={() => { play("tap"); setReason(reason === k ? 0 : k); }}>{t}</button>
          ))}
        </div>
        <div className="confirm-actions">
          <button className="btn secondary" onClick={() => hide(0)}>พรุ่งนี้</button>
          <button className="btn secondary" onClick={() => hide(6)}>สัปดาห์หน้า</button>
          <button className="btn danger" onClick={() => hide("mute")}>ไม่ต้องแนะนำแบบนี้อีก</button>
        </div>
      </Sheet>
    </div>
  );
}
