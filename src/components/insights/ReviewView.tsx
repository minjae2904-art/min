"use client";

import { useState } from "react";
import { WeeklyReview } from "@/components/brain/WeeklyReview";
import { Chev, Section } from "@/components/ui";
import { describeOps } from "@/lib/brain/actions";
import { EVAL_CAVEAT, RULE_COPY, TIP_TEXT, VERDICT_LABEL, thaiDate } from "@/lib/brain/copy";
import { weekKey } from "@/lib/brain/review";
import type { DataQuality, RuleId } from "@/lib/brain/types";
import { play } from "@/lib/sound";
import { BRAIN_MSG, PROVIDER_LABEL, RULES_LABEL, type BrainApi } from "@/lib/useBrain";

const LEVEL: Record<NonNullable<DataQuality["level"]>, string> = { good: "ดี", fair: "พอใช้", low: "ต่ำ" };

// How far tick times can be trusted (14 days). Check-in timing is info only.
function QualitySection({ q }: { q: DataQuality }) {
  const pct = (n: number) => (q.ticks ? `${Math.round((n / q.ticks) * 100)}%` : "-");
  const rows: [string, string][] = [
    ["เวลาติ๊กตรงจริง", pct(q.live + q.confirmed)],
    ["ติ๊กย้อนหลังเป็นชุด", pct(q.batch)],
    ["ยังไม่ยืนยันเวลา", pct(q.late)],
    ["เช็กอินหลังตื่น", q.checkins ? `${q.checkinOnTime}/${q.checkins} ครั้งภายใน 3 ชม.` : "ยังไม่มีเวลาเช็กอิน"],
  ];
  return (
    <Section header="คุณภาพข้อมูล" footer="ติ๊กย้อนหลังให้กด 'ทำตรงเวลา' หรือ 'เลือกเวลา' · ข้อเสนอที่อิงเวลาติ๊กจะหยุดชั่วคราวเมื่อคุณภาพต่ำ">
      <div className="row">
        <span className="row-main"><span className="row-title">ความน่าเชื่อถือของเวลาติ๊ก</span><span className="row-sub">{q.ticks} ครั้งใน 14 วันที่ผ่านมา</span></span>
        <span className={`badge ${q.level === "good" ? "ok" : q.level === "low" ? "warn" : ""}`}>{q.level ? LEVEL[q.level] : "ข้อมูลยังน้อย"}</span>
      </div>
      {rows.map(([k, v]) => (
        <div key={k} className="row"><span className="row-main row-title">{k}</span><span className="row-value num">{v}</span></div>
      ))}
    </Section>
  );
}

// Insights > รีวิว (was the lower half of /balance): weekly review, AI summary, data quality, tried proposals.
export function ReviewView({ b }: { b: BrainApi }) {
  const { s, report, brief, today } = b;
  const [review, setReview] = useState(false);
  const reviewed = s.brain.reviewDone === weekKey(s, today);

  return (
    <>
      <Section header="รีวิวสัปดาห์">
        <button className="row" onClick={() => { play("open"); setReview(true); }}>
          <span className="row-main"><div className="row-title">เริ่มรีวิวสัปดาห์</div><div className="row-sub">{reviewed ? "รีวิวสัปดาห์นี้แล้ว ทำซ้ำได้" : "4 ขั้น ราว 2 นาที"}</div></span>
          <Chev />
        </button>
      </Section>

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

      <QualitySection q={report.quality} />

      <Section header="ที่ลองแล้ว" footer={s.brain.applied.length ? EVAL_CAVEAT : undefined}>
        {!s.brain.applied.length && <div className="row"><span className="row-main row-sub">ยังไม่มี</span></div>}
        {s.brain.applied.map((r) => {
          const e = b.evals.find((x) => x.id === r.id);
          const chip = r.undoneAt ? "เลิกทำแล้ว" : e?.status === "waiting" ? VERDICT_LABEL.waiting : e?.verdict ? VERDICT_LABEL[e.verdict] : null;
          return (
            <div key={r.id} className="row">
              <span className="row-main">
                <div className="row-title fs-sub">{RULE_COPY[r.rule as RuleId]?.short ?? r.rule}</div>
                <div className="row-sub">{thaiDate(r.date)}{r.ops.length ? ` · ${describeOps(s, r.ops)[0]?.text ?? ""}` : ""}</div>
              </span>
              {chip && <span className={`badge ${e?.verdict === "better" && !r.undoneAt ? "ok" : e?.verdict === "worse" && !r.undoneAt ? "warn" : ""}`}>{chip}</span>}
              {!r.undoneAt && r.ops.length > 0 && <button className="link fs-sub" onClick={() => { play("undo"); b.undo(r.id); }}>เลิกทำ</button>}
            </div>
          );
        })}
      </Section>

      <WeeklyReview open={review} onClose={() => setReview(false)} />
    </>
  );
}
