"use client";

// v1.7 trading gate (spec 8): a soft 3-tick check before logging, the result later, then a calm "พอแล้ววันนี้".
// Journal-first copy; never market advice. The page owns ticking (finish), the undo toast and the late-tick ask.
import { useState } from "react";
import { IconCheck } from "@/components/Icons";
import { Section, Segmented, Sheet, Tap } from "@/components/ui";
import { dayFor, type TradeLog, type TradeResult } from "@/lib/model";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { GATE, TRADE_RESULT, gateBits, gateFull, tradeView, type TradeView } from "@/lib/trade";

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
    onLog({ count: 1, result: "open", gate: bits, note: note.trim() || undefined }, full ? "บันทึกไม้นี้แล้ว · ใส่ผลได้ภายหลัง" : "บันทึกตามจริงแล้ว · ใส่ผลได้ภายหลัง");
    onClose();
  }
  function stayOut() {
    onLog({ count: 0, result: "skip", note: note.trim() || undefined }, "ไม่มีจังหวะแล้วไม่เข้า คือวินัยที่ดี");
    onClose();
  }
  function saveResult() {
    if (!t) return;
    onLog({ ...t, count: Math.max(1, t.count), result: res, note: note.trim() || undefined }, res === "open" ? "บันทึกแล้ว · ยังถืออยู่" : "บันทึกผลแล้ว");
    setView(null);
  }
  function setCount(n: number) {
    if (!t) return;
    onLog({ ...t, count: n, result: t.result === "skip" ? "open" : t.result }, `แก้เป็น ${n === 5 ? "5+" : n} ไม้แล้ว`);
  }

  return (
    <Sheet open={open} title="เทรดวันนี้" onClose={onClose}>
      {v === "gate" && (
        <>
          <Section header="เช็ก 3 ข้อของไม้นี้">
            {GATE.map(([k, label], i) => (
              <Tap key={k} className={`row ${ticks[i] ? "done" : ""}`} pressed={ticks[i]} onTap={() => { play("tap"); setTicks((p) => p.map((x, j) => (j === i ? !x : x))); }}>
                <span className={`check ${ticks[i] ? "on" : ""}`}>{ticks[i] && <IconCheck size={16} />}</span>
                <span className="row-main row-title">{label}</span>
              </Tap>
            ))}
          </Section>
          <Section>
            <label className="row form-row">
              <span className="row-title trade-lbl">โน้ต</span>
              <input className="inline-input" placeholder="setup / เหตุผล (ไม่บังคับ)" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </Section>
          <button className={`btn ${full ? "" : "secondary"}`} onClick={logNew}>{full ? "บันทึกไม้นี้" : "บันทึกตามจริง (เช็กลิสต์ไม่ครบ)"}</button>
          <button className="btn secondary trade-gap" onClick={stayOut}>ดูกราฟแล้ว ไม่มีจังหวะ ไม่เข้า</button>
        </>
      )}
      {v === "result" && t && (
        <>
          <Section header="ผล">
            <div className="row"><div className="row-main"><Segmented label="ผล" value={res} options={TRADE_RESULT} onChange={(x) => { play("tap"); setRes(x); }} /></div></div>
            <label className="row form-row">
              <span className="row-title trade-lbl">บทเรียน</span>
              <input className="inline-input" placeholder="ได้เรียนรู้อะไรจากไม้นี้ (ไม่บังคับ)" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </Section>
          <button className="btn" onClick={saveResult}>บันทึก</button>
        </>
      )}
      {v === "enough" && t && (
        <>
          <div className="card trade-enough">
            <div className="trade-enough-title">พอแล้ววันนี้</div>
            <div className="sw-sub">{t.result === "skip" ? "ไม่มีจังหวะแล้วไม่เข้า คือวินัยที่ดี · ปิดกราฟแล้วไปพักได้" : "ครบ 1 ไม้ตามกฎ ปิดกราฟแล้วไปพักได้ · ผลไม่ใช่ตัววัดวินัย"}</div>
            {t.result === "loss" && <div className="sw-sub">ขาดทุนวันนี้จบที่ไม้นี้ ไม่ต้องเอาคืน ตลาดพรุ่งนี้ยังอยู่</div>}
            <div className="sw-actions">
              {t.result !== "skip" && <button className="chip" onClick={() => { play("tap"); setRes(t.result); setView("result"); }}>อัปเดตผล</button>}
              {t.result !== "skip" && <button className="chip" onClick={() => { play("tap"); setRes(t.result); setNote(t.note ?? ""); setView("result"); }}>จดบทเรียน</button>}
              <button className={`chip ${counts ? "on" : ""}`} aria-pressed={counts} onClick={() => { play("tap"); setCounts(!counts); }}>แก้จำนวนไม้</button>
            </div>
            {counts && (
              <div className="chips trade-counts">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} className={`chip ${t.count === n && t.result !== "skip" ? "on" : ""}`} aria-pressed={t.count === n && t.result !== "skip"} onClick={() => setCount(n)}>{n === 5 ? "5+" : n} ไม้</button>
                ))}
              </div>
            )}
          </div>
          {t.note && <div className="sheet-meta">โน้ต: {t.note}</div>}
        </>
      )}
      <div className="section-footer trade-foot">บันทึกเพื่อดูวินัยของตัวเอง ไม่ใช่คำแนะนำการลงทุน</div>
    </Sheet>
  );
}
