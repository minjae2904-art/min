"use client";

import { useState } from "react";
import { trendDir } from "@/lib/brain/areas";
import { AREA_LABEL, CONFLICT_LABEL, EV_LABEL, RULE_COPY, evText, statusLabel } from "@/lib/brain/copy";
import { AREAS, type AreaKey, type AreaResult } from "@/lib/brain/types";
import type { BrainApi } from "@/lib/useBrain";
import { Segmented, Sheet } from "../ui";

// Part labels per area (keys from areas.ts).
const PART_LABEL: Record<AreaKey, Record<string, string>> = {
  sleep: { dur: "ชั่วโมงนอน", reg: "เวลาตื่นคงที่", bedReg: "เวลาเข้านอนคงที่", debt: "หนี้นอน", feel: "ความรู้สึกหลังตื่น" },
  nutrition: { meals: "กินครบมื้อ", pace: "น้ำหนักขึ้นตามเป้า", water: "น้ำถึงเป้า" },
  training: { attend: "เข้ายิมตามแผน", freq: "ความถี่", rot: "หมุนท่าครบ", onTime: "ตรงเวลา" },
  voice: { adh: "ร้องตามแผน", rhythm: "มีวันพักเสียง", strainFree: "เสียงไม่ตึง", rest: "พักในสัปดาห์" },
  trading: { checked: "บันทึกเทรด", atLimit: "อยู่ในลิมิต 1 ไม้", noRevenge: "ไม่แก้มือ" },
  projects: { check: "เช็กเซิฟ", build: "ลุยเซิฟจริง" },
  leisure: { contained: "เกมไม่ลากเวลานอน", coreKept: "วันเกมยังทำหลักครบ", present: "มีเวลาพัก" },
  recovery: { level: "พลังงาน/อารมณ์", drift: "ไม่ต่ำกว่าปกติ", rest: "มีวันพัก" },
  consistency: { level: "ความครบ", logging: "บันทึกสม่ำเสมอ", onTime: "ตรงเวลา", missTwice: "ไม่พลาด 2 วันติด" },
};
const PRIORITY: [string, string][] = [["2", "เน้น"], ["1", "ปกติ"], ["0", "พักไว้"]];

function Trend({ t }: { t: number | null }) {
  const d = trendDir(t);
  if (!d) return null;
  return (
    <span className={`dial-trend ${d}`} aria-label={d === "up" ? `ดีขึ้น ${t}` : `ลดลง ${Math.abs(t ?? 0)}`}>
      <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden><path d={d === "up" ? "M5 1l4 7H1z" : "M5 9L1 2h8z"} fill="currentColor" /></svg>
      {Math.abs(t ?? 0)}
    </span>
  );
}

// 3x3 area dials; tap = detail sheet with part bars, evidence, related items and the area priority.
export function BalanceDials({ b }: { b: BrainApi }) {
  const [open, setOpen] = useState<AreaKey | null>(null);
  const { report, s } = b;
  const area = open ? report.areas.find((a) => a.key === open) : undefined;
  return (
    <>
      <div className="dials">
        {AREAS.map((k) => {
          const a = report.areas.find((x) => x.key === k)!;
          const thin = a.score === null || a.conf < 0.4;
          const paused = s.settings.areaPriority[k] === 0;
          return (
            <button key={k} className={`dial ${thin ? "thin" : ""} ${paused ? "paused" : ""}`} onClick={() => setOpen(k)}>
              <span className="dial-label">{AREA_LABEL[k]}</span>
              <span className="dial-score num">{a.score ?? "-"}<Trend t={thin ? null : a.trend} /></span>
              <span className="dial-track"><span className="fill-x" style={{ ["--p" as string]: (a.score ?? 0) / 100 }} /><span className="dial-tick" style={{ left: `${a.target}%` }} /></span>
              <span className="dial-status">{paused ? "พักไว้" : statusLabel(a.score, a.conf)}</span>
            </button>
          );
        })}
      </div>
      <Sheet open={!!area} title={area ? AREA_LABEL[area.key] : ""} onClose={() => setOpen(null)}>
        {area && <AreaDetail a={area} b={b} />}
      </Sheet>
    </>
  );
}

function AreaDetail({ a, b }: { a: AreaResult; b: BrainApi }) {
  const { report, s, update } = b;
  const evs = Object.entries(a.ev).filter(([k, v]) => EV_LABEL[k] && v !== null).map(([k, v]) => evText(k, v as number));
  const conflicts = report.conflicts.filter((c) => c.areas.includes(a.key));
  const cands = report.candidates.filter((c) => c.area === a.key);
  const pats = report.patterns.filter((p) => PATTERN_AREAS[p.id]?.includes(a.key));
  return (
    <div className="area-detail">
      <div className="area-head">
        <span className="big-number">{a.score ?? "-"}</span>
        <span className="row-sub">เป้า {a.target} · {statusLabel(a.score, a.conf)}{a.trend !== null ? ` · 7 วันล่าสุด ${a.trend > 0 ? "+" : ""}${a.trend}` : ""}</span>
      </div>
      <div className="area-parts">
        {Object.entries(a.parts).map(([k, v]) => (
          <div key={k} className="hbar">
            <span className="hbar-label">{PART_LABEL[a.key][k] ?? k}</span>
            <span className="hbar-track"><span className="hbar-fill fill-x" style={{ ["--p" as string]: (v ?? 0) / 100 }} /></span>
            <span className="hbar-val">{v === null ? "-" : v}</span>
          </div>
        ))}
      </div>
      {evs.length > 0 && <div className="area-ev">{evs.join(" · ")}</div>}
      {conflicts.length > 0 && <div className="area-ev">ชนกัน: {conflicts.map((c) => CONFLICT_LABEL[c.id]).join(" · ")}</div>}
      {pats.length > 0 && <div className="area-ev">{pats.map((p) => p.text).join(" · ")}</div>}
      {cands.length > 0 && <div className="area-ev">ข้อเสนอ: {cands.map((c) => RULE_COPY[c.rule].short).join(" · ")}</div>}
      <div className="section-header" style={{ marginTop: 16 }}>ระดับความสำคัญ</div>
      <Segmented label="ระดับความสำคัญ" value={String(s.settings.areaPriority[a.key])} options={PRIORITY}
        onChange={(v) => update((x) => { x.settings.areaPriority = { ...x.settings.areaPriority, [a.key]: Number(v) as 0 | 1 | 2 }; })} />
      <div className="section-footer" style={{ marginTop: -12 }}>เน้น = นับน้ำหนักมากขึ้นและเสนอก่อน · พักไว้ = ไม่นับในสมดุลและไม่เสนอ (ยกเว้นเรื่องความปลอดภัย)</div>
    </div>
  );
}

// Which areas each fixed pattern talks about (patterns.ts P1-P9).
const PATTERN_AREAS: Record<string, AreaKey[]> = {
  P1: ["sleep", "consistency"], P2: ["sleep", "recovery"], P3: ["sleep", "recovery"], P4: ["leisure", "sleep"], P5: ["consistency"],
  P6: ["training", "recovery"], P7: ["voice", "recovery"], P8: ["nutrition", "recovery"], P9: ["trading", "recovery"],
};
