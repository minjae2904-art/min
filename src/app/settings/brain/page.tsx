"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ConfirmSheet, NavBar, Section, Segmented, Sheet, Switch, toast } from "@/components/ui";
import { AREA_LABEL, RULE_COPY } from "@/lib/brain/copy";
import { buildAiContext, ctxBytes } from "@/lib/brain/context";
import { brainHeadline, brainReport } from "@/lib/brain/report";
import { AREAS, type AreaKey, type RuleId } from "@/lib/brain/types";
import { logicalDate } from "@/lib/date";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";

type Flag = "brainCard" | "brainAi" | "brainAutoAi" | "notifyReview" | "notifyLastMatch" | "aiSendIdentity";
const SWITCHES: [Flag, string, string?][] = [
  ["brainCard", "การ์ดสมดุลบนหน้าวันนี้", "คะแนนสมดุลและข้อเสนอไม่เกิน 2 ข้อ"],
  ["brainAi", "ใช้ AI วิเคราะห์", "ปิดแล้วกฎพื้นฐานยังทำงานครบ และไม่มีอะไรถูกส่งออก"],
  ["brainAutoAi", "ให้ AI สรุปอัตโนมัติวันละครั้งหลังตื่น", "เฉพาะตอนเปิดแอป ออนไลน์ และซิงค์แล้ว"],
  ["notifyReview", "แจ้งเตือนรีวิวสัปดาห์", "1 ชม. 30 นาทีหลังตื่นในวันรีวิว"],
  ["notifyLastMatch", "แจ้งเตือนแมตช์สุดท้าย", "15 นาทีก่อนเวลาหยุดเกมแข่ง"],
  ["aiSendIdentity", "ส่งประโยคเป้าหมายตัวตนให้ AI โค้ช (สมองไม่ส่ง)"],
];
const DOW: [number, string][] = [[-1, "วันพักแรกในแผนสัปดาห์"], [0, "อา"], [1, "จ"], [2, "อ"], [3, "พ"], [4, "พฤ"], [5, "ศ"], [6, "ส"]];
const PRIORITY: ["0" | "1" | "2", string][] = [["2", "เน้น"], ["1", "ปกติ"], ["0", "พักไว้"]];
const JOB: ["yes" | "no" | "", string][] = [["yes", "ยังทำงานกะดึก"], ["no", "ไม่ได้ทำแล้ว"], ["", "ไม่ระบุ"]];

// Muted suggestion label from its sig (`rule:target`): the rule's short copy, plus the area when the target is one.
function mutedLabel(sig: string): string {
  const [rule, target] = sig.split(":");
  const short = RULE_COPY[rule as RuleId]?.short ?? sig;
  return target && target in AREA_LABEL ? `${short} · ${AREA_LABEL[target as AreaKey]}` : short;
}

export default function BrainSettings() {
  const { s, update } = useStore();
  const set = s.settings;
  const today = logicalDate();
  const [peek, setPeek] = useState(false);
  const [clearing, setClearing] = useState(false);
  const head = useMemo(() => brainHeadline(s, today), [s, today]);
  // The exact payload the AI route would build from this state (built locally, only while the sheet is open).
  const ctx = useMemo(() => (peek ? buildAiContext(brainReport(s, today, "brief"), s, today, "brief") : null), [peek, s, today]);
  const muted = Object.keys(s.brain.snooze).filter((k) => s.brain.snooze[k] === "mute");

  const setFlag = (k: Flag, v: boolean) => update((x) => { x.settings[k] = v; });
  const history = s.brain.applied.length + s.brain.decisions.length + s.brain.weeks.length;

  return (
    <main className="screen">
      <NavBar title="สมอง Krob" sub={head ? `สมดุล ${head.balance}${head.label ? ` · โฟกัส: ${head.label}` : ""}` : "ระบบช่วยดูสมดุลชีวิต เสนอได้ แต่ไม่ปรับแผนเองถ้าคุณไม่กด"} />

      <Section footer="ไม่มีการปรับแผนถ้าคุณไม่กดยืนยัน และย้อนกลับได้เสมอ">
        {SWITCHES.map(([k, title, sub]) => (
          <div key={k} className="row">
            <span className="row-main">
              <div className="row-title">{title}</div>
              {sub && <div className="row-sub">{sub}</div>}
            </span>
            <Switch label={title} on={set[k]} onChange={(v) => setFlag(k, v)} />
          </div>
        ))}
      </Section>

      <Section header="วันรีวิวสัปดาห์" footer="การ์ดรีวิวขึ้นในวันรีวิวและวันถัดไป จนกว่าจะรีวิวเสร็จ">
        <div className="row chips" style={{ gap: 8, flexWrap: "wrap" }}>
          {DOW.map(([d, l]) => (
            <button key={d} className={`chip ${set.brainReviewDow === d ? "on" : ""}`} aria-pressed={set.brainReviewDow === d}
              onClick={() => { play("tap"); update((x) => { x.settings.brainReviewDow = d; }); }}>{l}</button>
          ))}
        </div>
      </Section>

      <Section header="ระดับของแต่ละด้าน" footer="เน้น = ให้น้ำหนักมากขึ้นในคะแนนสมดุล · พักไว้ = ไม่นับในสมดุลและงดข้อเสนอด้านนี้ (ยกเว้นเรื่องสุขภาพที่สำคัญ)">
        {AREAS.map((a) => (
          <div key={a} className="row mini-seg">
            <span className="row-main row-title">{AREA_LABEL[a]}</span>
            <div className="row-ctrl sm">
              <Segmented label={`ระดับ ${AREA_LABEL[a]}`} value={String(set.areaPriority[a]) as "0" | "1" | "2"} options={PRIORITY}
                onChange={(v) => update((x) => { x.settings.areaPriority = { ...x.settings.areaPriority, [a]: Number(v) as 0 | 1 | 2 }; })} />
            </div>
          </div>
        ))}
      </Section>

      <Section header="ยังทำงานกะดึกอยู่ไหม" footer="ช่วยให้ระบบเลือกข้อเสนอแผนสัปดาห์ได้ตรงขึ้น">
        <div className="row">
          <div style={{ flex: 1 }}>
            <Segmented label="สถานะงาน" value={set.job ?? ""} options={JOB} onChange={(v) => update((x) => { x.settings.job = v === "" ? null : v; })} />
          </div>
        </div>
      </Section>

      <Section header="คำแนะนำที่ปิดไว้" footer={muted.length ? undefined : "ยังไม่มี · ปิดได้จากปุ่ม \"ไม่ต้องแนะนำแบบนี้อีก\" บนข้อเสนอ"}>
        {muted.map((sig) => (
          <div key={sig} className="row">
            <span className="row-main row-title fs-sub">{mutedLabel(sig)}</span>
            <button className="link" onClick={() => { play("tap"); update((x) => { const n = { ...x.brain.snooze }; delete n[sig]; x.brain.snooze = n; }); toast("จะแนะนำเรื่องนี้ได้อีก"); }}>แนะนำได้อีก</button>
          </div>
        ))}
      </Section>

      <Section>
        <Link href="/balance" className="row row-link" onClick={() => play("nav")}><span className="row-main row-title link">ดูสมดุลและประวัติที่ลองแล้ว</span></Link>
        <button className="row" onClick={() => { play("open"); setPeek(true); }}><span className="row-main row-title link">ดูข้อมูลที่ส่งให้ AI</span></button>
      </Section>

      <Section footer="ล้างเฉพาะประวัติข้อเสนอ การตัดสินใจ รีวิวสัปดาห์ และโฟกัส ไม่แตะบันทึกหรือแผน">
        <button className="row" disabled={!history && !muted.length && !s.brain.focus && !s.brain.reviewDone} onClick={() => { play("tap"); setClearing(true); }}>
          <span className="row-main row-title ink-danger">ล้างประวัติสมอง</span>
        </button>
      </Section>

      <Sheet open={peek} title="ข้อมูลที่ส่งให้ AI" onClose={() => setPeek(false)}>
        <p className="row-sub" style={{ margin: "0 0 10px" }}>
          ไม่มีข้อความ journal โน้ตเทรด ชื่อเทมเพลต หรือชื่อรายการที่คุณตั้งเอง{ctx ? ` · ${(ctxBytes(ctx) / 1024).toFixed(1)} KB` : ""}{set.brainAi ? "" : " · ตอนนี้ปิด AI อยู่ จึงไม่มีอะไรถูกส่ง"}
        </p>
        <pre className="code-block">
          {ctx ? JSON.stringify(ctx, null, 2) : ""}
        </pre>
      </Sheet>
      <ConfirmSheet
        open={clearing}
        title="ล้างประวัติสมอง"
        body={"ล้างประวัติข้อเสนอ การตัดสินใจ คำแนะนำที่ปิดไว้ รีวิวสัปดาห์ และโฟกัส\nบันทึกประจำวันและแผนที่ปรับไปแล้วยังอยู่เหมือนเดิม (แต่จะเลิกทำย้อนหลังไม่ได้)"}
        confirmLabel="ล้าง"
        danger
        onClose={() => setClearing(false)}
        onConfirm={() => {
          play("done");
          update((x) => { x.brain = { ...x.brain, applied: [], decisions: [], snooze: {}, weeks: [], reviewDone: "", focus: null, reviewFocus: null }; }, { flush: true });
          toast("ล้างประวัติสมองแล้ว");
        }}
      />
    </main>
  );
}
