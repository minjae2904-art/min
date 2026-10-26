"use client";

// v1.8 "แผนช่วงเปิดเทอม": the term week preset with an optional sleep taper. Nothing changes without a tap; one undo
// restores weekPlan, planAsked and the taper. The body is shared by the Today notice sheet and the Settings sheet.
import { Sheet, toast } from "@/components/ui";
import { startTermSeason, taperOffer } from "@/lib/actions";
import { thaiDate } from "@/lib/brain/copy";
import { hm, logicalDate } from "@/lib/date";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { TERM_PRESET } from "@/lib/templates";

export const TERM_PLAN_BODY = "วันเรียน: ตื่น 08:00 · ยิมหลังเลิกเรียน 16:30 · ไลฟ์ 18:45-23:45 (5 ชม.) · นอน 00:30 · เสาร์ไลฟ์มาราธอน · อาทิตย์ไลฟ์ชิล 18:30-23:30 นอน 00:30 · เปลี่ยนแผนสัปดาห์ตั้งแต่วันนี้";

export function TermPlanBody({ close, onLater }: { close: () => void; onLater?: () => void }) {
  const { s, update } = useStore();
  const today = logicalDate();
  const term = s.schedule.term;
  const offer = taperOffer(s, today, 30, TERM_PRESET);
  const taper = offer && term && offer.doneDate < term.start ? offer : null;

  function apply(withTaper: boolean) {
    const prev = { weekPlan: [...s.settings.weekPlan], planAsked: s.settings.planAsked, taper: structuredClone(s.schedule.taper ?? null) };
    play("done");
    update((x) => { startTermSeason(x, today, withTaper); });
    toast(`ตั้งแผนช่วงเปิดเทอมแล้ว${s.days[today] ? " · วันนี้ยังใช้แผนเดิม" : ""}`, {
      action: "เลิกทำ", onAction: () => update((x) => { x.settings.weekPlan = prev.weekPlan; x.settings.planAsked = prev.planAsked; x.schedule.taper = prev.taper; }),
    });
    close();
  }

  return (
    <div className="notice-sheet">
      <div className="sw-sub">{TERM_PLAN_BODY}</div>
      {taper && <div className="sw-sub">ค่อยๆ เลื่อน: เริ่มวัน{thaiDate(taper.start)} ตื่น {hm(taper.firstWake)} แล้วตื่นเร็วขึ้นวันละ 30 นาที ถึงเวลาวันเรียนวัน{thaiDate(taper.doneDate)} ก่อนเปิดเทอม</div>}
      {s.days[today] && <div className="sw-sub">วันนี้ยังใช้แผนเดิม แตะชื่อแผนในหน้าวันนี้เพื่อเปลี่ยน</div>}
      <div className="sw-actions">
        {taper && <button className="chip chip--fill" onClick={() => apply(true)}>ค่อยๆ เลื่อนเวลานอน (แนะนำ)</button>}
        <button className={`chip ${taper ? "" : "chip--fill"}`} onClick={() => apply(false)}>ใช้ตั้งแต่วันนี้</button>
        <button className="chip" onClick={() => { play("tap"); onLater?.(); close(); }}>ไว้ทีหลัง</button>
      </div>
    </div>
  );
}

export function TermPlan({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} title="แผนช่วงเปิดเทอม" detent="medium" onClose={onClose}>
      <TermPlanBody close={onClose} />
    </Sheet>
  );
}
