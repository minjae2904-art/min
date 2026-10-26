"use client";

// Post-live recap (v1.7 G3). Real minutes were already written at "จบไลฟ์"; this sheet only adds mood / voice chips
// (and an optional voice rest tomorrow). Planned budgets never change. General wellness only.
import { useState } from "react";
import { Section, Sheet, toast } from "@/components/ui";
import { addDays } from "@/lib/date";
import { dayFor, type State } from "@/lib/model";
import { hmClock, recapOf, setRecap } from "@/lib/session";
import { useStore } from "@/lib/store";
import { langArr, msgs } from "@/i18n";
import * as C from "@/i18n/msg/components-live";
import * as Common from "@/i18n/msg/common";

const m = msgs(C), c = msgs(Common);
const MOOD: [1 | 2 | 3, string][] = langArr(() => [[1, m("liveRecap.mood.1")], [2, m("liveRecap.mood.2")], [3, m("liveRecap.mood.3")]]);
const VOICE: [0 | 1 | 2, string][] = langArr(() => [[0, m("liveRecap.voice.0")], [1, m("liveRecap.voice.1")], [2, m("liveRecap.voice.2")]]);
const clockMin = (min: number) => hmClock(min * 60_000);
const markText = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;

// Exact undo of setRecap: live mood/v, sing, tomorrow's voice rest (and whether tomorrow's log existed).
type Snap = { date: string; live?: { mood?: 1 | 2 | 3; v?: 0 | 1 | 2 }; sing?: { min?: 10 | 20 | 30 | 45; strain?: boolean }; tmrHad: boolean; tmrRest?: boolean };
function snapOf(s: State, date: string): Snap {
  const d = s.days[date], t = s.days[addDays(date, 1)];
  return structuredClone({ date, live: d?.live ? { mood: d.live.mood, v: d.live.v } : undefined, sing: d?.sing, tmrHad: !!t, tmrRest: t?.voiceRest });
}
function restoreOf(x: State, p: Snap) {
  const d = x.days[p.date];
  if (d?.live) {
    if (p.live?.mood === undefined) delete d.live.mood; else d.live.mood = p.live.mood;
    if (p.live?.v === undefined) delete d.live.v; else d.live.v = p.live.v;
  }
  if (d) { if (p.sing === undefined) delete d.sing; else d.sing = structuredClone(p.sing); }
  const tk = addDays(p.date, 1);
  if (!p.tmrHad) delete x.days[tk];
  else if (x.days[tk]) { if (p.tmrRest) x.days[tk].voiceRest = true; else delete x.days[tk].voiceRest; }
}

export function LiveRecap({ date, onClose }: { date: string | null; onClose: () => void }) {
  const { s, update } = useStore();
  const [mood, setMood] = useState<1 | 2 | 3 | undefined>(undefined);
  const [v, setV] = useState<0 | 1 | 2 | undefined>(undefined);
  const [rest, setRest] = useState(false);
  const [prevDate, setPrevDate] = useState<string | null>(null);
  // Render-time reset per opened recap: chips start from what the day already has.
  if (date !== prevDate) {
    setPrevDate(date);
    const l = date ? dayFor(s, date).live : undefined;
    setMood(l?.mood); setV(l?.v); setRest(false);
  }
  const r = date ? recapOf(s, date) : null;

  function save() {
    if (!date) return;
    const p = snapOf(s, date);
    update((x) => setRecap(x, date, { mood, v, restTomorrow: v === 2 && rest }));
    toast(v === 2 && rest ? m("liveRecap.toast.rest") : m("liveRecap.toast.saved"), { action: c("undo"), onAction: () => update((x) => restoreOf(x, p)) });
    onClose();
  }

  const delta = r && r.planMin !== null ? r.min - r.planMin : null;
  return (
    <Sheet open={!!date} title={m("liveRecap.title")} onClose={onClose}>
      {r && (
        <>
          <div className="group lv-recap">
            <div className="row"><span className="row-main row-title num">
              {m("liveRecap.live", { time: clockMin(r.min), plan: r.planMin !== null ? m("liveRecap.plan", { plan: clockMin(r.planMin), sign: delta! > 0 ? "+" : delta! < 0 ? "-" : "", n: Math.abs(delta!) }) : "" })}
            </span></div>
            <div className="row"><span className="row-main row-title num">{m("liveRecap.breaks", { ok: r.ok, seen: r.seen, br: r.br })}</span></div>
            <div className="row"><span className="row-main">
              <span className="row-title num">{r.marks.length ? m("liveRecap.marks", { n: r.marks.length, list: r.marks.map(markText).join(" · ") }) : m("liveRecap.noMarks")}</span>
              {r.marks.length > 0 && r.clipsAt && <span className="row-sub num">{m("liveRecap.clipsAt", { at: r.clipsAt })}</span>}
            </span></div>
            {r.overMin !== null && r.overMin > 15 && (
              <div className="row"><span className="row-main row-sub num">{m("liveRecap.over", { min: r.overMin, sleep: r.sleepAt ? m("liveRecap.sleepAt", { time: r.sleepAt }) : "" })}</span></div>
            )}
          </div>
          <Section header={m("liveRecap.feel")}>
            <div className="row chips lv-chiprow">
              {MOOD.map(([k, t]) => <button key={k} type="button" className={`chip ${mood === k ? "on" : ""}`} aria-pressed={mood === k} onClick={() => setMood(mood === k ? undefined : k)}>{t}</button>)}
            </div>
          </Section>
          <Section header={m("liveRecap.voice")}>
            <div className="row chips lv-chiprow">
              {VOICE.map(([k, t]) => <button key={k} type="button" className={`chip ${v === k ? "on" : ""}`} aria-pressed={v === k} onClick={() => setV(v === k ? undefined : k)}>{t}</button>)}
              {v === 2 && <button type="button" className={`chip ${rest ? "on" : ""}`} aria-pressed={rest} onClick={() => setRest(!rest)}>{m("liveRecap.restTomorrow")}</button>}
            </div>
          </Section>
          {v === 2 && <div className="section-footer lv-recap-note">{m("liveRecap.note")}</div>}
          <button className="btn lv-save" onClick={save}>{c("save")}</button>
        </>
      )}
    </Sheet>
  );
}
