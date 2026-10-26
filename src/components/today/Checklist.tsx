"use client";

// Today checklist (spec 8.6): phase sections with swipe rows, info rows and a collapsed "ทำแล้ว N" group.
// Swipe right = tick (untick on done rows), swipe left = snooze 30 min, long-press or "..." = row menu. All undoable.
import { useEffect, useRef, useState } from "react";
import { mergeBind, useLongPress, useSwipe } from "@/components/gestures";
import { IconBack, IconBook, IconBriefcase, IconCheck, IconClock, IconCup, IconGame, IconMore } from "@/components/Icons";
import { skipWithUndo, snoozeWithUndo } from "@/components/reschedule";
import { Chev, Section, Tap } from "@/components/ui";
import { hm } from "@/lib/date";
import type { DayLog } from "@/lib/model";
import { canReschedule, type Item } from "@/lib/schedule";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { classRuns } from "@/lib/term";
import { splitDone } from "@/lib/today";

export type ChecklistSection = { key: string; header: string; list: Item[]; skipped: Item[] };
// A row to focus after an action; pendingOnly = only its pending-area copy counts (a settle flush), else any copy.
export type FocusReq = { id: string; pendingOnly: boolean; n: number };

type RowProps = {
  item: Item; done: boolean; just: boolean; overdue: boolean; next: boolean; sub?: string; cue: string | null; prog?: string | null;
  onTap: () => void; onRight: () => void; onLater: () => void; onMenu: () => void;
};

function SwipeRow({ item, done, just, overdue, next, sub, cue, prog, onTap, onRight, onLater, onMenu }: RowProps) {
  const { ref: faceRef, bind: swipeBind } = useSwipe({ can: { right: true, left: !done && canReschedule(item) }, onResult: (r) => (r === "tick" ? onRight() : onLater()) });
  const lp = useLongPress(onMenu);
  const bind = mergeBind(swipeBind, lp.bind);
  const moved = item.planMin !== undefined ? `เลื่อนจาก ${hm(item.planMin)}` : null;
  return (
    <div className="swipe" data-id={item.id}>
      <span className="swipe-act swipe-act--tick" aria-hidden>{done ? <><IconBack size={20} />ยกเลิกติ๊ก</> : <><IconCheck size={20} />ทำแล้ว</>}</span>
      <span className="swipe-act swipe-act--later" aria-hidden>เลื่อน 30 น.<IconClock size={20} /></span>
      <div className="swipe-face" ref={faceRef} data-armed={lp.armed || undefined} {...bind}>
        <Tap className={`row has-time ${done ? "done" : ""} ${just ? "just" : ""} ${overdue ? "overdue" : ""} ${next ? "next" : ""}`} pressed={done} onTap={onTap}>
          <span className="row-time">{hm(item.min)}</span>
          <span className={`check ${done ? "on" : ""} ${just ? "pop" : ""}`}>{done && <IconCheck size={16} />}</span>
          <span className="row-main">
            <span className="row-title"><span className="strike">{item.title}</span>{overdue && <span className="sr-only">เลยเวลา</span>}</span>
            {(moved || sub || cue) && (
              <span className="row-sub">
                {moved}{moved && (cue || sub) ? " · " : ""}
                {cue && <span className="cue">{cue}</span>}
                {cue && sub ? " · " : ""}
                {sub}
              </span>
            )}
          </span>
        </Tap>
        {prog && <span className="row-prog num" aria-label={`ทำแล้ว ${prog} ขั้น`}>{prog}</span>}
        <button type="button" className="row-more" aria-label={`ตัวเลือก: ${item.title}`} onClick={onMenu}><IconMore size={20} /></button>
      </div>
    </div>
  );
}

function InfoRow({ item, sub }: { item: Item; sub?: string }) {
  const game = item.kind === "game", streamEnd = item.kind === "stream"; // stream-end marker: like game-stop
  return (
    <div className="row info has-time">
      <span className="row-time">{hm(item.min)}</span>
      <span className={`row-icon ${game && item.id !== "game-stop" ? "row-icon--live" : ""}`}>
        {game || streamEnd ? <IconGame size={18} /> : item.id === "caf" ? <IconCup size={18} /> : <IconBriefcase size={18} />}
      </span>
      {sub ? (
        <span className="row-main"><span className="row-title">{item.title}</span><span className="row-sub">{sub}</span></span>
      ) : <span className="row-main row-title">{item.title}</span>}
    </div>
  );
}

// v1.8 term day: one row per run of back-to-back classes; with 2+ classes a tap lists each one (title, time, room).
type Run = ReturnType<typeof classRuns>[number];
function ClassRow({ run }: { run: Run }) {
  const [open, setOpen] = useState(false);
  const one = run.items.length === 1 ? run.items[0] : null;
  const head = (
    <>
      <span className="row-time">{hm(run.start)}</span>
      <span className="row-icon row-icon--class"><IconBook size={18} /></span>
      <span className="row-main">
        <span className="row-title">{one ? one.title : `เรียน ${run.items.length} วิชา`}</span>
        <span className="row-sub num">{hm(run.start)}-{hm(run.end)}{one?.sub ? ` · ${one.sub}` : ""}</span>
      </span>
    </>
  );
  if (one) return <div className="row info has-time cls-run">{head}</div>;
  return (
    <>
      <button type="button" className="row info has-time cls-run" aria-expanded={open} onClick={() => { play("tap"); setOpen(!open); }}>{head}<Chev /></button>
      {open && run.items.map((i) => (
        <div key={i.id} className="row info has-time cls-item">
          <span className="row-time">{hm(i.min)}</span>
          <span className="row-icon" aria-hidden />
          <span className="row-main">
            <span className="row-title">{i.title}</span>
            <span className="row-sub num">{hm(i.min)}-{hm(i.min + (i.dur ?? 0))}{i.sub ? ` · ${i.sub}` : ""}</span>
          </span>
        </div>
      ))}
    </>
  );
}

export function Checklist({ sections, swapKey, day, date, nowMin, nextId, popped, settling, openDone, onToggleDone, onTick, onUntick, onRowActions, focusReq, onPointer, subFor, cueFor, infoSub, progressFor }: {
  sections: ChecklistSection[]; swapKey: string; day: DayLog; date: string; nowMin: number; nextId?: string; popped: string | null;
  settling: ReadonlySet<string>; openDone: ReadonlySet<string>; onToggleDone: (key: string) => void;
  onTick: (i: Item, o?: { undo?: boolean }) => void; onUntick: (i: Item) => void; onRowActions: (i: Item) => void;
  focusReq: FocusReq | null; onPointer: (down: boolean) => void;
  subFor: (i: Item) => string | undefined; cueFor: (i: Item) => string | null; infoSub: (i: Item) => string | undefined;
  progressFor?: (i: Item) => string | null; // v1.7 routine rows: "2/3" required steps
}) {
  const { update } = useStore();
  const root = useRef<HTMLDivElement>(null);
  const latest = useRef({ sections, done: day.done, settling });
  useEffect(() => { latest.current = { sections, done: day.done, settling }; });

  // Focus after a settle flush or a closed row menu: the row itself if it is still there, else the next pending row
  // of its section, else that section's done toggle. Replaces Sheet's focus return when the saved node is gone.
  useEffect(() => {
    const el0 = root.current;
    if (!focusReq || !el0) return;
    const q = (id: string, pendingOnly: boolean) =>
      el0.querySelector<HTMLElement>(`${pendingOnly ? ".group > " : ""}.swipe[data-id="${CSS.escape(id)}"] .row`);
    let el = q(focusReq.id, focusReq.pendingOnly);
    if (!el) {
      const { sections: secs, done, settling: st } = latest.current;
      const sec = secs.find((x) => x.list.some((i) => i.id === focusReq.id) || x.skipped.some((i) => i.id === focusReq.id));
      if (sec) {
        const min = [...sec.list, ...sec.skipped].find((i) => i.id === focusReq.id)?.min ?? 0;
        const nxt = splitDone(sec.list, done, st).pending.find((i) => i.ring && i.id !== focusReq.id && i.min >= min);
        el = (nxt && q(nxt.id, true)) || document.getElementById(`done-${sec.key}`);
      }
    }
    // Another dialog took focus in the same commit (row menu -> weigh sheet): leave it there.
    if (document.activeElement?.closest("[role=dialog]:not(.out)")) return;
    el?.focus({ preventScroll: true });
  }, [focusReq]);

  const row = (item: Item) => {
    const done = !!day.done[item.id];
    return (
      <SwipeRow
        key={item.id} item={item} done={done} just={done && popped === item.id && settling.has(item.id)} overdue={!done && item.min + 30 < nowMin} next={item.id === nextId}
        sub={subFor(item)} cue={cueFor(item)} prog={done ? null : progressFor?.(item)}
        onTap={() => onTick(item)}
        onRight={() => (done ? onUntick(item) : onTick(item, { undo: true }))}
        onLater={() => snoozeWithUndo(update, date, item, nowMin)}
        onMenu={() => onRowActions(item)}
      />
    );
  };

  return (
    <div
      className="tpl-list" ref={root}
      onPointerDownCapture={() => onPointer(true)} onPointerUpCapture={() => onPointer(false)} onPointerCancelCapture={() => onPointer(false)}
    >
      <div key={swapKey} className="swap">
        {sections.map(({ key, header, list, skipped }) => {
          if (!list.length && !skipped.length) return null;
          const { pending, done } = splitDone(list, day.done, settling);
          const open = openDone.has(key);
          const closed = [...done, ...skipped].sort((a, b) => a.min - b.min);
          return (
            <Section key={key} id={`sec-${key}`} header={header}>
              {pending.map((item) => {
                if (item.ring) return row(item);
                if (item.kind !== "class") return <InfoRow key={item.id} item={item} sub={infoSub(item)} />;
                const run = classRuns(pending).find((r) => r.items[0].id === item.id);
                return run ? <ClassRow key={item.id} run={run} /> : null; // later classes of a run render inside it
              })}
              {closed.length > 0 && (
                <>
                  <button
                    type="button" id={`done-${key}`} className="row done-toggle" aria-expanded={open} aria-controls={`donelist-${key}`}
                    onClick={() => { play("tap"); onToggleDone(key); }}
                  >
                    <span className="row-main">ทำแล้ว {done.length}{skipped.length ? ` · ข้าม ${skipped.length}` : ""}</span>
                    <Chev />
                  </button>
                  <div id={`donelist-${key}`} className="done-list" hidden={!open}>
                    {open && closed.map((item) => (day.done[item.id] ? row(item) : (
                      <div key={item.id} className="row skipped has-time">
                        <span className="row-time">{hm(item.min)}</span>
                        <span className="row-main"><span className="row-title">{item.title}</span><span className="row-sub">ข้ามวันนี้</span></span>
                        <button type="button" className="link" onClick={() => skipWithUndo(update, date, item, false)}>เลิกข้าม</button>
                      </div>
                    )))}
                  </div>
                </>
              )}
            </Section>
          );
        })}
      </div>
    </div>
  );
}
