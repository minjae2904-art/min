"use client";

import { IconCheck, IconSound } from "@/components/Icons";
import { NavBar, Section, Segmented, Switch, Tile } from "@/components/ui";
import { ACCENT_IDS, type Accent, type TextSize } from "@/lib/model";
import { configureFeedback, haptic, play, type Sound } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { langArr, langObj, msgs } from "@/i18n";
import { useLang } from "@/i18n/react";
import * as C from "@/i18n/msg/app-settings-appearance";

const m = msgs(C);
const ACCENT_LABEL: Record<Accent, string> = langObj(() => ({
  blue: m("appearance.accent.blue"), green: m("appearance.accent.green"), orange: m("appearance.accent.orange"), pink: m("appearance.accent.pink"),
  purple: m("appearance.accent.purple"), teal: m("appearance.accent.teal"), indigo: m("appearance.accent.indigo"), mint: m("appearance.accent.mint"),
}));
const TEXT_SIZE: [TextSize, string][] = langArr(() => [["sm", m("appearance.size.sm")], ["md", m("appearance.size.md")], ["lg", m("appearance.size.lg")], ["xl", m("appearance.size.xl")]]);
const PREVIEW: [Sound, string][] = langArr(() => [
  ["tap", m("appearance.sound.tap")], ["nav", m("appearance.sound.nav")], ["toggle", m("appearance.sound.toggle")], ["done", m("appearance.sound.done")],
  ["water", m("appearance.sound.water")], ["complete", m("appearance.sound.complete")], ["undo", m("appearance.sound.undo")], ["error", m("appearance.sound.error")],
]);

export default function AppearanceSettings() {
  const { s, update } = useStore();
  useLang(); // re-render on a language switch (module-level label tables)
  const set = s.settings;

  return (
    <main className="screen">
      <NavBar title={m("appearance.title")} />

      <Section header={m("appearance.theme")}>
        <div className="row">
          <div style={{ flex: 1 }}>
            <Segmented label={m("appearance.theme")} value={set.theme} options={[["auto", m("appearance.theme.auto")], ["light", m("appearance.theme.light")], ["dark", m("appearance.theme.dark")]]} onChange={(v) => update((st) => { st.settings.theme = v; })} />
          </div>
        </div>
      </Section>

      <Section header={m("appearance.night.header")} footer={m("appearance.night.footer")}>
        <div className="row">
          <span className="row-main">
            <div className="row-title">{m("appearance.night.title")}</div>
            <div className="row-sub">{m("appearance.night.sub")}</div>
          </span>
          <Switch label={m("appearance.night.title")} on={set.night} onChange={(v) => update((st) => { st.settings.night = v; })} />
        </div>
      </Section>

      <Section header={m("appearance.accent.header")} footer={ACCENT_LABEL[set.accent]}>
        <div className="row">
          <div className="color-dots">
            {ACCENT_IDS.map((a) => (
              <button key={a} aria-label={ACCENT_LABEL[a]} aria-pressed={set.accent === a} className={`color-dot sw-${a} ${set.accent === a ? "on" : ""}`} onClick={() => { play("tap"); update((st) => { st.settings.accent = a; }); }}>
                {set.accent === a && <IconCheck size={14} weight={3} />}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section header={m("appearance.size.header")} footer={m("appearance.size.footer")}>
        <div className="row">
          <div className="row-main">
            <Segmented label={m("appearance.size.header")} value={set.textSize} options={TEXT_SIZE} onChange={(v) => update((st) => { st.settings.textSize = v; })} />
          </div>
        </div>
        <div className="row">
          <span className="row-time">13:00</span>
          <span className="row-main row-title">{m("appearance.size.sample")}</span>
        </div>
      </Section>

      <Section header={m("appearance.motion.header")}>
        <div className="row">
          <span className="row-main">
            <div className="row-title">{m("appearance.motion.title")}</div>
            <div className="row-sub">{m("appearance.motion.sub")}</div>
          </span>
          <Switch label={m("appearance.motion.title")} on={set.reduceMotion} onChange={(v) => update((st) => { st.settings.reduceMotion = v; })} />
        </div>
      </Section>

      <Section header={m("appearance.haptics.header")} footer={m("appearance.haptics.footer")}>
        <div className="row">
          <span className="row-main row-title">{m("appearance.haptics.title")}</span>
          <Switch label={m("appearance.haptics.title")} on={set.haptics} onChange={(v) => update((st) => { st.settings.haptics = v; })} />
        </div>
        {set.haptics && <button className="row" onClick={() => haptic([12, 60, 12])}><span className="row-main row-title link">{m("appearance.haptics.test")}</span></button>}
      </Section>

      <Section header={m("appearance.sound.header")}>
        <div className="row has-tile">
          <Tile color="var(--pink)"><IconSound size={18} /></Tile>
          <span className="row-main row-title">{m("appearance.sound.title")}</span>
          <Switch label={m("appearance.sound.title")} on={set.sound} onChange={(v) => update((st) => { st.settings.sound = v; })} />
        </div>
        {set.sound && (
          <div className="row">
            <span className="row-main row-title">{m("appearance.vol")}</span>
            <div className="row-ctrl sm">
              <Segmented label={m("appearance.vol")} value={String(set.soundVol)} options={[["0.5", m("appearance.vol.soft")], ["1", m("appearance.vol.normal")], ["1.6", m("appearance.vol.loud")]]} onChange={(v) => { update((st) => { st.settings.soundVol = Number(v); }); configureFeedback(set.sound, Number(v), set.haptics); play("done"); }} />
            </div>
          </div>
        )}
      </Section>

      {set.sound && (
        <Section header={m("appearance.preview")}>
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            {PREVIEW.map(([k, label]) => <button key={k} className="chip" onClick={() => play(k)}>{label}</button>)}
          </div>
        </Section>
      )}
    </main>
  );
}
