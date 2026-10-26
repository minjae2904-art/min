"use client";

// Gym rest timer sheet (v1.7 G3), opened from the accessory: big m:ss, -15 / +15 s and skip. The 1 s clock is local UI only;
// state changes on taps.
import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui";
import { bumpRest, clearRest, msClock, restLeft } from "@/lib/session";
import { useStore } from "@/lib/store";
import { msgs } from "@/i18n";
import * as C from "@/i18n/msg/components-live";
import * as Common from "@/i18n/msg/common";

const m = msgs(C), c = msgs(Common);

export function RestSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { s, update } = useStore();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return;
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [open]);
  const left = restLeft(s, now);
  const done = left === null || left === 0;
  return (
    <Sheet open={open} title={m("restSheet.title")} detent="medium" onClose={onClose}>
      <div className="rest-big num" role="timer" aria-live="off" data-done={done || undefined}>{done ? m("restSheet.done") : msClock(left)}</div>
      <div className="rest-sub">{done ? m("restSheet.sub.done") : m("restSheet.sub.rest")}</div>
      {!done && (
        <div className="chips rest-ctrls">
          <button type="button" className="chip" onClick={() => update((x) => bumpRest(x, -15, Date.now()))}>{m("restSheet.minus")}</button>
          <button type="button" className="chip" onClick={() => update((x) => bumpRest(x, 15, Date.now()))}>{m("restSheet.plus")}</button>
        </div>
      )}
      <button className="btn" onClick={() => { if (left !== null) update((x) => clearRest(x)); onClose(); }}>{done ? c("close") : m("restSheet.skip")}</button>
    </Sheet>
  );
}
