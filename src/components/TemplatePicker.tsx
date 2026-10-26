"use client";

import Link from "next/link";
import { fmt, msgs } from "@/i18n";
import { rich } from "@/i18n/react";
import * as C from "@/i18n/msg/components";
import { hm } from "@/lib/date";
import { plannedType } from "@/lib/model";
import { buildDay, resolveTemplate } from "@/lib/schedule";
import { templateBudget } from "@/lib/stats";
import { useStore } from "@/lib/store";
import { TEMPLATE_BY_ID } from "@/lib/templates";
import { MiniTimeline } from "./MiniTimeline";
import { Section, Sheet } from "./ui";

const m = msgs(C);
const groups = (): [string, string[]][] => [
  [m("templatePicker.group.term"), ["term-gym", "term-live", "term-rest"]],
  [m("templatePicker.group.stream"), ["stream-gym", "stream-mc", "stream-marathon", "stream-rest"]],
  [m("templatePicker.group.noShift"), ["balanced", "game-max", "mc-build", "rest"]],
  [m("templatePicker.group.shift"), ["work-plus", "work-game"]],
];

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
      b.stream ? m("templatePicker.budget.stream", { t: fmt.dur(b.stream) }) : null,
      b.game ? m("templatePicker.budget.game", { t: fmt.dur(b.game) }) : null,
      b.sing ? m("templatePicker.budget.sing", { t: fmt.dur(b.sing) }) : null,
      b.mc ? m("templatePicker.budget.mc", { t: fmt.dur(b.mc) }) : null,
      b.gym ? m("templatePicker.budget.gym") : b.cardio ? m("templatePicker.budget.cardio") : null,
      trade ? m("templatePicker.budget.trade", { time: hm(trade.min) }) : null,
      def.work ? m("templatePicker.budget.work") : null,
    ].filter(Boolean).join(" · ");
    return (
      <button key={id} className="row tpl-card" aria-pressed={id === value} onClick={() => pick(id)}>
        <span className="tpl-dot" style={{ ["--tone" as string]: def.color }} />
        <span className="row-main">
          <div className="row-title">
            {def.name}
            {id === value && <span className="badge ok">{m("templatePicker.inUse")}</span>}
            {id === planned && !allowDefault && <span className="badge">{m("templatePicker.weekPlan")}</span>}
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
    <Sheet open={open} title={m("templatePicker.title")} onClose={onClose}>
      {allowDefault && (
        <Section>
          <button className="row tpl-card" aria-pressed={value === null} onClick={() => pick(null)}>
            <span className="tpl-dot" style={{ ["--tone" as string]: "var(--gray)" }} />
            <span className="row-main">
              <div className="row-title">{rich(m("templatePicker.default"), { badge: value === null && <span className="badge ok">{m("templatePicker.inUse")}</span> })}</div>
            </span>
          </button>
        </Section>
      )}
      {groups().map(([h, ids]) => <Section key={h} header={h}>{ids.map((id) => card(id))}</Section>)}
      {mine.length > 0 && <Section header={m("templatePicker.mine")}>{mine.map((t) => card(t.id, m("templatePicker.from", { name: TEMPLATE_BY_ID.get(t.from)?.name ?? t.from })))}</Section>}
      <Section header={m("templatePicker.classic")}>{["work", "off"].map((id) => card(id))}</Section>
      <div className="section-footer" style={{ textAlign: "center" }}>
        <Link href="/settings/schedule" className="link" onClick={onClose}>{m("templatePicker.link")}</Link>
      </div>
    </Sheet>
  );
}
