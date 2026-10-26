"use client";

import { useState } from "react";
import { MiniTimeline } from "@/components/MiniTimeline";
import { TemplatePicker } from "@/components/TemplatePicker";
import { ConfirmSheet, NavBar, Section, toast } from "@/components/ui";
import { applyWeekPlan } from "@/lib/actions";
import { addDays, logicalDate } from "@/lib/date";
import { plannedType } from "@/lib/model";
import { buildDay, resolveTemplate, templateExists } from "@/lib/schedule";
import { play } from "@/lib/sound";
import { timeBudget } from "@/lib/stats";
import { useStore } from "@/lib/store";
import { TEMPLATE_BY_ID, WEEK_PRESETS } from "@/lib/templates";
import { fmt, msgs } from "@/i18n";
import { useLang } from "@/i18n/react";
import * as W from "@/i18n/msg/app-settings-week";
import * as Common from "@/i18n/msg/common";

const m = msgs(W), c = msgs(Common);
const WEEK = [0, 1, 2, 3, 4, 5, 6];
const hrs = (m: number) => String(Math.round(m / 6) / 10);

// Weekly plan: settings.weekPlan[getDay()] picks the template of days not logged yet; null = old offWeekdays rule.
export default function WeekSettings() {
  const { s, update } = useStore();
  const lang = useLang();
  const DOW = WEEK.map((d) => fmt.dowShort(d, lang)), DAY = WEEK.map((d) => fmt.dowLong(d, lang));
  const [preset, setPreset] = useState<(typeof WEEK_PRESETS)[number] | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const today = logicalDate();
  const todayDow = new Date(today + "T12:00:00").getDay();
  const dateOf = (i: number) => addDays(today, (i - todayDow + 7) % 7);
  const plan = s.settings.weekPlan;
  const nameOf = (id: string) => resolveTemplate(s.schedule, id).def.name;
  const b = timeBudget(s, today);

  function setDay(i: number, id: string | null) {
    const prev = plan[i] ?? null;
    if (prev === id) return;
    play("done");
    update((x) => { x.settings.weekPlan[i] = id; });
    toast(`${DAY[i]}: ${id ? nameOf(id) : m("week.default")}`, { action: c("undo"), onAction: () => update((x) => { x.settings.weekPlan[i] = prev; }) });
  }

  return (
    <main className="screen">
      <NavBar title={m("week.title")} sub={m("week.sub")} />

      <Section header={m("week.presets.header")}>
        {WEEK_PRESETS.map((p) => (
          <button key={p.id} className="row tpl-card" onClick={() => { play("tap"); setPreset(p); }}>
            <span className="row-main">
              <div className="row-title">{p.name}</div>
              <div className="row-sub">{p.note}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }} aria-label={p.days.map((d, i) => `${DOW[i]} ${TEMPLATE_BY_ID.get(d)?.name ?? d}`).join(", ")}>
                {p.days.map((d, i) => <span key={i} className="tpl-dot" title={`${DOW[i]}: ${TEMPLATE_BY_ID.get(d)?.name ?? d}`} style={{ ["--tone" as string]: TEMPLATE_BY_ID.get(d)?.color ?? "var(--gray)" }} />)}
              </div>
            </span>
          </button>
        ))}
      </Section>

      <Section header={m("week.daily.header")} footer={m("week.daily.footer", {
        stream: b.stream ? m("week.daily.footerStream", { h: hrs(b.stream) }) : "", game: hrs(b.game), singDays: b.singDays, sing: hrs(b.sing),
        mc: hrs(b.mc), gym: b.gym, cardio: b.cardio, trade: b.trade,
      })}>
        {DAY.map((label, i) => {
          const date = dateOf(i);
          const id = plan[i];
          const set = !!id && templateExists(s.schedule, id);
          const type = plannedType(s, date);
          const { def } = resolveTemplate(s.schedule, type);
          const items = buildDay(type, undefined, s.schedule, 0, { date });
          const weekendTrade = (i === 0 || i === 6) && items.some((x) => x.kind === "trade");
          return (
            <button key={i} className="row tpl-card" onClick={() => { play("tap"); setSlot(i); }}>
              <span className="tpl-dot" style={{ ["--tone" as string]: !set ? "var(--gray)" : def.color }} />
              <span className="row-main">
                <div className="row-title">
                  {label}
                  {i === todayDow && <span className="badge">{c("today")}</span>}
                </div>
                <div className="row-sub">{set ? def.name : m("week.row.default", { kind: s.settings.offWeekdays.includes(i) ? m("week.kind.off") : m("week.kind.work") })}</div>
                <MiniTimeline items={items} work={def.work} />
                {weekendTrade && <div className="row-sub">{m("week.row.fxClosed")}</div>}
              </span>
            </button>
          );
        })}
      </Section>

      <Section header={m("week.base.header")} footer={m("week.base.footer")}>
        <div className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
          <span className="row-main">
            <div className="row-title">{m("week.base.title")}</div>
            <div className="row-sub">{m("week.base.sub")}</div>
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            {DOW.map((d, i) => {
              const on = s.settings.offWeekdays.includes(i);
              return (
                <button key={d} className={`chip chip--day ${on ? "on" : ""}`} aria-pressed={on} onClick={() => {
                  play("tap");
                  update((st) => { st.settings.offWeekdays = on ? st.settings.offWeekdays.filter((x) => x !== i) : [...st.settings.offWeekdays, i].sort(); });
                }}>{d}</button>
              );
            })}
          </div>
        </div>
      </Section>

      <ConfirmSheet
        open={preset !== null}
        title={m("week.confirm.title", { name: preset?.name ?? "" })}
        body={preset ? preset.days.map((d, i) => `${DOW[i]}: ${TEMPLATE_BY_ID.get(d)?.name ?? d}`).join(" · ") : undefined}
        confirmLabel={m("week.confirm.btn")}
        onClose={() => setPreset(null)}
        onConfirm={() => {
          if (!preset) return;
          const prev = [...plan];
          play("done");
          update((x) => applyWeekPlan(x, preset.days));
          toast(m("week.toast.applied", { name: preset.name }), { action: c("undo"), onAction: () => update((x) => { x.settings.weekPlan = prev; }) });
        }}
      />

      <TemplatePicker
        open={slot !== null}
        value={slot !== null && plan[slot] && templateExists(s.schedule, plan[slot]!) ? plan[slot] : null}
        date={dateOf(slot ?? todayDow)}
        allowDefault
        onPick={(id) => { if (slot !== null) setDay(slot, id); }}
        onClose={() => setSlot(null)}
      />
    </main>
  );
}
