"use client";

import { useState } from "react";
import { AiCoach } from "@/components/AiCoach";
import { CountUp, Section, Segmented, toast } from "@/components/ui";
import { logicalDate } from "@/lib/date";
import { GYM_LABEL, PERSONALITY_LABEL } from "@/lib/rotation";
import { MEAL2_LABEL } from "@/lib/schedule";
import { play } from "@/lib/sound";
import { badgeCatalog } from "@/lib/psych";
import { insights, rangeStats, toCsv } from "@/lib/stats";
import { useStore } from "@/lib/store";

const DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const pct = (v: number) => Math.round(v * 100);

function Bars({ values, goal, max, goodAt }: { values: (number | null)[]; goal?: number; max: number; goodAt?: number }) {
  return (
    <div className="chart">
      {values.map((v, i) => (
        <span key={i} className={`bar ${v === null ? "muted" : goodAt !== undefined && v >= goodAt ? "good" : ""}`} style={{ height: `${v === null ? 2 : Math.max(2, Math.min(100, (v / max) * 100))}%` }} />
      ))}
      {goal !== undefined && <span className="goal" style={{ bottom: `${Math.min(100, (goal / max) * 100)}%` }} />}
    </div>
  );
}

function HBar({ label, value, max, text, color }: { label: string; value: number; max: number; text: string; color?: string }) {
  return (
    <div className="hbar">
      <span className="hbar-label">{label}</span>
      <span className="hbar-track"><span className="hbar-fill" style={{ width: `${max ? (value / max) * 100 : 0}%`, background: color }} /></span>
      <span className="hbar-val">{text}</span>
    </div>
  );
}

export default function Stats() {
  const { s } = useStore();
  const [n, setN] = useState("7");
  const today = logicalDate();
  const r = rangeStats(s, today, Number(n));
  const tips = insights(r, s);
  const level = (v: number) => (v <= 0 ? "" : v < 0.4 ? "l1" : v < 0.6 ? "l2" : v < s.settings.goodDay ? "l3" : "l4");
  const maxRot = Math.max(1, ...Object.values(r.rotation));
  const maxPer = Math.max(1, ...Object.values(r.persona));
  const meal2Total = r.meal2.A + r.meal2.B + r.meal2.C;
  const badges = badgeCatalog(s, today);

  // Heatmap: always 13 weeks ending today, aligned so rows are weekdays.
  const heat = rangeStats(s, today, 91).series;
  const pad = new Date(heat[0].date + "T12:00:00").getDay();

  function exportCsv() {
    play("done");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([toCsv(r)], { type: "text/csv" }));
    a.download = `krob-${n}d-${today}.csv`;
    a.click();
    toast("ดาวน์โหลด CSV แล้ว");
  }

  return (
    <main className="screen">
      <h1 className="large-title">สถิติ</h1>
      <div className="subtitle">บันทึกแล้ว {r.loggedDays} จาก {r.n} วัน</div>

      <Segmented value={n} options={[["7", "7 วัน"], ["30", "30 วัน"], ["90", "90 วัน"]]} onChange={setN} />

      <AiCoach />

      <div className="grid2">
        <div className="stat">
          <div className="stat-label">ความครบเฉลี่ย</div>
          <div className="stat-value"><CountUp value={pct(r.avgScore)} /><small>%</small></div>
          <div className="stat-hint">วันที่ดี {r.goodDays} วัน (≥{pct(s.settings.goodDay)}%)</div>
        </div>
        <div className="stat">
          <div className="stat-label">ทำตรงเวลา</div>
          <div className="stat-value">{r.onTimeRate === null ? "-" : <><CountUp value={pct(r.onTimeRate)} /><small>%</small></>}</div>
          <div className="stat-hint">ภายใน 30 นาทีจากเวลาที่ตั้ง</div>
        </div>
        <div className="stat">
          <div className="stat-label">น้ำเฉลี่ย/วัน</div>
          <div className="stat-value"><CountUp value={r.waterAvg / 1000} decimals={1} /><small> ลิตร</small></div>
          <div className="stat-hint">ถึงเป้า {r.waterMetDays}/{r.loggedDays} วัน</div>
        </div>
        <div className="stat">
          <div className="stat-label">ยิม/สัปดาห์</div>
          <div className="stat-value"><CountUp value={r.perWeek} decimals={1} /><small> ครั้ง</small></div>
          <div className="stat-hint">รวม {r.sessions} ครั้ง · เทนนิส {r.tennis}</div>
        </div>
        <div className="stat">
          <div className="stat-label">น้ำหนัก (แนวโน้ม)</div>
          <div className="stat-value">{r.weight ? <>{r.weight.change >= 0 ? "+" : ""}<CountUp value={r.weight.change} decimals={1} /><small> kg</small></> : "-"}</div>
          <div className="stat-hint">{r.weight ? `${r.weight.perWeek >= 0 ? "+" : ""}${r.weight.perWeek.toFixed(2)} kg/สัปดาห์ · ชั่ง ${r.weight.weighIns} ครั้ง` : "ยังไม่มีข้อมูลชั่ง"}</div>
        </div>
        <div className="stat">
          <div className="stat-label">ฝึกบุคลิกภาพ</div>
          <div className="stat-value"><CountUp value={Object.values(r.persona).reduce((a, b) => a + b, 0)} /><small> ครั้ง</small></div>
          <div className="stat-hint">ในช่วง {r.n} วัน</div>
        </div>
      </div>

      {r.feel.n > 0 && (
        <Section header={`ความรู้สึกเฉลี่ย (เช็กอิน ${r.feel.n} วัน)`}>
          <div style={{ padding: "8px 16px" }}>
            <HBar label="การนอน" value={r.feel.sleep ?? 0} max={5} text={(r.feel.sleep ?? 0).toFixed(1)} color="var(--purple)" />
            <HBar label="พลังงาน" value={r.feel.energy ?? 0} max={5} text={(r.feel.energy ?? 0).toFixed(1)} color="var(--orange)" />
            <HBar label="อารมณ์" value={r.feel.mood ?? 0} max={5} text={(r.feel.mood ?? 0).toFixed(1)} color="var(--pink)" />
          </div>
        </Section>
      )}

      <Section header="การวิเคราะห์">
        {tips.map((t) => <div key={t} className="insight"><span className="insight-dot" /><span>{t}</span></div>)}
      </Section>

      <Section header="ความครบรายวัน" footer={`เส้นประ = เป้าวันที่ดี ${pct(s.settings.goodDay)}% · สีเขียว = ผ่านเป้า`}>
        <div style={{ padding: 16 }}>
          <Bars values={r.series.map((x) => (x.logged ? x.score : null))} goal={s.settings.goodDay} max={1} goodAt={s.settings.goodDay} />
          <div className="chart-axis"><span>{r.dates[0].slice(5)}</span><span>วันนี้</span></div>
        </div>
      </Section>

      <Section header="น้ำดื่มรายวัน" footer="เส้นประ = เป้าเฉลี่ย">
        <div style={{ padding: 16 }}>
          <Bars
            values={r.series.map((x) => (x.logged ? x.water : null))}
            goal={r.series.reduce((a, x) => a + x.goal, 0) / r.series.length}
            max={Math.max(4000, ...r.series.map((x) => x.water))}
            goodAt={r.series.reduce((a, x) => a + x.goal, 0) / r.series.length}
          />
          <div className="chart-axis"><span>{r.dates[0].slice(5)}</span><span>วันนี้</span></div>
        </div>
      </Section>

      <Section header="ปฏิทินความครบ 13 สัปดาห์">
        <div style={{ padding: 16 }}>
          <div className="heatmap" style={{ gridTemplateColumns: `repeat(${Math.ceil((heat.length + pad) / 7)}, 1fr)` }}>
            {Array.from({ length: pad }, (_, i) => <span key={`p${i}`} style={{ visibility: "hidden" }} />)}
            {heat.map((x) => <span key={x.date} className={`${level(x.logged ? x.score : 0)} ${x.date === today ? "today" : ""}`} title={`${x.date} ${pct(x.score)}%`} />)}
          </div>
        </div>
      </Section>

      <Section header="เฉลี่ยตามวันในสัปดาห์">
        <div style={{ padding: "8px 16px" }}>
          {r.weekday.map((v, i) => <HBar key={i} label={DOW[i]} value={v ?? 0} max={1} text={v === null ? "-" : `${pct(v)}%`} color={v !== null && v >= s.settings.goodDay ? "var(--green)" : undefined} />)}
        </div>
      </Section>

      <Section header="รายการที่ทำ (พลาดบ่อยอยู่บน)" footer="ตัวเลขขวา = ทำแล้ว/วันที่มีรายการนี้ · ช้าเฉลี่ยนับจากเวลาที่ตั้ง">
        {r.items.length === 0 && <div className="row"><span className="row-main row-sub">ยังไม่มีข้อมูล</span></div>}
        {r.items.map((i) => (
          <div key={i.id} className="row">
            <span className="row-main">
              <div className="row-title" style={{ fontSize: 16 }}>{i.title}</div>
              <div className="row-sub">{i.avgDelay === null ? "ยังไม่มีเวลาที่บันทึก" : i.avgDelay <= 0 ? `ก่อนเวลาเฉลี่ย ${-i.avgDelay} นาที` : `ช้าเฉลี่ย ${i.avgDelay} นาที`}</div>
            </span>
            <span className="row-value num" style={{ color: i.done / i.planned < 0.6 ? "var(--red)" : undefined }}>{i.done}/{i.planned}</span>
          </div>
        ))}
      </Section>

      <Section header="ยิมตามส่วน">
        <div style={{ padding: "8px 16px" }}>
          {Object.entries(r.rotation).map(([k, v]) => <HBar key={k} label={`${k} ${GYM_LABEL[k].split(" ")[0]}`} value={v} max={maxRot} text={`${v}`} />)}
        </div>
      </Section>

      <Section header="ฝึกบุคลิกภาพตามหัวข้อ">
        <div style={{ padding: "8px 16px" }}>
          {Object.entries(r.persona).map(([k, v]) => <HBar key={k} label={PERSONALITY_LABEL[k].split(" ")[0]} value={v} max={maxPer} text={`${v}`} color="var(--teal)" />)}
        </div>
      </Section>

      <Section header="เทรด" footer="ไม่มีจังหวะแล้วไม่เข้า นับเป็นวันที่ทำตามแผน">
        <div className="row"><span className="row-main row-title">วันที่เช็กแผนเทรด</span><span className="row-value num">{r.trade.days}/{r.loggedDays}</span></div>
        <div className="row"><span className="row-main row-title">จำนวนไม้รวม</span><span className="row-value num">{r.trade.count}</span></div>
        <div className="row"><span className="row-main row-title">กำไร / ขาดทุน / เสมอ</span><span className="row-value num">{r.trade.win} / {r.trade.loss} / {r.trade.be}</span></div>
        <div className="row"><span className="row-main row-title">Win rate (ปิดแล้ว)</span><span className="row-value num">{r.trade.winRate === null ? "-" : `${pct(r.trade.winRate)}%`}</span></div>
        <div className="row"><span className="row-main row-title">ไม่มีจังหวะ ไม่เข้า</span><span className="row-value num">{r.trade.skip} วัน</span></div>
      </Section>

      {meal2Total > 0 && (
        <Section header="มื้อ 2 (พักกะ)">
          <div style={{ padding: "8px 16px" }}>
            {(["A", "B", "C"] as const).map((k) => <HBar key={k} label={k} value={r.meal2[k]} max={meal2Total} text={`${r.meal2[k]}`} color="var(--orange)" />)}
            <div className="row-sub" style={{ paddingTop: 6 }}>A {MEAL2_LABEL.A} · B {MEAL2_LABEL.B} · C {MEAL2_LABEL.C}</div>
          </div>
        </Section>
      )}

      <Section header={`เหรียญ ${badges.filter((b) => b.earned).length}/${badges.length}`}>
        <div className="badges">
          {badges.map((b) => (
            <div key={b.id} className={`badge-card ${b.earned ? "earned" : ""}`} title={b.desc}>
              <div className="badge-medal"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="9" r="6" /><path d="M8.5 14L7 22l5-3 5 3-1.5-8" /></svg></div>
              <div className="badge-title">{b.title}</div>
              <div className="badge-desc">{b.desc}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section footer="ไฟล์ CSV เปิดใน Excel / Google Sheets ได้">
        <button className="row" onClick={exportCsv}><span className="row-main row-title link">ส่งออกข้อมูล {r.n} วัน (CSV)</span></button>
      </Section>
    </main>
  );
}
