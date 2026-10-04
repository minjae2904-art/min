"use client";

import { useState } from "react";
import { age, targets, type Profile } from "@/lib/health";
import { Section, Segmented } from "./ui";

// Used for first-run setup and for editing in Settings.
export function ProfileForm({ initial, submitLabel, onSave }: { initial: Profile; submitLabel: string; onSave: (p: Profile) => void }) {
  const [p, setP] = useState(initial);
  // Uncontrolled so typing "67." keeps the dot.
  const num = (k: "heightCm" | "startKg" | "goalKg") => (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: parseFloat(e.target.value) || 0 });
  const valid = p.heightCm > 100 && p.startKg > 30 && p.goalKg > 30 && !!p.birth;
  const t = targets(p, p.startKg || 60);

  // Plain function (not a component) so inputs keep focus between renders.
  const row = (label: string, children: React.ReactNode) => (
    <label className="row form-row">
      <span className="row-title" style={{ width: 120, flexShrink: 0 }}>{label}</span>
      {children}
    </label>
  );

  return (
    <>
      <Section header="ข้อมูลพื้นฐาน">
        {row("ชื่อเล่น", <input className="inline-input" value={p.name} placeholder="ไม่บังคับ" onChange={(e) => setP({ ...p, name: e.target.value })} />)}
        {row("วันเกิด", <input className="inline-input" type="date" value={p.birth} onChange={(e) => setP({ ...p, birth: e.target.value })} />)}
        <div className="row form-row">
          <span className="row-title" style={{ width: 120, flexShrink: 0 }}>เพศ</span>
          <div style={{ flex: 1 }}>
            <Segmented value={p.sex} options={[["m", "ชาย"], ["f", "หญิง"]]} onChange={(v) => setP({ ...p, sex: v })} />
          </div>
        </div>
        {row("ส่วนสูง (cm)", <input className="inline-input" inputMode="decimal" defaultValue={initial.heightCm || ""} onChange={num("heightCm")} />)}
      </Section>
      <Section header="เป้าหมาย" footer={valid ? `อายุ ${age(p.birth)} ปี · TDEE ~${t.tdee.toLocaleString()} kcal · กินราว ${t.kcal.toLocaleString()} kcal/วัน · โปรตีน ~${t.protein} g` : "กรอกให้ครบเพื่อคำนวณ"}>
        {row("น้ำหนักเริ่ม (kg)", <input className="inline-input" inputMode="decimal" defaultValue={initial.startKg || ""} onChange={num("startKg")} />)}
        {row("น้ำหนักเป้า (kg)", <input className="inline-input" inputMode="decimal" defaultValue={initial.goalKg || ""} onChange={num("goalKg")} />)}
      </Section>
      <button className="btn" disabled={!valid} style={{ opacity: valid ? 1 : 0.5 }} onClick={() => onSave({ ...p, setup: true })}>{submitLabel}</button>
    </>
  );
}
