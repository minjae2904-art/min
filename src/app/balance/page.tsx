"use client";

import { useMemo, useState } from "react";
import { BalanceDials } from "@/components/brain/BalanceDials";
import { Ring } from "@/components/brain/BrainCard";
import { ProposalCard } from "@/components/brain/ProposalCard";
import { WeeklyReview } from "@/components/brain/WeeklyReview";
import { Chev, NavBar, Section } from "@/components/ui";
import { describeOps } from "@/lib/brain/actions";
import { AREA_LABEL, CONFLICT_LABEL, EVAL_CAVEAT, EV_LABEL, LOW_DATA_HEADLINE, RULE_COPY, TIP_TEXT, VERDICT_LABEL, evText, thaiDate } from "@/lib/brain/copy";
import { composeBrief } from "@/lib/brain/report";
import { weekKey } from "@/lib/brain/review";
import type { AreaKey, RuleId } from "@/lib/brain/types";
import { play } from "@/lib/sound";
import { BRAIN_MSG, PROVIDER_LABEL, RULES_LABEL, useBrain } from "@/lib/useBrain";

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1), min = Math.min(...values, 0);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${26 - ((v - min) / (max - min || 1)) * 24}`).join(" ");
  return <svg className="spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-label="สมดุลรายสัปดาห์"><polyline points={pts} fill="none" stroke="var(--blue)" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg>;
}

// Balance page (spec 5.5): not a tab; reached from the Today card, Stats and Settings.
export default function BalancePage() {
  const b = useBrain("brief");
  const { s, report, brief, today } = b;
  const [review, setReview] = useState(false);
  const bal = report.balance;
  const score = (k: AreaKey | null) => report.areas.find((a) => a.key === k)?.score ?? "-";
  // Top 5: the brief's picks (AI or rules) first, then the next candidates that are not hidden.
  const props = useMemo(() => {
    const more = composeBrief(report, null, "weekly", s.brain, today).items;
    return [...brief.items, ...more.filter((m) => !brief.items.some((x) => x.cand.id === m.cand.id))].slice(0, 5);
  }, [report, s.brain, today, brief.items]);
  const weeks = s.brain.weeks.map((w) => Number(w[1])).filter((v) => v >= 0);
  const load = report.load.length ? Math.round(report.load.reduce((a, x) => a + x, 0) / report.load.length) : null;
  const workBusy = report.plan.some((p) => p.work && p.load > 0.9);
  const reviewed = s.brain.reviewDone === weekKey(s, today);

  return (
    <main className="screen">
      <NavBar back="/" backLabel="วันนี้" title="สมดุล" sub={bal.b === null ? LOW_DATA_HEADLINE : undefined} />

      <div className="card balance-head">
        <Ring value={bal.b} size={64} />
        <div className="row-main">
          <div className="balance-num">สมดุล <b className="num">{bal.b ?? "-"}</b>/100</div>
          {bal.best && bal.weakest && bal.best !== bal.weakest && <div className="row-sub">เอียง: {AREA_LABEL[bal.best]} {score(bal.best)} · {AREA_LABEL[bal.weakest]} {score(bal.weakest)}</div>}
          {load !== null && <div className="row-sub">แผนสัปดาห์นี้แน่น {load}%{workBusy ? " · วันกะแน่นเป็นปกติ" : ""}</div>}
        </div>
        <Spark values={bal.b === null ? weeks : [...weeks, bal.b]} />
      </div>

      <BalanceDials b={b} />

      {report.conflicts.length > 0 && (
        <Section header="จุดที่ชนกัน">
          {report.conflicts.map((c) => (
            <div key={c.id} className="insight"><span className="insight-dot" style={c.sev === 3 ? { background: "var(--red)" } : undefined} />
              <span><b>{CONFLICT_LABEL[c.id]}</b>{Object.keys(c.ev).some((k) => EV_LABEL[k]) ? ` · ${Object.entries(c.ev).filter(([k]) => EV_LABEL[k]).map(([k, v]) => evText(k, v)).join(" · ")}` : ""}</span></div>
          ))}
        </Section>
      )}

      {report.patterns.length > 0 && (
        <Section header="รูปแบบที่เห็น" footer="ดูจากข้อมูลของคุณเอง เป็นความสัมพันธ์ ไม่ได้บอกว่าอะไรเป็นสาเหตุ">
          {report.patterns.map((p) => <div key={p.id} className="insight"><span className="insight-dot" /><span>{p.text}</span></div>)}
        </Section>
      )}

      <div className="section-header">ข้อเสนอ</div>
      {!props.length && <div className="card brain-line">ตอนนี้ยังไม่มีข้อเสนอ ทำต่อแบบเดิมได้เลย</div>}
      {props.map((it) => <ProposalCard key={it.cand.id} item={it} b={b} full />)}

      <Section header="สรุปจาก AI" footer="AI เห็นเฉพาะตัวเลขสรุปและรหัสข้อเสนอ ไม่เห็น journal โน้ตเทรด หรือชื่อที่ตั้งเอง · AI เลือกได้เฉพาะข้อเสนอที่ระบบคำนวณไว้">
        <div style={{ padding: 16 }}>
          {brief.src === "ai" ? (
            <>
              <div className="prop-title">{brief.headline} <span className="badge">{PROVIDER_LABEL[brief.provider ?? ""] ?? "AI"}</span></div>
              {brief.tips.map((t) => <div key={t.tip} className="prop-note">{TIP_TEXT[t.tip]}{t.why ? ` · AI: ${t.why}` : ""}</div>)}
              {brief.question && <div className="prop-if">{brief.question}</div>}
            </>
          ) : <div className="row-sub" style={{ marginBottom: 12 }}>ตอนนี้ใช้คำแนะนำจาก{RULES_LABEL}</div>}
          {b.aiBusy && <div className="ai-skel" aria-hidden><span className="skel" style={{ width: "90%" }} /><span className="skel" style={{ width: "72%" }} /></div>}
          {b.aiState === "ok" ? (
            <button className="btn" style={{ marginTop: 12 }} disabled={b.aiBusy} onClick={() => { play("tap"); void b.requestAi("brief"); }}>
              {b.aiBusy ? "AI กำลังดู..." : `ให้ AI ช่วยดูวันนี้${b.remaining !== null ? ` · เหลือ ${b.remaining} ครั้ง` : ""}`}
            </button>
          ) : <div className="row-sub" style={{ marginTop: 12 }}>{BRAIN_MSG[b.aiState]}</div>}
          {b.aiMsg && <div className="row-sub" style={{ marginTop: 8 }}>{b.aiMsg}</div>}
        </div>
      </Section>

      <Section header="รีวิวสัปดาห์">
        <button className="row" onClick={() => { play("open"); setReview(true); }}>
          <span className="row-main"><div className="row-title">เริ่มรีวิวสัปดาห์</div><div className="row-sub">{reviewed ? "รีวิวสัปดาห์นี้แล้ว ทำซ้ำได้" : "4 ขั้น ราว 2 นาที"}</div></span>
          <Chev />
        </button>
      </Section>

      <Section header="ที่ลองแล้ว" footer={s.brain.applied.length ? EVAL_CAVEAT : undefined}>
        {!s.brain.applied.length && <div className="row"><span className="row-main row-sub">ยังไม่มี</span></div>}
        {s.brain.applied.map((r) => {
          const e = b.evals.find((x) => x.id === r.id);
          const chip = r.undoneAt ? "เลิกทำแล้ว" : e?.status === "waiting" ? VERDICT_LABEL.waiting : e?.verdict ? VERDICT_LABEL[e.verdict] : null;
          return (
            <div key={r.id} className="row">
              <span className="row-main">
                <div className="row-title" style={{ fontSize: 15 }}>{RULE_COPY[r.rule as RuleId]?.short ?? r.rule}</div>
                <div className="row-sub">{thaiDate(r.date)}{r.ops.length ? ` · ${describeOps(s, r.ops)[0]?.text ?? ""}` : ""}</div>
              </span>
              {chip && <span className={`badge ${e?.verdict === "better" && !r.undoneAt ? "ok" : e?.verdict === "worse" && !r.undoneAt ? "warn" : ""}`}>{chip}</span>}
              {!r.undoneAt && r.ops.length > 0 && <button className="link" style={{ fontSize: 15 }} onClick={() => { play("undo"); b.undo(r.id); }}>เลิกทำ</button>}
            </div>
          );
        })}
      </Section>

      <WeeklyReview open={review} onClose={() => setReview(false)} />
    </main>
  );
}
