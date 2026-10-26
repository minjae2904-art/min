"use client";

import Link from "next/link";
import { hm } from "@/lib/date";
import { plannedType } from "@/lib/model";
import { buildDay, resolveTemplate } from "@/lib/schedule";
import { templateBudget } from "@/lib/stats";
import { useStore } from "@/lib/store";
import { TEMPLATE_BY_ID } from "@/lib/templates";
import { MiniTimeline } from "./MiniTimeline";
import { Section, Sheet } from "./ui";

const GROUPS: [string, string[]][] = [
  ["ช่วงเปิดเทอม", ["term-gym", "term-live", "term-rest"]],
  ["ช่วงไลฟ์ (ก่อนเปิดเทอม)", ["stream-gym", "stream-mc", "stream-marathon", "stream-rest"]],
  ["ไม่มีกะงาน", ["balanced", "game-max", "mc-build", "rest"]],
  ["มีกะงาน 16:00-02:00", ["work-plus", "work-game"]],
];
const span = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} ชม.${m % 60 ? ` ${m % 60} น.` : ""}` : `${m} น.`);

// Sheet listing every day plan with its timeline and planned time budget. One tap picks and closes.
// allowDefault adds a "no plan" row (week planner slots) that picks null.
export function TemplatePicker({ open, value, date, allowDefault, onPick, onClose }: {
  open: boolean; value: string | null; date: string; allowDefault?: boolean; onPick: (id: string | null) => void; onClose: () => void;
}) {
  const { s } = useStore();
  const planned = plannedType(s, date);
  const pick = (id: string | null) => { onPick(id); onClose(); };

  function card(id: string, sub?: string) {
    const { def } = resolveTemplate(s.schedule, id);
    const items = buildDay(id, undefined, s.schedule, 0, { date });
    const b = templateBudget(s.schedule, id, date);
    const trade = items.find((i) => i.kind === "trade");
    const budget = [
      b.stream ? `ไลฟ์ ${span(b.stream)}` : null,
      b.game ? `เกม ${span(b.game)}` : null,
      b.sing ? `ร้อง ${span(b.sing)}` : null,
      b.mc ? `เซิฟ ${span(b.mc)}` : null,
      b.gym ? "ยิม" : b.cardio ? "คาร์ดิโอเบา" : null,
      trade ? `เทรด ${hm(trade.min)}` : null,
      def.work ? "มีกะงาน" : null,
    ].filter(Boolean).join(" · ");
    return (
      <button key={id} className="row tpl-card" aria-pressed={id === value} onClick={() => pick(id)}>
        <span className="tpl-dot" style={{ ["--tone" as string]: def.color }} />
        <span className="row-main">
          <div className="row-title">
            {def.name}
            {id === value && <span className="badge ok">ใช้อยู่</span>}
            {id === planned && !allowDefault && <span className="badge">ตามแผนสัปดาห์</span>}
          </div>
          <div className="row-sub">{sub ?? def.short}</div>
          <MiniTimeline items={items} work={def.work} />
          {budget && <div className="row-sub">{budget}</div>}
        </span>
      </button>
    );
  }

  const mine = s.schedule.templates ?? [];
  return (
    <Sheet open={open} title="เลือกแผน" onClose={onClose}>
      {allowDefault && (
        <Section>
          <button className="row tpl-card" aria-pressed={value === null} onClick={() => pick(null)}>
            <span className="tpl-dot" style={{ ["--tone" as string]: "var(--gray)" }} />
            <span className="row-main">
              <div className="row-title">ตามค่าพื้นฐาน (วันทำงาน/วันหยุด แบบเดิม){value === null && <span className="badge ok">ใช้อยู่</span>}</div>
            </span>
          </button>
        </Section>
      )}
      {GROUPS.map(([h, ids]) => <Section key={h} header={h}>{ids.map((id) => card(id))}</Section>)}
      {mine.length > 0 && <Section header="ของฉัน">{mine.map((t) => card(t.id, `จาก ${TEMPLATE_BY_ID.get(t.from)?.name ?? t.from}`))}</Section>}
      <Section header="แบบเดิม">{["work", "off"].map((id) => card(id))}</Section>
      <div className="section-footer" style={{ textAlign: "center" }}>
        <Link href="/settings/schedule" className="link" onClick={onClose}>ปรับเวลา/ทำสำเนา ที่ ตั้งค่า &gt; แผนประจำวัน</Link>
      </div>
    </Sheet>
  );
}
