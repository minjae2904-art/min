"use client";

// Language control (Round E): Settings (first section) and the onboarding screen. Switches instantly, no reload.
import { LANGS, LANG_CONTROL_LABEL, LANG_NATIVE, deviceLang, msgs, type LangPref } from "@/i18n";
import { useLang } from "@/i18n/react";
import * as Common from "@/i18n/msg/common";
import { useStore } from "@/lib/store";
import { Section, Segmented } from "./ui";

const c = msgs(Common);

export function LangPicker() {
  const { s, update } = useStore();
  useLang(); // re-render on a switch (also outside the keyed remount, on onboarding)
  const v = s.settings.lang;
  const options: [LangPref, string][] = [["auto", c("lang.auto")], ...LANGS.map((l): [LangPref, string] => [l, LANG_NATIVE[l]])];
  return (
    <Section header={LANG_CONTROL_LABEL} footer={v === "auto" ? c("lang.autoNow", { lang: LANG_NATIVE[deviceLang()] }) : undefined}>
      <div className="row">
        <div style={{ flex: 1 }}>
          <Segmented label={LANG_CONTROL_LABEL} value={v} options={options} onChange={(x) => update((st) => { st.settings.lang = x; })} />
        </div>
      </div>
    </Section>
  );
}
