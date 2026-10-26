"use client";

import { useState } from "react";
import { IconLock } from "@/components/Icons";
import { PinPad } from "@/components/PinPad";
import { NavBar, Section, Segmented, Switch, Tile, toast } from "@/components/ui";
import { msgs } from "@/i18n";
import * as P from "@/i18n/msg/app-settings-privacy";
import { hashPin } from "@/lib/pin";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";

// Flows: change PIN (old -> new -> confirm), turn PIN on (new -> confirm), turn PIN off (current PIN).
type Step = { flow: "change" | "on" | "off"; stage: "old" | "new" | "confirm"; old?: string; next?: string; len: number };

const m = msgs(P);
const savedLen = () => { try { return Number(localStorage.getItem("krob-pinlen")) || 6; } catch { return 6; } };

export default function PrivacySettings() {
  const { s, update, auth } = useStore();
  const [step, setStep] = useState<Step | null>(null);
  const set = s.settings;
  const server = auth.mode === "server";

  async function finish(pin: string, st: Step): Promise<boolean> {
    if (st.flow === "off") {
      const err = await auth.disablePin(pin);
      if (err) { play("error"); toast(err); return false; }
      play("toggle");
      toast(m("privacy.toast.off"));
      setStep(null);
      return true;
    }
    if (server) {
      const err = await auth.changePin(st.old ?? "", pin);
      if (err) { play("error"); toast(err); setStep(null); return false; }
      try { localStorage.setItem("krob-pinlen", String(st.len)); } catch {}
    } else {
      const h = await hashPin(pin);
      update((x) => { x.settings.pinHash = h; x.settings.pinLen = st.len; });
    }
    play("complete");
    toast(st.flow === "on" ? m("privacy.toast.on") : m("privacy.toast.changed"));
    setStep(null);
    return true;
  }

  if (step) {
    const title = step.flow === "off" ? m("privacy.pad.off") : step.stage === "old" ? (step.flow === "on" ? m("privacy.pad.oldOn") : m("privacy.pad.old")) : step.stage === "new" ? m("privacy.pad.new", { n: step.len }) : m("privacy.pad.confirm");
    return (
      <>
        <PinPad
          key={step.flow + step.stage + step.len}
          title={title}
          length={step.flow === "off" || step.stage === "old" ? (server ? auth.pinLen ?? savedLen() : set.pinLen) : step.len}
          onCancel={() => setStep(null)}
          onSubmit={async (pin) => {
            if (step.flow === "off") return finish(pin, step);
            if (step.stage === "old") { play("tap"); setStep({ ...step, stage: "new", old: pin }); return true; }
            if (step.stage === "new") { play("tap"); setStep({ ...step, stage: "confirm", next: pin }); return true; }
            if (pin !== step.next) { play("error"); setStep({ ...step, stage: "new", next: undefined }); toast(m("privacy.toast.mismatch")); return false; }
            return finish(pin, step);
          }}
        />
        {step.stage === "new" && step.flow !== "off" && (
          <div className="pin-extra">
            <button className="link" onClick={() => setStep({ ...step, len: step.len === 6 ? 4 : 6 })}>{step.len === 6 ? m("privacy.len.4") : m("privacy.len.6")}</button>
          </div>
        )}
      </>
    );
  }

  const lockRow = (
    <div className="row">
      <span className="row-main row-title">{m("privacy.lock.title")}</span>
      <div className="row-ctrl sm">
        <Segmented label={m("privacy.lock.title")} value={String(set.lockAfterMin)} options={[["0", m("privacy.lock.now")], ["1", m("privacy.lock.m1")], ["5", m("privacy.lock.m5")], ["15", m("privacy.lock.m15")]]} onChange={(v) => update((x) => { x.settings.lockAfterMin = Number(v); })} />
      </div>
    </div>
  );

  return (
    <main className="screen">
      <NavBar title={m("privacy.nav.title")} />

      {server ? (
        <>
          <Section footer={auth.pinOff
            ? m("privacy.server.footerOff")
            : m("privacy.server.footerOn")}>
            <div className="row has-tile">
              <Tile color={auth.pinOff ? "var(--gray)" : "var(--red)"}><IconLock size={18} /></Tile>
              <span className="row-main">
                <div className="row-title">{m("privacy.server.usePin")}</div>
                <div className="row-sub">{auth.pinOff ? m("privacy.server.stateOff") : m("privacy.server.stateOn")}</div>
              </span>
              {/* Turning the PIN back on still needs the current one (the hash is kept while off). */}
              <Switch label={m("privacy.server.usePin")} on={!auth.pinOff} onChange={(v) => v ? setStep({ flow: "on", stage: auth.hasPin ? "old" : "new", len: savedLen() }) : setStep({ flow: "off", stage: "old", len: savedLen() })} />
            </div>
            {!auth.pinOff && <button className="row" onClick={() => setStep({ flow: "change", stage: "old", len: savedLen() })}><span className="row-main row-title link">{m("privacy.server.change")}</span></button>}
          </Section>

          {!auth.pinOff && (
            <Section header={m("privacy.conv.header")} footer={set.pinOnOpen
              ? m("privacy.conv.footerOn")
              : m("privacy.conv.footerOff")}>
              <div className="row">
                <span className="row-main row-title">{m("privacy.conv.everyOpen")}</span>
                <Switch label={m("privacy.conv.everyOpen")} on={set.pinOnOpen} onChange={(v) => update((x) => { x.settings.pinOnOpen = v; })} />
              </div>
              {set.pinOnOpen && lockRow}
            </Section>
          )}
        </>
      ) : (
        <Section footer={m("privacy.local.footer")}>
          <div className="row has-tile">
            <Tile color="var(--red)"><IconLock size={18} /></Tile>
            <span className="row-main row-title">{m("privacy.local.lock")}</span>
            <Switch label={m("privacy.local.lock")} on={!!set.pinHash} onChange={(v) => v ? setStep({ flow: "on", stage: "new", len: set.pinLen }) : update((x) => { x.settings.pinHash = null; })} />
          </div>
          {set.pinHash && lockRow}
        </Section>
      )}
    </main>
  );
}
