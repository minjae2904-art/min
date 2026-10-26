"use client";

// Today-only reschedule with Undo: every change shows a toast whose เลิกทำ restores exactly the previous value.
import { msgs } from "@/i18n";
import * as C from "@/i18n/msg/components";
import * as Common from "@/i18n/msg/common";
import { moveItem, skipItem, snoozeTarget } from "@/lib/actions";
import { ROLLOVER_HOUR, hm } from "@/lib/date";
import { dayFor, type State } from "@/lib/model";
import { LAST, canReschedule, type Item } from "@/lib/schedule";
import { play } from "@/lib/sound";
import { toast } from "./ui";

const m = msgs(C), c = msgs(Common);

type Upd = (fn: (s: State) => void) => void;
type Field = "moved" | "skip";

// Put one map entry back as it was (undefined = absent); an emptied map is removed.
function restore(x: State, date: string, field: Field, id: string, prev: number | undefined) {
  const d = dayFor(x, date);
  const m = { ...d[field] };
  if (prev === undefined) delete m[id]; else m[id] = prev;
  if (Object.keys(m).length) d[field] = m; else delete d[field];
  d.reschedAt = Date.now();
  x.days[date] = d;
}

// prev is read inside the updater (the state the change applies to); the toast is tapped long after it ran.
function withUndo(update: Upd, date: string, field: Field, id: string, apply: (x: State) => void, msg: string, revert: boolean) {
  let prev: number | undefined;
  update((x) => { prev = x.days[date]?.[field]?.[id]; apply(x); });
  play(revert ? "undo" : "toggle");
  toast(msg, { action: c("undo"), onAction: () => update((x) => restore(x, date, field, id, prev)) }); // the toast action plays "undo"
}

export function moveWithUndo(update: Upd, date: string, item: Item, min: number | null) {
  if (!canReschedule(item)) return;
  const planned = item.planMin ?? item.min;
  const v = min === null ? planned : Math.max(ROLLOVER_HOUR * 60, Math.min(LAST, Math.round(min)));
  const back = v === planned;
  withUndo(update, date, "moved", item.id, (x) => moveItem(x, date, item, min),
    back ? m("reschedule.back", { time: hm(planned) }) : m("reschedule.moved", { title: item.title, time: hm(v) }), back);
}

export function snoozeWithUndo(update: Upd, date: string, item: Item, nowMin: number) {
  if (!canReschedule(item)) return;
  const to = snoozeTarget(item, nowMin);
  if (to <= item.min) { play("error"); toast(m("reschedule.tooLate", { time: hm(LAST) })); return; }
  withUndo(update, date, "moved", item.id, (x) => moveItem(x, date, item, to), m("reschedule.snoozed", { title: item.title, time: hm(to) }), false);
}

export function skipWithUndo(update: Upd, date: string, item: Item, on: boolean) {
  if (on && !canReschedule(item)) return;
  withUndo(update, date, "skip", item.id, (x) => skipItem(x, date, item, on),
    on ? m("reschedule.skipped", { title: item.title }) : m("reschedule.restored", { title: item.title }), !on);
}
