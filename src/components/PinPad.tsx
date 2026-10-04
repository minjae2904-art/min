"use client";

import { useState } from "react";
import { IconLock } from "./Icons";

// iOS passcode screen. onSubmit returns false to shake + clear.
export function PinPad({ title, length, onSubmit, onCancel }: {
  title: string;
  length: number;
  onSubmit: (pin: string) => Promise<boolean> | boolean;
  onCancel?: () => void;
}) {
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);

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

  return (
    <div className="lock">
      <IconLock size={28} />
      <div style={{ fontSize: 20 }}>{title}</div>
      <div className={`dots ${shake ? "shake" : ""}`}>
        {Array.from({ length }, (_, i) => <span key={i} className={`dot ${i < pin.length ? "on" : ""}`} />)}
      </div>
      <div className="keypad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} className="key" onClick={() => press(d)}>{d}</button>
        ))}
        <button className="key ghost" onClick={onCancel} style={{ visibility: onCancel ? "visible" : "hidden" }}>ยกเลิก</button>
        <button className="key" onClick={() => press("0")}>0</button>
        <button className="key ghost" onClick={() => setPin(pin.slice(0, -1))}>ลบ</button>
      </div>
    </div>
  );
}
