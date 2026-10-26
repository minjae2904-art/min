"use client";

// v1.7 trading gate (spec 8): a soft 3-tick check before logging, the result later, then a calm "พอแล้ววันนี้".
// Journal-first copy; never market advice. The page owns ticking (finish), the undo toast and the late-tick ask.
import { useState } from "react";
import { msgs } from "@/i18n";
import * as C from "@/i18n/msg/components";
import * as Common from "@/i18n/msg/common";
import { IconCheck } from "@/components/Icons";
import { Section, Segmented, Sheet, Tap } from "@/components/ui";
import { dayFor, type TradeLog, type TradeResult } from "@/lib/model";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { GATE, TRADE_RESULT, gateBits, gateFull, tradeView, type TradeView } from "@/lib/trade";

const m = msgs(C), c = msgs(Common);

export function TradeSheet({ open, date, done, onClose, onLog }: {
  open: boolean; date: string; done: boolean; onClose: () => void;
  onLog: (t: TradeLog, msg: string) => void;
}) {
  const { s } = useStore();
  const day = dayFor(s, date);
  const t = day.trade;
  const [prevOpen, setPrevOpen] = useState(open);
  const [view, setView] = useState<TradeView | null>(null); // null = follow the stored trade
  const [ticks, setTicks] = useState([false, false, false]);
  const [note, setNote] = useState("");
  const [res, setRes] = useState<TradeResult>("open");
  const [counts, setCounts] = useState(false);
  // Render-time reset on every open (same pattern as Sheet).
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) { setView(null); setTicks([false, false, false]); setNote(t?.note ?? ""); setRes(t && t.result !== "skip" ? t.result : "open"); setCounts(false); }
  }
  // An unticked row always starts at the gate (a stored trade stays only as the prefilled note).
  const v = view ?? (done ? tradeView(day) : "gate");
  const bits = gateBits(ticks);
  const full = gateFull(bits);

  function logNew() {
    onLog({ count: 1, result: "open", gate: bits, note: note.trim() || undefined }, full ? m("tradeSheet.toast.logged") : m("tradeSheet.toast.loggedAsIs"));
    onClose();
  }
  function stayOut() {
    onLog({ count: 0, result: "skip", note: note.trim() || undefined }, m("tradeSheet.toast.stayOut"));
    onClose();
  }
  function saveResult() {
    if (!t) return;
    onLog({ ...t, count: Math.max(1, t.count), result: res, note: note.trim() || undefined }, res === "open" ? m("tradeSheet.toast.holding") : m("tradeSheet.toast.result"));
    setView(null);
  }
  function setCount(n: number) {
    if (!t) return;
    onLog({ ...t, count: n, result: t.result === "skip" ? "open" : t.result }, m("tradeSheet.toast.count", { n: n === 5 ? "5+" : n }));
  }

  return (
    <Sheet open={open} title={m("tradeSheet.title")} onClose={onClose}>
      {v === "gate" && (
        <>
          <Section header={m("tradeSheet.gate")}>
            {GATE.map(([k, label], i) => (
              <Tap key={k} className={`row ${ticks[i] ? "done" : ""}`} pressed={ticks[i]} onTap={() => { play("tap"); setTicks((p) => p.map((x, j) => (j === i ? !x : x))); }}>
                <span className={`check ${ticks[i] ? "on" : ""}`}>{ticks[i] && <IconCheck size={16} />}</span>
                <span className="row-main row-title">{label}</span>
              </Tap>
            ))}
          </Section>
          <Section>
            <label className="row form-row">
              <span className="row-title trade-lbl">{m("tradeSheet.note")}</span>
              <input className="inline-input" placeholder={m("tradeSheet.notePh")} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </Section>
          <button className={`btn ${full ? "" : "secondary"}`} onClick={logNew}>{full ? m("tradeSheet.btn.log") : m("tradeSheet.btn.logAsIs")}</button>
          <button className="btn secondary trade-gap" onClick={stayOut}>{m("tradeSheet.btn.stayOut")}</button>
        </>
      )}
      {v === "result" && t && (
        <>
          <Section header={m("tradeSheet.result")}>
            <div className="row"><div className="row-main"><Segmented label={m("tradeSheet.result")} value={res} options={TRADE_RESULT} onChange={(x) => { play("tap"); setRes(x); }} /></div></div>
            <label className="row form-row">
              <span className="row-title trade-lbl">{m("tradeSheet.lesson")}</span>
              <input className="inline-input" placeholder={m("tradeSheet.lessonPh")} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </Section>
          <button className="btn" onClick={saveResult}>{c("save")}</button>
        </>
      )}
      {v === "enough" && t && (
        <>
          <div className="card trade-enough">
            <div className="trade-enough-title">{m("tradeSheet.enough.title")}</div>
            <div className="sw-sub">{t.result === "skip" ? m("tradeSheet.enough.skip") : m("tradeSheet.enough.done")}</div>
            {t.result === "loss" && <div className="sw-sub">{m("tradeSheet.enough.loss")}</div>}
            <div className="sw-actions">
              {t.result !== "skip" && <button className="chip" onClick={() => { play("tap"); setRes(t.result); setView("result"); }}>{m("tradeSheet.btn.update")}</button>}
              {t.result !== "skip" && <button className="chip" onClick={() => { play("tap"); setRes(t.result); setNote(t.note ?? ""); setView("result"); }}>{m("tradeSheet.btn.lesson")}</button>}
              <button className={`chip ${counts ? "on" : ""}`} aria-pressed={counts} onClick={() => { play("tap"); setCounts(!counts); }}>{m("tradeSheet.btn.count")}</button>
            </div>
            {counts && (
              <div className="chips trade-counts">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} className={`chip ${t.count === n && t.result !== "skip" ? "on" : ""}`} aria-pressed={t.count === n && t.result !== "skip"} onClick={() => setCount(n)}>{m("tradeSheet.count", { n: n === 5 ? "5+" : n })}</button>
                ))}
              </div>
            )}
          </div>
          {t.note && <div className="sheet-meta">{m("tradeSheet.noteLine", { note: t.note })}</div>}
        </>
      )}
      <div className="section-footer trade-foot">{m("tradeSheet.foot")}</div>
    </Sheet>
  );
}
