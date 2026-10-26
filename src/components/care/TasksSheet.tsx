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

export function taskWhen(s: State, t: CareTask, date: string): string {
  const l = s.care.last[t.id];
  return `ทุก ${t.every} วัน · ${l ? `ล่าสุด ${Math.max(0, daysBetween(l, date))} วันก่อน` : "ยังไม่เคยบันทึก"}`;
}

// all = every task that is on (Body page); otherwise only the due ones.
export function TasksSheet({ open, date, all, onClose }: { open: boolean; date: string; all?: boolean; onClose: () => void }) {
  const { s, update } = useStore();
  const router = useRouter();
  const [mole, setMole] = useState(false);
  const list = all ? s.care.tasks.filter((t) => t.on) : dueTasks(s, date);

  // Snapshot of the keys a task action touches; the undo puts each back (absent stays absent).
  function act(t: CareTask, fn: (x: State) => void, msg: string) {
    const last = s.care.last[t.id], sn = s.care.snooze["t:" + t.id], ms = s.care.ms.mole;
    play("done");
    update(fn);
    toast(msg, { action: "เลิกทำ", onAction: () => update((x) => {
      if (last) x.care.last[t.id] = last; else delete x.care.last[t.id];
      if (sn) x.care.snooze["t:" + t.id] = sn; else delete x.care.snooze["t:" + t.id];
      if (t.id === "mole") { if (ms) x.care.ms.mole = ms; else delete x.care.ms.mole; }
    }) });
  }
  const short = (t: CareTask) => t.title.split(" ")[0];

  return (
    <Sheet open={open} title="งานตามรอบ" detent="medium" onClose={() => { setMole(false); onClose(); }}>
      <div className="group">
        {list.map((t) => (
          <div key={t.id} className="row care-task">
            <span className="row-main">
              <span className="row-title">{t.title}</span>
              <span className="row-sub">{taskWhen(s, t, date)}{t.hint ? ` · ${t.hint}` : ""}</span>
              {t.id === "mole" && mole ? (
                <span className="chips care-task-acts">
                  <span className="row-sub">ผลส่องไฝ:</span>
                  <button className="chip chip--sm" onClick={() => { setMole(false); act(t, (x) => { doTask(x, t.id, date); x.care.ms.mole = 1; }, "บันทึกส่องไฝแล้ว"); }}>ปกติ</button>
                  <button className="chip chip--sm" onClick={() => { setMole(false); act(t, (x) => { doTask(x, t.id, date); x.care.ms.mole = 3; }, "บันทึกแล้ว · ควรให้แพทย์ผิวหนังดู"); }}>มีไฝเปลี่ยน คัน หรือเลือดออก</button>
                </span>
              ) : (
                <span className="chips care-task-acts">
                  <button className="chip chip--sm" onClick={() => { if (t.id === "mole") { play("tap"); setMole(true); } else act(t, (x) => doTask(x, t.id, date), `${short(t)} ทำแล้ว`); }}>ทำแล้ว</button>
                  <button className="chip chip--sm" onClick={() => act(t, (x) => snoozeTask(x, t.id, date, 2), `เลื่อน ${short(t)} 2 วัน`)}>เลื่อน 2 วัน</button>
                  <button className="chip chip--sm" onClick={() => act(t, (x) => skipTask(x, t.id, date), `ข้ามรอบนี้ของ ${short(t)}`)}>ข้ามรอบนี้</button>
                </span>
              )}
            </span>
          </div>
        ))}
        {!list.length && <EmptyState title="ไม่มีงานที่ครบรอบตอนนี้" action={{ label: "ดูงานทั้งหมด", onClick: () => { play("nav"); setMole(false); onClose(); router.push("/settings/care"); } }} />}
      </div>
      <div className="section-footer">ไม่นับคะแนน ไม่แจ้งเตือน ทำช้าก็แค่ค้างไว้</div>
    </Sheet>
  );
}
