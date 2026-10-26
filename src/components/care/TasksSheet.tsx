"use client";

// Periodic tasks sheet "งานตามรอบ" (v1.7 spec 4.4): never scored, never pushed. Every action has an exact undo.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { Sheet, toast } from "@/components/ui";
import { daysBetween } from "@/lib/care/cadence";
import { doTask, dueTasks, skipTask, snoozeTask } from "@/lib/care/progress";
import type { CareTask } from "@/lib/care/types";
import type { State } from "@/lib/model";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { msgs } from "@/i18n";
import { useLang } from "@/i18n/react";
import { careTaskText } from "@/i18n/stored";
import { headText } from "./CareSheet";
import * as C from "@/i18n/msg/components-care";
import * as Common from "@/i18n/msg/common";

const m = msgs(C), c = msgs(Common);

export function taskWhen(s: State, t: CareTask, date: string): string {
  const l = s.care.last[t.id];
  return m("tasksSheet.when", { every: t.every, last: l ? m("tasksSheet.last", { n: Math.max(0, daysBetween(l, date)) }) : m("tasksSheet.never") });
}

// all = every task that is on (Body page); otherwise only the due ones.
export function TasksSheet({ open, date, all, onClose }: { open: boolean; date: string; all?: boolean; onClose: () => void }) {
  const { s, update } = useStore();
  const router = useRouter();
  useLang();
  const [mole, setMole] = useState(false);
  const list = all ? s.care.tasks.filter((t) => t.on) : dueTasks(s, date);

  // Snapshot of the keys a task action touches; the undo puts each back (absent stays absent).
  function act(t: CareTask, fn: (x: State) => void, msg: string) {
    const last = s.care.last[t.id], sn = s.care.snooze["t:" + t.id], ms = s.care.ms.mole;
    play("done");
    update(fn);
    toast(msg, { action: c("undo"), onAction: () => update((x) => {
      if (last) x.care.last[t.id] = last; else delete x.care.last[t.id];
      if (sn) x.care.snooze["t:" + t.id] = sn; else delete x.care.snooze["t:" + t.id];
      if (t.id === "mole") { if (ms) x.care.ms.mole = ms; else delete x.care.ms.mole; }
    }) });
  }
  const short = (t: CareTask) => headText(careTaskText(t.title));

  return (
    <Sheet open={open} title={m("tasksSheet.title")} detent="medium" onClose={() => { setMole(false); onClose(); }}>
      <div className="group">
        {list.map((t) => (
          <div key={t.id} className="row care-task">
            <span className="row-main">
              <span className="row-title">{careTaskText(t.title)}</span>
              <span className="row-sub">{taskWhen(s, t, date)}{t.hint ? ` · ${careTaskText(t.hint)}` : ""}</span>
              {t.id === "mole" && mole ? (
                <span className="chips care-task-acts">
                  <span className="row-sub">{m("tasksSheet.mole.result")}</span>
                  <button className="chip chip--sm" onClick={() => { setMole(false); act(t, (x) => { doTask(x, t.id, date); x.care.ms.mole = 1; }, m("tasksSheet.mole.toastOk")); }}>{c("normal")}</button>
                  <button className="chip chip--sm" onClick={() => { setMole(false); act(t, (x) => { doTask(x, t.id, date); x.care.ms.mole = 3; }, m("tasksSheet.mole.toastBad")); }}>{m("tasksSheet.mole.bad")}</button>
                </span>
              ) : (
                <span className="chips care-task-acts">
                  <button className="chip chip--sm" onClick={() => { if (t.id === "mole") { play("tap"); setMole(true); } else act(t, (x) => doTask(x, t.id, date), m("tasksSheet.toast.done", { task: short(t) })); }}>{c("done")}</button>
                  <button className="chip chip--sm" onClick={() => act(t, (x) => snoozeTask(x, t.id, date, 2), m("tasksSheet.toast.snooze", { task: short(t) }))}>{m("tasksSheet.snooze")}</button>
                  <button className="chip chip--sm" onClick={() => act(t, (x) => skipTask(x, t.id, date), m("tasksSheet.toast.skip", { task: short(t) }))}>{m("tasksSheet.skip")}</button>
                </span>
              )}
            </span>
          </div>
        ))}
        {!list.length && <EmptyState title={m("tasksSheet.empty")} action={{ label: m("tasksSheet.viewAll"), onClick: () => { play("nav"); setMole(false); onClose(); router.push("/settings/care"); } }} />}
      </div>
      <div className="section-footer">{m("tasksSheet.footer")}</div>
    </Sheet>
  );
}
