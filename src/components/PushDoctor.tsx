"use client";

import { useCallback, useEffect, useState } from "react";
import { fmt, langObj, msgs } from "@/i18n";
import * as C from "@/i18n/msg/components";
import { Section, toast } from "@/components/ui";
import { askPermission, claimHost, closeNotifications, collectFacts, disablePush, enablePush, prefetchPush, readHeal, testPush, waitForPush, type HealAction, type HealRecord } from "@/lib/push";
import { firstFailing, pushSteps, type Facts, type StepState } from "@/lib/push-steps";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";

const m = msgs(C);
const STATE_LABEL: Record<StepState, string> = langObj(() => ({
  ok: m("pushDoctor.state.ok"), fail: m("pushDoctor.state.fail"), warn: m("pushDoctor.state.warn"), wait: m("pushDoctor.state.wait"), skip: m("pushDoctor.state.skip"),
}));
const HEAL_LABEL: Record<HealAction, string> = langObj(() => ({
  none: m("pushDoctor.heal.none"), posted: m("pushDoctor.heal.posted"), resubscribed: m("pushDoctor.heal.resubscribed"),
  "need-tap": m("pushDoctor.heal.needTap"), error: m("pushDoctor.heal.error"), enabled: m("pushDoctor.heal.enabled"),
}));
type Test = { st: Facts["test"]; msg?: string };

// Step-by-step notification setup check: names the first failing step and its Thai fix, with one button per fix.
export function PushDoctor() {
  const { auth } = useStore();
  const [facts, setFacts] = useState<Facts | null>(null);
  const [test, setTest] = useState<Test>({ st: "idle" });
  const [busy, setBusy] = useState(false);
  const [heal, setHeal] = useState<HealRecord | null>(null);

  const check = useCallback(async () => {
    const f = await collectFacts(auth.token, { mode: auth.mode, reason: auth.reason }).catch(() => null);
    if (f) setFacts(f);
    setHeal(readHeal());
  }, [auth.token, auth.mode, auth.reason]);
  useEffect(() => {
    const t = setTimeout(() => { void prefetchPush().catch(() => null).then(check); }, 0);
    return () => clearTimeout(t);
  }, [check]);

  const steps = facts ? pushSteps({ ...facts, test: test.st, testMsg: test.msg }) : null;
  const first = steps ? firstFailing(steps) : undefined;
  const todo = steps?.filter((s) => s.state === "fail" || s.state === "warn").length ?? 0;
  const waiting = !steps || steps.some((s) => s.state === "wait");
  const routeFail = steps?.find((s) => s.id === "route")?.state === "fail";
  const f = facts;
  const deviceOk = !!f && f.support && (!f.ios || f.standalone) && f.token;
  const showEnable = deviceOk && (f.permission === "default" || f.sub === "none");
  const showRedo = deviceOk && (f.sub === "mismatch" || f.saved === "no" || test.st === "sent");
  const showClaim = !!f && routeFail && f.saved === "yes";
  const showTest = !!f && f.saved === "yes";
  const pushOn = !!f && (f.sub === "ok" || f.sub === "unverified" || f.sub === "mismatch");

  const enable = async (force: boolean) => {
    const perm = askPermission(); // first statement: iOS shows the prompt only inside the tap
    play("tap");
    setBusy(true);
    const r = await enablePush(auth.token, perm, { force });
    if (r.ok) { play("complete"); toast(m("pushDoctor.toast.on")); setTest({ st: "idle" }); }
    else { play("error"); toast(r.msg, { ms: 6000 }); }
    await check();
    setBusy(false);
  };
  const claim = async () => {
    play("tap");
    setBusy(true);
    const ok = await claimHost(auth.token);
    if (ok) { play("complete"); toast(m("pushDoctor.toast.claimed")); } else { play("error"); toast(m("pushDoctor.toast.claimFail")); }
    await check();
    setBusy(false);
  };
  const sendTest = async () => {
    play("tap");
    setTest({ st: "sending" });
    await closeNotifications("test");
    const r = await testPush(auth.token);
    if (!r.ok) return setTest({ st: "error", msg: r.msg });
    if (!r.devices) return setTest({ st: "none" });
    if (!r.sent) { setTest({ st: "error", msg: m("pushDoctor.test.noApple") }); return void check(); }
    setTest({ st: (await waitForPush("test", 20_000)) ? "received" : "sent" });
  };
  const off = async () => {
    play("toggle");
    setBusy(true);
    await disablePush(auth.token).catch(() => {});
    toast(m("pushDoctor.toast.off"));
    setTest({ st: "idle" });
    await check();
    setBusy(false);
  };
  const recheck = async () => { play("tap"); setBusy(true); setFacts(null); await check(); setBusy(false); };

  const footer = heal
    ? m("pushDoctor.footer.heal", { at: fmt.dayMonthClock(heal.at), action: HEAL_LABEL[heal.action] ?? heal.action })
    : m("pushDoctor.footer.idle");

  return (
    <>
      <Section header={m("pushDoctor.header")} footer={footer}>
        <div className="row doctor-head" role="status">
          <span className={`step-dot ${waiting && !first ? "wait" : first ? first.state : "ok"}`} aria-hidden />
          <span className="row-main">
            <span className="row-title">{!steps ? m("pushDoctor.checking") : first ? m("pushDoctor.todo", { n: todo }) : waiting ? m("pushDoctor.checking") : m("pushDoctor.ready")}</span>
            {first?.fix && <span className="row-sub doctor-fix">{first.fix}</span>}
            {steps && !first && !waiting && <span className="row-sub">{m("pushDoctor.badge")}</span>}
          </span>
        </div>
        {steps?.map((s) => (
          <div key={s.id} className={`row step-row is-${s.state}`}>
            <span className={`step-dot ${s.state}`} aria-hidden />
            <span className="sr-only">{STATE_LABEL[s.state]}: </span>
            <span className="row-main">
              <span className="row-title">{s.label}</span>
              <span className="row-sub">{s.fix && s.state !== "skip" ? m("pushDoctor.fix", { fix: s.fix }) : s.detail}</span>
            </span>
          </div>
        ))}
      </Section>

      <div className="doctor-actions">
        {showEnable && <button className="btn" disabled={busy} onClick={() => void enable(false)}>{m("pushDoctor.btn.enable")}</button>}
        {showRedo && <button className={showEnable ? "btn secondary" : "btn"} disabled={busy} onClick={() => void enable(f?.sub === "mismatch" || test.st === "sent")}>{m("pushDoctor.btn.redo")}</button>}
        {showClaim && <button className="btn" disabled={busy} onClick={() => void claim()}>{m("pushDoctor.btn.claim")}</button>}
        {showTest && <button className="btn secondary" disabled={busy || test.st === "sending"} onClick={() => void sendTest()}>{test.st === "sending" ? m("pushDoctor.btn.sending") : m("pushDoctor.btn.test")}</button>}
        <button className="btn secondary" disabled={busy} onClick={() => void recheck()}>{m("pushDoctor.btn.recheck")}</button>
        {pushOn && <button className="link doctor-off" disabled={busy} onClick={() => void off()}>{m("pushDoctor.btn.off")}</button>}
      </div>
    </>
  );
}
