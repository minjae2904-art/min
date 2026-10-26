"use client";

// v1.8 "เวลาเรียนชนกับแผน": fixable clashes of one date with up to 3 fix chips each (template fix shown once), hints,
// and one list-level week fix. A fix applies only on tap, with undo (snapFix/undoFix). Other dates get template and
// week fixes only (termClashes today: false).
import { Sheet, toast } from "@/components/ui";
import { thaiDate } from "@/lib/brain/copy";
import { applyTermFix, snapFix, termClashes, undoFix, weekFix, type Clash, type TermFix } from "@/lib/clash";
import { logicalMinutes } from "@/lib/date";
import type { State } from "@/lib/model";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";

// Fixable clashes of `date`. Today, time that has passed drops a clash or a lever: an overlap after its class ends or
// 30+ min after the item's start, an early clash after the wake tap or the class start, a move into the past, a
// whole-day shift after the wake tap. A clash with no lever left is dropped (fixless ones live in /settings/term).
export function clashesNow(s: State, date: string, today: string, nowMin: number): Clash[] {
  const list = termClashes(s, date, { today: date === today });
  if (date !== today) return list.filter((c) => c.fixable);
  const woke = !!s.days[date]?.wakeAt;
  return list.flatMap((c) => {
    if (c.kind === "overlap" && (c.cls.e <= nowMin || (c.item && c.item.min + 30 < nowMin))) return [];
    if (c.kind === "early" && (c.cls.s <= nowMin || woke)) return [];
    const fixes = c.fixes.filter((f) => !(f.k === "move" && (f.to ?? 0) < nowMin) && !(f.k === "shift" && woke));
    return fixes.length ? [{ ...c, fixes, fixable: true }] : [];
  });
}

export function ClashBody({ date, today, close }: { date: string; today: string; close: () => void }) {
  const { s, update } = useStore();
  const isToday = date === today;
  const list = clashesNow(s, date, today, logicalMinutes());
  const wk = list.some((c) => c.fixes.some((f) => f.k === "week")) ? weekFix(s) : null;

  function run(f: TermFix) {
    const snap = snapFix(s, date);
    play("done");
    update((x) => applyTermFix(x, date, f));
    toast(`${f.label} แล้ว`, { action: "เลิกทำ", onAction: () => update((x) => undoFix(x, snap)) });
    close();
  }

  if (!list.length) return <div className="notice-sheet"><div className="sw-sub">ตอนนี้เวลาเรียนไม่ชนกับแผนแล้ว</div></div>;
  const seen = new Set<string>();
  const rows = list.map((c) => {
    const fixes = c.fixes.filter((f) => {
      if (f.k === "week") return false;
      if (f.k !== "tpl") return true;
      if (seen.has(f.tpl ?? "")) return false;
      seen.add(f.tpl ?? "");
      return true;
    });
    return { c, fixes };
  });
  return (
    <div className="notice-sheet clash-list">
      {!isToday && <div className="sw-sub">วัน{thaiDate(date)}</div>}
      {rows.map(({ c, fixes }, k) => (
        <div key={`${c.kind}-${c.cls.id}-${c.item?.id ?? ""}-${k}`} className="clash-item">
          <div className="clash-text">{c.text}</div>
          {fixes.length > 0 && (
            <div className="sw-actions">
              {fixes.map((f) => <button key={`${f.k}-${f.id ?? f.tpl ?? ""}`} className="chip chip--tint" onClick={() => run(f)}>{f.label}</button>)}
            </div>
          )}
          {c.hint && <div className="sw-sub">{c.hint}</div>}
        </div>
      ))}
      {wk && <div className="sw-actions"><button className="chip chip--fill" onClick={() => run(wk)}>{wk.label}</button></div>}
      <div className="sw-sub clash-foot">{isToday ? "แก้เฉพาะวันนี้" : "แก้เฉพาะวันนั้น"} เลิกทำได้ · ถ้าชนทุกสัปดาห์ ลองใช้แผนช่วงเปิดเทอม</div>
    </div>
  );
}

// The parent keeps `date` after closing so the content stays through the exit animation.
export function ClashSheet({ open, date, today, onClose }: { open: boolean; date: string; today: string; onClose: () => void }) {
  return (
    <Sheet open={open} title="เวลาเรียนชนกับแผน" detent="medium" onClose={onClose}>
      <ClashBody date={date} today={today} close={onClose} />
    </Sheet>
  );
}
