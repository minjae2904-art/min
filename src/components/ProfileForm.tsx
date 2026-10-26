"use client";

import { useState } from "react";
import { fmt, msgs } from "@/i18n";
import { useLang } from "@/i18n/react";
import * as C from "@/i18n/msg/components";
import * as Common from "@/i18n/msg/common";
import { age, targets, type Profile } from "@/lib/health";
import { Section, Segmented } from "./ui";

const m = msgs(C), c = msgs(Common);

// Used for first-run setup and for editing in Settings.
export function ProfileForm({ initial, submitLabel, onSave }: { initial: Profile; submitLabel: string; onSave: (p: Profile) => void }) {
  useLang(); // the onboarding form is outside the keyed subtree: re-render on a language switch
  const [p, setP] = useState(initial);
  // Uncontrolled so typing "67." keeps the dot.
  const num = (k: "heightCm" | "startKg" | "goalKg") => (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: parseFloat(e.target.value) || 0 });
  const valid = p.heightCm > 100 && p.startKg > 30 && p.goalKg > 30 && !!p.birth;
  const t = targets(p, p.startKg || 60); // profile preview: base target without settings.kcalAdjust

  // Plain function (not a component) so inputs keep focus between renders.
  const row = (label: string, children: React.ReactNode) => (
    <label className="row form-row">
      <span className="row-title form-label wide">{label}</span>
      {children}
    </label>
  );

  return (
    <>
      <Section header={m("profileForm.basics")}>
        {row(m("profileForm.name"), <input className="inline-input" value={p.name} placeholder={c("optional")} onChange={(e) => setP({ ...p, name: e.target.value })} />)}
        {row(m("profileForm.birth"), <input className="inline-input" type="date" value={p.birth} onChange={(e) => setP({ ...p, birth: e.target.value })} />)}
        <div className="row form-row">
          <span className="row-title form-label wide">{m("profileForm.sex")}</span>
          <div style={{ flex: 1 }}>
            <Segmented value={p.sex} options={[["m", m("profileForm.male")], ["f", m("profileForm.female")]]} onChange={(v) => setP({ ...p, sex: v })} />
          </div>
        </div>
        {row(m("profileForm.height"), <input className="inline-input" inputMode="decimal" defaultValue={initial.heightCm || ""} onChange={num("heightCm")} />)}
      </Section>
      <Section header={m("profileForm.goals")} footer={valid ? m("profileForm.summary", { age: age(p.birth), tdee: fmt.num(t.tdee), kcal: fmt.num(t.kcal), protein: t.protein }) : m("profileForm.incomplete")}>
        {row(m("profileForm.startKg"), <input className="inline-input" inputMode="decimal" defaultValue={initial.startKg || ""} onChange={num("startKg")} />)}
        {row(m("profileForm.goalKg"), <input className="inline-input" inputMode="decimal" defaultValue={initial.goalKg || ""} onChange={num("goalKg")} />)}
      </Section>
      <button className="btn" disabled={!valid} onClick={() => onSave({ ...p, setup: true })}>{submitLabel}</button>
    </>
  );
}
