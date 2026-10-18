"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { IconLock } from "./Icons";

// iOS passcode screen. onSubmit returns false to shake + clear. Hardware keyboard works too (digits, Backspace, Escape = cancel).
export function PinPad({ title, subtitle, message, logo, length, onSubmit, onCancel, cancelLabel = "ยกเลิก" }: {
  title: string;
  subtitle?: string;
  message?: string; // error line under the dots (inside the lock layer, where toasts do not reach)
  logo?: boolean; // app logo instead of the lock icon
  length: number;
  onSubmit: (pin: string) => Promise<boolean> | boolean;
  onCancel?: () => void;
  cancelLabel?: string;
}) {
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  async function press(d: string) {
    if (pin.length >= length) return;
    const next = pin + d;
    setPin(next);
    if (next.length === length) {
      const ok = await onSubmit(next);
      if (!ok) {
        setShake(true);
        setTimeout(() => { setShake(false); setPin(""); }, 400);
      } else setPin("");
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || root.current?.closest("[inert]")) return; // another pad is on top
      if (/^\d$/.test(e.key)) { e.preventDefault(); void press(e.key); }
      else if (e.key === "Backspace") { e.preventDefault(); setPin((p) => p.slice(0, -1)); }
      else if (e.key === "Escape" && onCancel) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="lock" ref={root}>
      {logo ? <Image src="/logo-256.png" width={56} height={56} alt="" className="app-logo" unoptimized /> : <IconLock size={28} />}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 20 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 14, color: "var(--label2)", marginTop: 4 }}>{subtitle}</div>}
      </div>
      <div className={`dots ${shake ? "shake" : ""}`}>
        {Array.from({ length }, (_, i) => <span key={i} className={`dot ${i < pin.length ? "on" : ""}`} />)}
      </div>
      {message && <div className="pin-msg" role="alert" style={{ textAlign: "center" }}>{message}</div>}
      <div className="keypad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} className="key" onClick={() => press(d)}>{d}</button>
        ))}
        <button className="key ghost" onClick={onCancel} style={{ visibility: onCancel ? "visible" : "hidden" }}>{cancelLabel}</button>
        <button className="key" onClick={() => press("0")}>0</button>
        <button className="key ghost" onClick={() => setPin(pin.slice(0, -1))}>ลบ</button>
      </div>
    </div>
  );
}
