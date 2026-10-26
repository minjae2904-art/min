"use client";

// v1.7 evening ritual "ปิดวัน" (spec 7.2): undone rows -> done / tomorrow / skip (each with undo), the journal (the single
// journal surface while the "ก่อนนอน" routine hosts the night row) and tomorrow's first line. No guilt: rows are neutral.
import { useState } from "react";
import { msgs } from "@/i18n";
import * as C from "@/i18n/msg/components-rituals";
import * as Common from "@/i18n/msg/common";
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

const m = msgs(C), c = msgs(Common);
const pmJrOn =(s: State, date: string) => !!rowOf(s, date, "pm") && !!s.schedule.care?.find((r) => r.id === "pm" && r.on)?.steps.some((x) => x.id === "jr" && x.on !== false);

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
      toast(m("shutdownSheet.toast.done", { title: item.title }), { action: c("undo"), onAction: () => update((x) => restoreCare(x, date, rid, snap)) });
      return;
    }
    update((x) => setDone(x, date, item, true, undefined, { at, src: "plan" }));
    toast(m("shutdownSheet.toast.done", { title: item.title }), { action: c("undo"), onAction: () => { update((x) => setDone(x, date, item, false)); cancelLateTick(date, item.id); } });
  }
  function carry(item: Item) {
    // Dry run first: update() is lazy, so the result is read from a clone with the same pure function.
    const res = carryItem(structuredClone(s), date, item, Date.now());
    if (res === "refused") { play("error"); toast(m("shutdownSheet.toast.carryFull")); return; }
    play("toggle");
    update((x) => { carryItem(x, date, item, Date.now()); });
    const t = tomorrowHas(s, date, item.id);
    toast(res === "exists" ? m("shutdownSheet.toast.exists", { at: t ? ` ${hm(t.min)}` : "" }) : m("shutdownSheet.toast.carried", { title: item.title, time: hm(item.planMin ?? item.min) }), {
      action: c("undo"), onAction: () => update((x) => undoCarry(x, date, item)),
    });
  }
  function skip(item: Item) {
    play("toggle");
    if (item.routine) {
      const rid = item.routine, snap = snapCare(s, date, rid);
      update((x) => skipRow(x, date, item, "na"));
      toast(m("shutdownSheet.toast.skip", { title: item.title }), { action: c("undo"), onAction: () => update((x) => restoreCare(x, date, rid, snap)) });
      return;
    }
    update((x) => skipItem(x, date, item, true));
    toast(m("shutdownSheet.toast.skip", { title: item.title }), { action: c("undo"), onAction: () => update((x) => skipItem(x, date, item, false)) });
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
    toast(nightLabel ? m("shutdownSheet.toast.nightOn") : m("shutdownSheet.toast.night"), { action: c("undo"), onAction: () => update((x) => {
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
    toast(m("shutdownSheet.toast.sleep"), { action: c("undo"), onAction: () => update((x) => {
      markSleep(x, date, false);
      const d = x.days[date];
      if (d) { if (prevJ) d.journal = structuredClone(prevJ); else delete d.journal; }
    }) });
    onClose();
  }

  const tmrLine = [m("shutdownSheet.tmr.tpl", { tpl: tmr.tpl }), m("shutdownSheet.tmr.wake", { time: tmr.wake }), tmr.first?.title, tmr.gym && m("shutdownSheet.tmr.gym", { gym: tmr.gym }), tmr.live && m("shutdownSheet.tmr.live", { time: tmr.live })].filter(Boolean).join(" · ");
  return (
    <Sheet open={open} title={m("shutdownSheet.title")} onClose={onClose}>
      {rows.length > 0 ? (
        <Section header={m("shutdownSheet.header", { n: rows.length })}>
          {rows.map(({ item, acts }) => {
            const has = acts.includes("carry") ? tomorrowHas(s, date, item.id) : undefined;
            return (
              <div key={item.id} className="row shut-row">
                <span className="row-time num">{hm(item.min)}</span>
                <span className="row-main">
                  <span className="row-title">{item.title}</span>
                  <span className="chips shut-acts">
                    {acts.includes("done") && <button className="chip chip--sm" onClick={() => done(item)}>{c("done")}</button>}
                    {acts.includes("carry") && <button className="chip chip--sm" onClick={() => carry(item)}>{has ? m("shutdownSheet.btn.hasAt", { time: hm(has.min) }) : c("tomorrow")}</button>}
                    {acts.includes("skip") && <button className="chip chip--sm" onClick={() => skip(item)}>{m("shutdownSheet.btn.skip")}</button>}
                  </span>
                </span>
              </div>
            );
          })}
        </Section>
      ) : <div className="sheet-meta ritual-meta">{m("shutdownSheet.empty")}</div>}
      <div className="journal-label">{m("shutdownSheet.label.good")}</div>
      <textarea className="journal-field" value={good} onChange={(e) => setGood(e.target.value)} placeholder={m("shutdownSheet.ph.good")} />
      <div className="journal-label">{m("shutdownSheet.label.fix")}</div>
      <textarea className="journal-field" value={fix} onChange={(e) => setFix(e.target.value)} placeholder={m("shutdownSheet.ph.fix")} />
      <div className="sheet-meta ritual-meta num">{tmrLine}</div>
      <button className="btn" onClick={shut}>{m("shutdownSheet.btn.shut")}</button>
      {!day.sleepAt && <button className="btn secondary ritual-gap" onClick={sleepNow}>{m("shutdownSheet.btn.sleep")}</button>}
    </Sheet>
  );
}
