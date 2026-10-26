"use client";

// Row context menu (long-press or the row's "..." button) and the move-time sheet (spec 8.7).
// Every row closes the sheet; every change goes through a helper with an Undo toast.
import Link from "next/link";
import { useState } from "react";
import { IconBack, IconCalendar, IconCheck, IconChevron, IconClock, IconGym, IconList, IconSpark } from "@/components/Icons";
import { moveWithUndo, skipWithUndo, snoozeWithUndo } from "@/components/reschedule";
import { Chev, Section, Sheet, Tile, toast } from "@/components/ui";
import { snoozeTarget } from "@/lib/actions";
import { ROLLOVER_HOUR, hm } from "@/lib/date";
import { dayFor, type SkipWhy } from "@/lib/model";
import { SKIP_WHY } from "@/components/care/CareSheet";
import { LAST, canReschedule, type Item } from "@/lib/schedule";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { langArr, msgs } from "@/i18n";
import * as C from "@/i18n/msg/components-today";
import * as Common from "@/i18n/msg/common";

const m = msgs(C), c = msgs(Common);
const MOVE_BY: [number, string][] = langArr(() => [[15, m("rowActions.by15")], [30, m("rowActions.by30")], [60, m("rowActions.by60")]]);

// item = the row the menu is open for (a snapshot taken at open), null = closed. The last item stays rendered for the exit.
// v1.7 routine rows (item.routine): "แก้กิจวัตร..." and a skip with a reason chip instead of the plain skip.
export function RowActions({ item, date, nowMin, onClose, onTick, onUntick, onEditRoutine, onSkipRoutine }: {
  item: Item | null; date: string; nowMin: number; onClose: () => void; onTick: (i: Item) => void; onUntick: (i: Item) => void;
  onEditRoutine?: (i: Item) => void; onSkipRoutine?: (i: Item, why: SkipWhy) => void;
}) {
  const { s, update } = useStore();
  const [mode, setMode] = useState<"menu" | "move" | "skip">("menu");
  const [last, setLast] = useState(item);
  const [val, setVal] = useState("");
  if (item && item !== last) { setLast(item); setMode("menu"); }
  const it = item ?? last;
  if (!it) return null;

  const done = !!dayFor(s, date).done[it.id];
  const can = !done && canReschedule(it);
  const planMin = it.planMin;
  const routine = !!it.routine && !!onSkipRoutine;
  const run = (fn: () => void) => { onClose(); fn(); };
  const toMove = () => { play("tap"); setVal(hm(it.min)); setMode("move"); };

  const save = () => {
    const [h, mi] = val.split(":").map(Number);
    const min = Number.isInteger(h) && Number.isInteger(mi) ? h * 60 + mi + (h < ROLLOVER_HOUR ? 1440 : 0) : NaN;
    if (!(min >= ROLLOVER_HOUR * 60 && min <= LAST)) { play("error"); toast(m("rowActions.toast.range", { from: hm(ROLLOVER_HOUR * 60), to: hm(LAST) })); return; }
    run(() => moveWithUndo(update, date, it, min));
  };

  return (
    <>
      <Sheet open={!!item && mode === "menu"} title={it.title} detent="medium" onClose={onClose}>
        <div className="sheet-meta num">{hm(it.min)}{planMin !== undefined ? m("rowActions.was", { time: hm(planMin) }) : ""}</div>
        <div className="group">
          {can && (
            <button className="row has-tile" onClick={() => run(() => snoozeWithUndo(update, date, it, nowMin))}>
              <Tile color="var(--warning)"><IconClock size={18} /></Tile>
              <span className="row-main"><span className="row-title">{m("rowActions.snooze")}</span><span className="row-sub">{m("rowActions.until", { time: hm(snoozeTarget(it, nowMin)) })}</span></span>
            </button>
          )}
          {can && (
            <button className="row has-tile" onClick={toMove}>
              <Tile color="var(--accent)"><IconCalendar size={18} /></Tile>
              <span className="row-main row-title">{m("rowActions.move")}</span>
              <Chev />
            </button>
          )}
          {planMin !== undefined && (
            <button className="row has-tile" onClick={() => run(() => moveWithUndo(update, date, it, null))}>
              <Tile color="var(--area-projects)"><IconBack size={18} /></Tile>
              <span className="row-main row-title">{m("rowActions.restore", { time: hm(planMin) })}</span>
            </button>
          )}
          {can && (
            <button className="row has-tile" onClick={() => { if (routine) { play("tap"); setMode("skip"); } else run(() => skipWithUndo(update, date, it, true)); }}>
              <Tile color="var(--area-sleep)"><IconChevron size={18} /></Tile>
              <span className="row-main"><span className="row-title">{routine ? m("rowActions.skipMore") : c("skipToday")}</span><span className="row-sub">{m("rowActions.noScore")}</span></span>
            </button>
          )}
          {routine && onEditRoutine && (
            <button className="row has-tile" onClick={() => run(() => onEditRoutine(it))}>
              <Tile color="var(--area-recovery)"><IconSpark size={18} /></Tile>
              <span className="row-main row-title">{m("rowActions.editRoutine")}</span>
              <Chev />
            </button>
          )}
          <button className="row has-tile" onClick={() => run(() => (done ? onUntick : onTick)(it))}>
            <Tile color="var(--success)"><IconCheck size={18} /></Tile>
            <span className="row-main row-title">{done ? m("rowActions.untick") : c("done")}</span>
          </button>
          {it.id === "gym" && (
            <Link className="row has-tile row-link" href={s.gym.run ? "/gym" : "/gym?start=1"} onClick={() => { play("nav"); onClose(); }}>
              <Tile color="var(--area-training)"><IconGym size={18} /></Tile>
              <span className="row-main row-title">{m("rowActions.gymSets")}</span>
              <Chev />
            </Link>
          )}
          <Link className="row has-tile row-link" href="/settings/schedule" onClick={() => play("nav")}>
            <Tile color="var(--area-consistency)"><IconList size={18} /></Tile>
            <span className="row-main row-title">{m("rowActions.editPlan")}</span>
            <Chev />
          </Link>
        </div>
      </Sheet>

      <Sheet open={!!item && mode === "skip"} title={m("rowActions.skipTitle", { title: it.title })} detent="medium" onClose={onClose}>
        <div className="sheet-meta">{m("rowActions.reason")}</div>
        <div className="chips move-chips">
          {SKIP_WHY.map(([w, t]) => <button key={w} className="chip" onClick={() => run(() => onSkipRoutine?.(it, w))}>{t}</button>)}
        </div>
      </Sheet>

      <Sheet open={!!item && mode === "move"} title={m("rowActions.moveTitle")} detent="medium" onClose={onClose}>
        <div className="sheet-meta">{it.title} · <span className="num">{hm(it.min)}</span></div>
        <div className="chips move-chips">
          {MOVE_BY.map(([d, label]) => {
            const t = it.min + d;
            return (
              <button key={d} className="chip" disabled={t > LAST} onClick={() => run(() => moveWithUndo(update, date, it, t))}>
                {label} <span className="num">{hm(t)}</span>
              </button>
            );
          })}
        </div>
        <Section footer={m("rowActions.moveFooter", { time: hm(ROLLOVER_HOUR * 60) })}>
          <label className="row form-row">
            <span className="row-main row-title">{m("rowActions.newTime")}</span>
            <input type="time" className="time-input" value={val} onChange={(e) => setVal(e.target.value)} />
          </label>
        </Section>
        <button className="btn" onClick={save}>{c("save")}</button>
        {planMin !== undefined && (
          <button className="btn secondary move-back" onClick={() => run(() => moveWithUndo(update, date, it, null))}>{m("rowActions.restore", { time: hm(planMin) })}</button>
        )}
      </Sheet>
    </>
  );
}
