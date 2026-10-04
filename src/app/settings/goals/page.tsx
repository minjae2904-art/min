"use client";

import { NavBar, Section, Segmented } from "@/components/ui";
import { logicalDate } from "@/lib/date";
import { targets, waterTargetMl } from "@/lib/health";
import { DEFAULT_IDENTITY } from "@/lib/psych";
import { weightStats } from "@/lib/stats";
import { useStore } from "@/lib/store";

export default function GoalSettings() {
  const { s, update } = useStore();
  const set = s.settings;
  const kg = weightStats(s, logicalDate()).cur;
  const t = targets(s.profile, kg);
  const auto = { work: waterTargetMl(kg, 1.25, 0), off: waterTargetMl(kg, 0, 0), tennis: waterTargetMl(kg, 0, 1.5) };

  return (
    <main className="screen">
      <NavBar title="เป้าหมาย" sub={`คำนวณจากน้ำหนักแนวโน้ม ${kg.toFixed(1)} kg`} />

      <Section header="เป้าหมายตัวตน" footer="นิสัยติดทนกว่าเมื่อผูกกับตัวตน ('ฉันคือคนที่...') มากกว่าผลลัพธ์ แสดงบนหน้าวันนี้ทุกวัน">
        <textarea className="journal-field" style={{ margin: 0, borderRadius: 0, minHeight: 72 }} defaultValue={s.profile.identity || DEFAULT_IDENTITY} onBlur={(e) => { const v = e.target.value.trim(); update((st) => { st.profile.identity = v || undefined; }); }} />
      </Section>

      <Section header="วันที่ดี" footer="วันที่ทำครบตั้งแต่ % นี้ขึ้นไป นับเป็นวันที่ดี (ใช้กับ streak, กราฟ และสถิติ)">
        <div className="row mini-seg">
          <span className="row-main row-title">เกณฑ์</span>
          <div style={{ width: 220 }}>
            <Segmented value={String(set.goodDay)} options={[["0.6", "60%"], ["0.7", "70%"], ["0.8", "80%"], ["0.9", "90%"]]} onChange={(v) => update((st) => { st.settings.goodDay = Number(v); })} />
          </div>
        </div>
      </Section>

      <Section header="น้ำดื่มต่อวัน" footer={set.waterGoalMl ? "ใช้ค่าคงที่ทุกวัน" : `อัตโนมัติ: 35 ml/kg + ยิม 500 ml/ชม. + เทนนิส 750 ml/ชม. → วันทำงาน ${(auto.work / 1000).toFixed(1)} L · วันหยุด ${(auto.off / 1000).toFixed(1)} L · วันเทนนิส ${(auto.tennis / 1000).toFixed(1)} L`}>
        <div className="row mini-seg">
          <span className="row-main row-title">เป้า</span>
          <div style={{ width: 250 }}>
            <Segmented value={String(set.waterGoalMl)} options={[["0", "อัตโนมัติ"], ["2500", "2.5"], ["3000", "3"], ["3500", "3.5"], ["4000", "4"]]} onChange={(v) => update((st) => { st.settings.waterGoalMl = Number(v); })} />
          </div>
        </div>
      </Section>

      <Section header="โภชนาการ (อ้างอิง)" footer="ตัวเลขอ้างอิงสำหรับโปรแกรมเพิ่มน้ำหนัก ปรับตามน้ำหนักจริงทุกสัปดาห์ในหน้าร่างกาย">
        <div className="row"><span className="row-main row-title">TDEE (ใช้พลังงาน/วัน)</span><span className="row-value num">{t.tdee.toLocaleString()} kcal</span></div>
        <div className="row"><span className="row-main row-title">ควรกิน</span><span className="row-value num">{t.kcal.toLocaleString()} kcal</span></div>
        <div className="row"><span className="row-main row-title">โปรตีน (2 g/kg)</span><span className="row-value num">{t.protein} g</span></div>
        <div className="row"><span className="row-main row-title">เป้าน้ำหนัก</span><span className="row-value num">{s.profile.goalKg} kg (อีก {(s.profile.goalKg - kg).toFixed(1)})</span></div>
        <div className="row"><span className="row-main row-title">อัตราที่แนะนำ</span><span className="row-value num">+0.2 ถึง +0.6 kg/สัปดาห์</span></div>
      </Section>
    </main>
  );
}
