"use client";

import { useCallback, useEffect, useState } from "react";
import { Section, toast } from "@/components/ui";
import { askPermission, claimHost, closeNotifications, collectFacts, disablePush, enablePush, prefetchPush, readHeal, testPush, waitForPush, type HealAction, type HealRecord } from "@/lib/push";
import { firstFailing, pushSteps, type Facts, type StepState } from "@/lib/push-steps";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";

const STATE_LABEL: Record<StepState, string> = { ok: "ผ่าน", fail: "ไม่ผ่าน", warn: "ต้องทำ", wait: "กำลังตรวจ", skip: "รอข้อก่อนหน้า" };
const HEAL_LABEL: Record<HealAction, string> = {
  none: "ตรวจแล้ว ปกติ", posted: "ส่งข้อมูลเครื่องนี้ให้ server ใหม่", resubscribed: "ลงทะเบียนใหม่อัตโนมัติ",
  "need-tap": "ต้องแตะ 'เปิดการแจ้งเตือน'", error: "ซ่อมไม่สำเร็จ", enabled: "เปิดจากปุ่มในหน้านี้",
};
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
    if (r.ok) { play("complete"); toast("เปิดการแจ้งเตือนแล้ว"); setTest({ st: "idle" }); }
    else { play("error"); toast(r.msg, { ms: 6000 }); }
    await check();
    setBusy(false);
  };
  const claim = async () => {
    play("tap");
    setBusy(true);
    const ok = await claimHost(auth.token);
    if (ok) { play("complete"); toast("ตั้งให้ส่งผ่านเว็บนี้แล้ว"); } else { play("error"); toast("เปลี่ยนไม่สำเร็จ ลองใหม่"); }
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
    if (!r.sent) { setTest({ st: "error", msg: "server ส่งไม่ถึง Apple: แตะ 'ตรวจอีกครั้ง' แล้ว 'ลงทะเบียนใหม่'" }); return void check(); }
    setTest({ st: (await waitForPush("test", 20_000)) ? "received" : "sent" });
  };
  const off = async () => {
    play("toggle");
    setBusy(true);
    await disablePush(auth.token).catch(() => {});
    toast("ปิดการแจ้งเตือนบนเครื่องนี้แล้ว");
    setTest({ st: "idle" });
    await check();
    setBusy(false);
  };
  const recheck = async () => { play("tap"); setBusy(true); setFacts(null); await check(); setBusy(false); };

  const footer = heal
    ? `ซ่อมอัตโนมัติล่าสุด ${new Date(heal.at).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · ${HEAL_LABEL[heal.action] ?? heal.action}`
    : "ทุกครั้งที่เปิดแอป Krob จะตรวจและซ่อมการลงทะเบียนให้เองแบบเงียบๆ";

  return (
    <>
      <Section header="แจ้งเตือนตอนปิดแอป" footer={footer}>
        <div className="row doctor-head" role="status">
          <span className={`step-dot ${waiting && !first ? "wait" : first ? first.state : "ok"}`} aria-hidden />
          <span className="row-main">
            <span className="row-title">{!steps ? "กำลังตรวจ..." : first ? `ต้องแก้ ${todo} ข้อ` : waiting ? "กำลังตรวจ..." : "พร้อมใช้งาน"}</span>
            {first?.fix && <span className="row-sub doctor-fix">{first.fix}</span>}
            {steps && !first && !waiting && <span className="row-sub">ตัวเลขบนไอคอนแอป = รายการที่ถึงเวลาแล้วแต่ยังไม่ทำ</span>}
          </span>
        </div>
        {steps?.map((s) => (
          <div key={s.id} className={`row step-row is-${s.state}`}>
            <span className={`step-dot ${s.state}`} aria-hidden />
            <span className="sr-only">{STATE_LABEL[s.state]}: </span>
            <span className="row-main">
              <span className="row-title">{s.label}</span>
              <span className="row-sub">{s.fix && s.state !== "skip" ? `วิธีแก้: ${s.fix}` : s.detail}</span>
            </span>
          </div>
        ))}
      </Section>

      <div className="doctor-actions">
        {showEnable && <button className="btn" disabled={busy} onClick={() => void enable(false)}>เปิดการแจ้งเตือน</button>}
        {showRedo && <button className={showEnable ? "btn secondary" : "btn"} disabled={busy} onClick={() => void enable(f?.sub === "mismatch" || test.st === "sent")}>ลงทะเบียนใหม่</button>}
        {showClaim && <button className="btn" disabled={busy} onClick={() => void claim()}>ใช้เว็บนี้ส่งแจ้งเตือน</button>}
        {showTest && <button className="btn secondary" disabled={busy || test.st === "sending"} onClick={() => void sendTest()}>{test.st === "sending" ? "กำลังส่ง..." : "ส่งทดสอบ"}</button>}
        <button className="btn secondary" disabled={busy} onClick={() => void recheck()}>ตรวจอีกครั้ง</button>
        {pushOn && <button className="link doctor-off" disabled={busy} onClick={() => void off()}>ปิดบนเครื่องนี้</button>}
      </div>
    </>
  );
}
