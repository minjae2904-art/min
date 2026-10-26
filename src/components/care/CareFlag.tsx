"use client";

// Doctor-flag notice body (v1.7 spec 3.6 / 4.1): general wellness wording, never a diagnosis; snooze 14 days with undo.
import { toast } from "@/components/ui";
import { snoozeFlag, type CareFlag as Flag } from "@/lib/care/flags";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";

export function CareFlag({ flag, date, close }: { flag: Flag; date: string; close: () => void }) {
  const { s, update } = useStore();
  function snooze() {
    const key = "f:" + flag.id, prev = s.care.snooze[key];
    play("toggle");
    close();
    update((x) => snoozeFlag(x, flag.id, date));
    toast("จะเตือนอีกใน 14 วัน", { action: "เลิกทำ", onAction: () => update((x) => { if (prev) x.care.snooze[key] = prev; else delete x.care.snooze[key]; }) });
  }
  return (
    <div className="notice-sheet care-flag">
      <div className="sw-sub">{flag.body}</div>
      <div className="sw-sub"><b>ควรพบ:</b> {flag.who}</div>
      {flag.tips.length > 0 && <ul className="care-tips">{flag.tips.map((t) => <li key={t}>{t}</li>)}</ul>}
      {flag.heuristic && <div className="sw-sub">เกณฑ์โดยประมาณ</div>}
      <div className="sw-sub">ไม่ใช่การวินิจฉัย · ข้อมูลสุขภาพทั่วไป</div>
      <div className="sw-actions">
        {flag.call && <a className="chip chip--fill" href={`tel:${flag.call}`}>โทร {flag.call}</a>}
        <button className="chip" onClick={snooze}>เตือนอีกใน 14 วัน</button>
      </div>
    </div>
  );
}
