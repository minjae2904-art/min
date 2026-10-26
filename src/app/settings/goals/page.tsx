"use client";

import { NavBar, Section, Segmented, toast } from "@/components/ui";
import { logicalDate } from "@/lib/date";
import { targets, waterTargetMl } from "@/lib/health";
import { defaultIdentity } from "@/lib/psych";
import { play } from "@/lib/sound";
import { weightStats } from "@/lib/stats";
import { useStore } from "@/lib/store";
import { fmt, msgs } from "@/i18n";
import { rich } from "@/i18n/react";
import * as C from "@/i18n/msg/app-settings-goals";
import * as Common from "@/i18n/msg/common";

const m = msgs(C), c = msgs(Common);

export default function GoalSettings() {
  const { s, update } = useStore();
  const set = s.settings;
  const { cur: kg, measured } = weightStats(s, logicalDate());
  const t = targets(s.profile, kg, set.kcalAdjust);
  const adj = set.kcalAdjust;
  // Undo restores the adjust that was set (from a Krob Brain suggestion or earlier).
  const resetAdjust = () => {
    play("undo");
    update((st) => { st.settings.kcalAdjust = 0; });
    toast(m("goals.toast.reset"), { action: c("undo"), onAction: () => update((st) => { st.settings.kcalAdjust = adj; }) });
  };
  const auto = { work: waterTargetMl(kg, 1.25, 0), off: waterTargetMl(kg, 0, 0), tennis: waterTargetMl(kg, 0, 1.5) };

  return (
    <main className="screen">
      <NavBar title={m("goals.title")} sub={measured ? m("goals.sub.trend", { kg: kg.toFixed(1) }) : m("goals.sub.start")} />

      <Section header={m("goals.identity.header")} footer={m("goals.identity.footer")}>
        <textarea className="journal-field" style={{ margin: 0, borderRadius: 0, minHeight: 72 }} defaultValue={s.profile.identity || defaultIdentity()} onBlur={(e) => {
          const v = e.target.value.trim();
          // Leaving the default sentence untouched must not persist it as a custom identity.
          if (v === (s.profile.identity ?? "") || (v === defaultIdentity() && !s.profile.identity)) return;
          update((st) => { st.profile.identity = v || undefined; });
        }} />
      </Section>

      <Section header={m("goals.goodDay.header")} footer={m("goals.goodDay.footer")}>
        <div className="row mini-seg">
          <span className="row-main row-title">{m("goals.goodDay.label")}</span>
          <div className="row-ctrl">
            <Segmented value={String(set.goodDay)} options={[["0.6", "60%"], ["0.7", "70%"], ["0.8", "80%"], ["0.9", "90%"]]} onChange={(v) => update((st) => { st.settings.goodDay = Number(v); })} />
          </div>
        </div>
      </Section>

      <Section header={m("goals.water.header")} footer={set.waterGoalMl ? m("goals.water.fixed") : m("goals.water.auto", { work: (auto.work / 1000).toFixed(1), off: (auto.off / 1000).toFixed(1), tennis: (auto.tennis / 1000).toFixed(1) })}>
        <div className="row mini-seg">
          <span className="row-main row-title">{m("goals.water.label")}</span>
          <div className="row-ctrl lg">
            <Segmented value={String(set.waterGoalMl)} options={[["0", m("goals.water.opt.auto")], ["2500", "2.5"], ["3000", "3"], ["3500", "3.5"], ["4000", "4"]]} onChange={(v) => update((st) => { st.settings.waterGoalMl = Number(v); })} />
          </div>
        </div>
      </Section>

      <Section header={m("goals.nutrition.header")} footer={m("goals.nutrition.footer")}>
        <div className="row"><span className="row-main row-title">{m("goals.tdee")}</span><span className="row-value num">{fmt.num(t.tdee)} kcal</span></div>
        <div className="row">
          <span className="row-main row-title">{rich(m("goals.kcal"), { adj: adj !== 0 && <> <span className="row-sub" style={{ display: "inline" }}>{m("goals.kcal.adj", { sign: adj > 0 ? "+" : "", adj })}</span> <button className="link" onClick={resetAdjust}>{m("goals.kcal.reset")}</button></> })}</span>
          <span className="row-value num">{fmt.num(t.kcal)} kcal</span>
        </div>
        <div className="row"><span className="row-main row-title">{m("goals.protein")}</span><span className="row-value num">{t.protein} g</span></div>
        <div className="row"><span className="row-main row-title">{m("goals.goalKg")}</span><span className="row-value num t-clip">{m("goals.goalKg.value", { goal: s.profile.goalKg, left: (s.profile.goalKg - kg).toFixed(1) })}</span></div>
        <div className="row"><span className="row-main row-title">{m("goals.rate")}</span><span className="row-value num t-clip">{m("goals.rate.value")}</span></div>
      </Section>
    </main>
  );
}
