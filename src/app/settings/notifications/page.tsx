"use client";

import { useState } from "react";
import { IconDrop, IconEye, IconMoon } from "@/components/Icons";
import { PushDoctor } from "@/components/PushDoctor";
import { NavBar, Section, Segmented, Switch, Tile, toast } from "@/components/ui";
import { addDays, logicalDate, logicalMinutes } from "@/lib/date";
import { dayFor } from "@/lib/model";
import { buildDay } from "@/lib/schedule";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { fmt, langArr, msgs } from "@/i18n";
import * as C from "@/i18n/msg/app-settings-notifications";
import * as Common from "@/i18n/msg/common";

const m = msgs(C), c = msgs(Common);

const KINDS: [string, string][] = langArr<[string, string]>(() => [
  ["meal", m("notifications.kind.meal")], ["supp", "Whey / Creatine"], ["gym", m("notifications.kind.gym")], ["weigh", m("notifications.kind.weigh")],
  ["personality", m("notifications.kind.personality")], ["trade", m("notifications.kind.trade")], ["habit", m("notifications.kind.habit")], ["sleep", m("notifications.kind.sleep")],
  ["sing", m("notifications.kind.sing")], ["mc", m("notifications.kind.mc")], ["game", m("notifications.kind.game")],
  ["stream", m("notifications.kind.stream")],
  ["care", m("notifications.kind.care")],
]);

export default function NotificationSettings() {
  const { s, update } = useStore();
  const set = s.settings;
  const [now, setNow] = useState(() => Date.now());
  const dnd = set.dndUntil > now;

  const pause = (ms: number) => { play("toggle"); const t = Date.now(); setNow(t); update((st) => { st.settings.dndUntil = t + ms; }); toast(m("notifications.toast.paused")); };
  // Until the next planned wake-up (weigh item, same as SleepWake) - handy right before sleeping.
  // Once today's wake has passed, tomorrow's template decides (its wake may differ, e.g. a per-template override).
  const untilWake = () => {
    const d = new Date();
    const date = logicalDate(d);
    const nowMin = logicalMinutes(d);
    const day = dayFor(s, date);
    const items = buildDay(day.type, day.meal2, s.schedule, day.shiftMin ?? 0, { date });
    const wake = items.find((i) => i.id === "weigh")?.min ?? items[0]?.min ?? 13 * 60;
    let mins = wake - nowMin;
    if (mins <= 0) {
      const tom = dayFor(s, addDays(date, 1));
      const w2 = buildDay(tom.type, tom.meal2, s.schedule, tom.shiftMin ?? 0, { date: addDays(date, 1) }).find((i) => i.id === "weigh")?.min ?? 780;
      mins = w2 + 1440 - nowMin;
    }
    pause(mins * 60_000);
  };

  return (
    <main className="screen">
      <NavBar title={m("notifications.title")} />

      <PushDoctor />

      <Section header={m("notifications.pause.header")} footer={dnd ? m("notifications.pause.until", { time: fmt.dowClock(set.dndUntil) }) : m("notifications.pause.footer")}>
        {dnd ? (
          <button className="row" onClick={() => { play("toggle"); update((st) => { st.settings.dndUntil = 0; }); }}>
            <span className="icon-btn ic-purple"><IconMoon size={18} /></span>
            <span className="row-main row-title link">{m("notifications.pause.resume")}</span>
          </button>
        ) : (
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            <button className="chip" onClick={() => pause(3600e3)}>{m("notifications.h1")}</button>
            <button className="chip" onClick={() => pause(3 * 3600e3)}>{m("notifications.h3")}</button>
            <button className="chip" onClick={() => pause(8 * 3600e3)}>{m("notifications.h8")}</button>
            <button className="chip" onClick={untilWake}>{m("notifications.pause.wake")}</button>
          </div>
        )}
      </Section>

      <Section header={m("notifications.format.header")} footer={m("notifications.format.footer")}>
        <div className="row">
          <span className="row-main">
            <div className="row-title">{m("notifications.showTime.title")}</div>
            <div className="row-sub">{m("notifications.showTime.sub")}</div>
          </span>
          <Switch label={m("notifications.showTime.title")} on={set.notifShowTime} onChange={(v) => update((st) => { st.settings.notifShowTime = v; })} />
        </div>
        <div className="row">
          <span className="row-main">
            <div className="row-title">{m("notifications.phase.title")}</div>
            <div className="row-sub">{m("notifications.phase.sub")}</div>
          </span>
          <Switch label={m("notifications.phase.title")} on={set.notifyPhase} onChange={(v) => update((st) => { st.settings.notifyPhase = v; })} />
        </div>
        <div className="row">
          <span className="row-main">
            <div className="row-title">{m("notifications.brief.title")}</div>
            <div className="row-sub">{m("notifications.brief.sub")}</div>
          </span>
          <Switch label={m("notifications.brief.title")} on={set.notifyBriefing} onChange={(v) => update((st) => { st.settings.notifyBriefing = v; })} />
        </div>
      </Section>

      <Section header={m("notifications.kinds.header")} footer={m("notifications.kinds.footer")}>
        {KINDS.map(([k, label]) => (
          <div key={k} className="row">
            <span className="row-main row-title">{label}</span>
            <Switch label={label} on={set.notifyKinds[k] !== false} onChange={(v) => update((st) => { st.settings.notifyKinds = { ...st.settings.notifyKinds, [k]: v }; })} />
          </div>
        ))}
      </Section>

      <Section footer={m("notifications.break.footer")}>
        <div className="row mini-seg">
          <span className="row-main row-title">{m("notifications.break.title")}</span>
          <div className="row-ctrl lg">
            <Segmented label={m("notifications.break.title")} value={String(set.gameBreakMin)} options={[["0", c("off")], ["30", "30"], ["45", "45"], ["60", "60"], ["90", "90"]]} onChange={(v) => update((st) => { st.settings.gameBreakMin = Number(v); })} />
          </div>
        </div>
        <div className="row">
          <span className="row-main">
            <div className="row-title">{m("notifications.wrap.title")}</div>
            <div className="row-sub">{m("notifications.wrap.sub")}</div>
          </span>
          <Switch label={m("notifications.wrap.title")} on={set.notifyStreamWrap} onChange={(v) => update((st) => { st.settings.notifyStreamWrap = v; })} />
        </div>
      </Section>

      <Section header={m("notifications.follow.header")} footer={m("notifications.follow.footer")}>
        <div className="row mini-seg">
          <span className="row-main row-title">{m("notifications.follow.title")}</span>
          <div className="row-ctrl md">
            <Segmented label={m("notifications.follow.label")} value={String(set.followUpMin)} options={[["0", c("off")], ["15", "15"], ["30", "30"], ["45", "45"], ["60", "60"]]} onChange={(v) => update((st) => { st.settings.followUpMin = Number(v); })} />
          </div>
        </div>
      </Section>

      <Section header={m("notifications.types.header")}>
        <div className="row has-tile">
          <Tile color="var(--teal)"><IconDrop size={18} /></Tile>
          <span className="row-main">
            <div className="row-title">{m("notifications.water.title")}</div>
            <div className="row-sub">{m("notifications.water.sub")}</div>
          </span>
          <Switch label={m("notifications.water.title")} on={set.notifyWater} onChange={(v) => update((st) => { st.settings.notifyWater = v; })} />
        </div>
        {set.notifyWater && (
          <div className="row mini-seg">
            <span className="row-main row-title">{m("notifications.water.every")}</span>
            <div className="row-ctrl md">
              <Segmented label={m("notifications.water.everyLabel")} value={String(set.waterEveryMin)} options={[["60", m("notifications.h1")], ["90", "1.5"], ["120", m("notifications.h2")], ["180", m("notifications.h3")]]} onChange={(v) => update((st) => { st.settings.waterEveryMin = Number(v); })} />
            </div>
          </div>
        )}
        <div className="row has-tile">
          <Tile color="var(--purple)"><IconMoon size={18} /></Tile>
          <span className="row-main">
            <div className="row-title">{m("notifications.summary.title")}</div>
            <div className="row-sub">{m("notifications.summary.sub")}</div>
          </span>
          <Switch label={m("notifications.summary.title")} on={set.notifySummary} onChange={(v) => update((st) => { st.settings.notifySummary = v; })} />
        </div>
        <div className="row has-tile">
          <Tile color="var(--gray)"><IconEye size={18} /></Tile>
          <span className="row-main">
            <div className="row-title">{m("notifications.private.title")}</div>
            <div className="row-sub">{m("notifications.private.sub")}</div>
          </span>
          <Switch label={m("notifications.private.title")} on={set.privateNotifications} onChange={(v) => update((st) => { st.settings.privateNotifications = v; })} />
        </div>
      </Section>

      <Section header={m("notifications.badge.header")} footer={m("notifications.badge.footer")}>
        <div className="row">
          <span className="row-main"><div className="row-title">{m("notifications.badge.title")}</div></span>
          <Switch label={m("notifications.badge.title")} on={set.badge} onChange={(v) => { play("toggle"); update((st) => { st.settings.badge = v; }); }} />
        </div>
      </Section>

      <Section footer={m("notifications.items.footer")}>
        <div className="row"><span className="row-main row-sub">{m("notifications.system.note")}</span></div>
      </Section>
    </main>
  );
}
