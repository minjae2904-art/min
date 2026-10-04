"use client";

import { Section } from "@/components/ui";
import { THAI_DATE, logicalDate } from "@/lib/date";
import { bmi } from "@/lib/health";
import { weightStats } from "@/lib/stats";
import { useStore } from "@/lib/store";

function Chart({ data }: { data: { kg: number; trend: number }[] }) {
  if (data.length < 2) return <div style={{ color: "var(--label2)", padding: "24px 0", textAlign: "center" }}>ชั่งน้ำหนักอย่างน้อย 2 วันเพื่อดูกราฟ</div>;
  const w = 320, h = 140, pad = 8;
  const all = data.flatMap((d) => [d.kg, d.trend]);
  const min = Math.min(...all) - 0.5, max = Math.max(...all) + 0.5;
  const x = (i: number) => pad + (i / (data.length - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - ((v - min) / (max - min)) * (h - pad * 2);
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.trend)}`).join("");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
      {data.map((d, i) => <circle key={i} cx={x(i)} cy={y(d.kg)} r={2.5} fill="var(--label3)" />)}
      <path d={line} fill="none" stroke="var(--blue)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Body() {
  const { s, update } = useStore();
  const p = s.profile;
  const { series: t, cur, rate } = weightStats(s, logicalDate());
  const toGo = p.goalKg - cur;
  const progress = Math.max(0, Math.min(1, (cur - p.startKg) / (p.goalKg - p.startKg)));

  let verdict = "ต้องมีข้อมูลอย่างน้อย 7 วัน";
  if (rate !== null) verdict = rate < 0.2 ? "ขึ้นช้า - ลองเพิ่ม 1 มื้อเล็กหรือ shake" : rate > 0.75 ? "ขึ้นเร็วไป - ลดของทอด/ของหวาน" : "อัตรากำลังดี คงเดิม";

  return (
    <main className="screen">
      <h1 className="large-title">ร่างกาย</h1>
      <div className="subtitle">เป้าหมาย {p.startKg} → {p.goalKg} kg</div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ color: "var(--label2)", fontSize: 13 }}>น้ำหนักแนวโน้ม</div>
            <div className="big-number">{cur.toFixed(1)}<span style={{ fontSize: 17, color: "var(--label2)" }}> kg</span></div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "var(--label2)", fontSize: 13 }}>อีก</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{toGo.toFixed(1)} kg</div>
          </div>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: "var(--fill)", margin: "12px 0 16px", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${progress * 100}%`, background: "var(--green)" }} />
        </div>
        <Chart data={t.slice(-30)} />
      </div>

      <Section header="สรุป" footer="เป้า +0.2 ถึง +0.6 kg/สัปดาห์ (ดูจากเส้นแนวโน้ม ไม่ใช่ตัวเลขรายวัน)">
        <div className="row"><span className="row-main row-title">7 วันล่าสุด</span><span className="row-value">{rate === null ? "-" : `${rate >= 0 ? "+" : ""}${rate.toFixed(2)} kg`}</span></div>
        <div className="row"><span className="row-main row-title">คำแนะนำ</span><span className="row-value" style={{ whiteSpace: "normal", textAlign: "right", fontSize: 15 }}>{verdict}</span></div>
        <div className="row"><span className="row-main row-title">BMI</span><span className="row-value">{bmi(cur, p.heightCm).toFixed(1)}</span></div>
        <div className="row"><span className="row-main row-title">เพิ่มจากเริ่มต้น</span><span className="row-value">{(cur - p.startKg).toFixed(1)} kg</span></div>
      </Section>

      {s.weights.length > 0 && (
        <Section header="ประวัติการชั่ง">
          {[...s.weights].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map((w) => (
            <div key={w.date} className="row">
              <span className="row-main"><div className="row-title">{w.kg.toFixed(1)} kg</div><div className="row-sub">{THAI_DATE(w.date)}</div></span>
              <button className="link" style={{ color: "var(--red)", fontSize: 15 }} onClick={() => update((st) => { st.weights = st.weights.filter((x) => x.date !== w.date); })}>ลบ</button>
            </div>
          ))}
        </Section>
      )}
    </main>
  );
}
