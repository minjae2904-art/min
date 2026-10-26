"use client";

// v1.7 evening ritual "ปิดวัน" (spec 7.2): undone rows -> done / tomorrow / skip (each with undo), the journal (the single
// journal surface while the "ก่อนนอน" routine hosts the night row) and tomorrow's first line. No guilt: rows are neutral.
import { useState } from "react";
import { Section, Sheet, toast } from "@/components/ui";
import { markSleep, setDone, skipItem } from "@/lib/actions";
import { completeRoutine, restoreCare, rowOf, skipRow, snapCare, tickStep } from "@/lib/care/progress";
import { hm, logicalMinutes } from "@/lib/date";
import { dayFor, type State } from "@/lib/model";
import { carryItem, shutdownList, tomorrowFirst, tomorrowHas, undoCarry } from "@/lib/rituals";
import type { Item } from "@/lib/schedule";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { planEpoch } from "@/lib/ticks";
import { cancelLateTick } from "@/components/TickTime";

const pmJrOn = (s: State, date: string) => !!rowOf(s, date, "pm") && !!s.schedule.care?.find((r) => r.id === "pm" && r.on)?.steps.some((x) => x.id === "jr" && x.on !== false);

export function ShutdownSheet({ open, date, now, onClose }: { open: boolean; date: string; now: Date; onClose: () => void }) {
  const { s, update } = useStore();
  const day = dayFor(s, date);
  const nowMin = logicalMinutes(now);
  const [prevOpen, setPrevOpen] = useState(open);
  const [good, setGood] = useState("");
  const [fix, setFix] = useState("");
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) { setGood(day.journal?.good ?? ""); setFix(day.journal?.fix ?? ""); }
  }
  const rows = shutdownList(s, date, nowMin);
  const tmr = tomorrowFirst(s, date);
  const nightLabel = s.settings.night && s.settings.theme !== "light";

  function done(item: Item) {
    const at = planEpoch(date, item.min);
    play("done");
    if (item.routine) {
      const rid = item.routine, snap = snapCare(s, date, rid);
      update((x) => completeRoutine(x, date, rid, { at, src: "plan" }));
      toast(`ทำแล้ว: ${item.title}`, { action: "เลิกทำ", onAction: () => update((x) => restoreCare(x, date, rid, snap)) });
      return;
    }
    update((x) => setDone(x, date, item, true, undefined, { at, src: "plan" }));
    toast(`ทำแล้ว: ${item.title}`, { action: "เลิกทำ", onAction: () => { update((x) => setDone(x, date, item, false)); cancelLateTick(date, item.id); } });
  }
  function carry(item: Item) {
    // Dry run first: update() is lazy, so the result is read from a clone with the same pure function.
    const res = carryItem(structuredClone(s), date, item, Date.now());
    if (res === "refused") { play("error"); toast("พรุ่งนี้มีรายการย้ายมาครบ 3 อย่างแล้ว"); return; }
    play("toggle");
    update((x) => { carryItem(x, date, item, Date.now()); });
    const t = tomorrowHas(s, date, item.id);
    toast(res === "exists" ? `พรุ่งนี้มีอยู่แล้ว${t ? ` ${hm(t.min)}` : ""} · ข้ามวันนี้` : `ย้าย ${item.title} ไปพรุ่งนี้ ${hm(item.planMin ?? item.min)}`, {
      action: "เลิกทำ", onAction: () => update((x) => undoCarry(x, date, item)),
    });
  }
  function skip(item: Item) {
    play("toggle");
    if (item.routine) {
      const rid = item.routine, snap = snapCare(s, date, rid);
      update((x) => skipRow(x, date, item, "na"));
      toast(`ข้าม ${item.title} วันนี้ · ไม่นับคะแนน`, { action: "เลิกทำ", onAction: () => update((x) => restoreCare(x, date, rid, snap)) });
      return;
    }
    update((x) => skipItem(x, date, item, true));
    toast(`ข้าม ${item.title} วันนี้ · ไม่นับคะแนน`, { action: "เลิกทำ", onAction: () => update((x) => skipItem(x, date, item, false)) });
  }

  const journal = () => ({ good: good.trim(), fix: fix.trim(), thanks: day.journal?.thanks ?? "" });
  function shut() {
    const prevJ = day.journal, prevShut = day.shutAt, jr = pmJrOn(s, date), snap = jr ? snapCare(s, date, "pm") : null;
    play("complete");
    update((x) => {
      const d = dayFor(x, date);
      const j = journal();
      if (j.good || j.fix || j.thanks || prevJ) d.journal = j;
      d.shutAt = Date.now();
      x.days[date] = d;
      if (jr) tickStep(x, date, "pm", "jr", true, true); // promote only: never unticks an already-done night row
    });
    toast(nightLabel ? "ราตรีสวัสดิ์ · เปิดโหมดกลางคืนแล้ว" : "ราตรีสวัสดิ์", { action: "เลิกทำ", onAction: () => update((x) => {
      if (snap) restoreCare(x, date, "pm", snap);
      const d = x.days[date];
      if (!d) return;
      if (prevJ) d.journal = prevJ; else delete d.journal;
      if (prevShut) d.shutAt = prevShut; else delete d.shutAt;
    }) });
    onClose();
  }
  function sleepNow() {
    const j = journal(), prevJ = day.journal;
    play("done");
    update((x) => {
      if (j.good || j.fix) { const d = dayFor(x, date); d.journal = j; x.days[date] = d; }
      markSleep(x, date, true);
    });
    toast("เข้านอนแล้ว ฝันดี", { action: "เลิกทำ", onAction: () => update((x) => {
      markSleep(x, date, false);
      const d = x.days[date];
      if (d) { if (prevJ) d.journal = structuredClone(prevJ); else delete d.journal; }
    }) });
    onClose();
  }

  const tmrLine = [`พรุ่งนี้: ${tmr.tpl}`, `ตื่น ${tmr.wake}`, tmr.first?.title, tmr.gym && `ยิม ${tmr.gym}`, tmr.live && `ไลฟ์ ${tmr.live}`].filter(Boolean).join(" · ");
  return (
    <Sheet open={open} title="ปิดวัน" onClose={onClose}>
      {rows.length > 0 ? (
        <Section header={`ยังไม่ได้ติ๊ก ${rows.length}`}>
          {rows.map(({ item, acts }) => {
            const has = acts.includes("carry") ? tomorrowHas(s, date, item.id) : undefined;
            return (
              <div key={item.id} className="row shut-row">
                <span className="row-time num">{hm(item.min)}</span>
                <span className="row-main">
                  <span className="row-title">{item.title}</span>
                  <span className="chips shut-acts">
                    {acts.includes("done") && <button className="chip chip--sm" onClick={() => done(item)}>ทำแล้ว</button>}
                    {acts.includes("carry") && <button className="chip chip--sm" onClick={() => carry(item)}>{has ? `พรุ่งนี้มีอยู่แล้ว ${hm(has.min)}` : "พรุ่งนี้"}</button>}
                    {acts.includes("skip") && <button className="chip chip--sm" onClick={() => skip(item)}>ข้าม</button>}
                  </span>
                </span>
              </div>
            );
          })}
        </Section>
      ) : <div className="sheet-meta ritual-meta">ติ๊กครบทุกอย่างที่ถึงเวลาแล้ว</div>}
      <div className="journal-label">วันนี้ดี 1 อย่าง</div>
      <textarea className="journal-field" value={good} onChange={(e) => setGood(e.target.value)} placeholder="สิ่งเล็กๆ ก็ได้" />
      <div className="journal-label">พรุ่งนี้ 3 อย่าง</div>
      <textarea className="journal-field" value={fix} onChange={(e) => setFix(e.target.value)} placeholder="เช่น ยิม D2 · ตัดคลิป 1 อัน · นอนตรงเวลา" />
      <div className="sheet-meta ritual-meta num">{tmrLine}</div>
      <button className="btn" onClick={shut}>ปิดวัน ราตรีสวัสดิ์</button>
      {!day.sleepAt && <button className="btn secondary ritual-gap" onClick={sleepNow}>เข้านอนเลย</button>}
    </Sheet>
  );
}
