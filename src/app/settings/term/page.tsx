"use client";

import { useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { IconPlus } from "@/components/Icons";
import { ClashSheet } from "@/components/term/ClashSheet";
import { ClassSheet } from "@/components/term/ClassSheet";
import { TermPlan } from "@/components/term/TermPlan";
import { Chev, NavBar, Section, toast } from "@/components/ui";
import { msgs } from "@/i18n";
import * as P from "@/i18n/msg/app-settings-term";
import * as Common from "@/i18n/msg/common";
import { dowName, thaiDate } from "@/lib/brain/copy";
import { earlyNote, isTermWeek, termClashes, weekClashes } from "@/lib/clash";
import { logicalDate } from "@/lib/date";
import { GO_DEFAULT, termDefault, type Cls, type Term } from "@/lib/model";
import { resolveTemplate } from "@/lib/schedule";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { TERM_PRESET, WEEK_PRESETS } from "@/lib/templates";
import { OFF_CAP, clsSpan, dowOf, goOf, sanitizeTerm } from "@/lib/term";

const m = msgs(P), cm = msgs(Common);
const dayN = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86_400_000);

// v1.8 Settings > ตารางเรียน: term dates, travel time, classes, no-class days, this week's clashes and the term week plan.
export default function TermSettings() {
  const { s, update } = useStore();
  const today = logicalDate();
  const t = s.schedule.term ?? null;
  const [draft, setDraft] = useState<{ start: string; end: string } | null>(null);
  const [offAdd, setOffAdd] = useState("");
  const [cls, setCls] = useState<{ open: boolean; edit: Cls | null; n: number }>({ open: false, edit: null, n: 0 });
  const [clash, setClash] = useState<{ open: boolean; date: string }>({ open: false, date: today });
  const [plan, setPlan] = useState(false);
  const preset = WEEK_PRESETS.find((p) => p.id === TERM_PRESET);

  // Every write goes through sanitizeTerm; undo restores the exact previous term (or none).
  const write = (next: Term | null) => update((x) => { x.schedule.term = next ? sanitizeTerm(next) : null; });
  const withUndo = (next: Term | null, msg: string) => {
    const prev = structuredClone(t);
    write(next);
    toast(msg, { action: cm("undo"), onAction: () => write(prev) });
  };

  if (!t) {
    return (
      <main className="screen">
        <NavBar title={m("term.nav.title")} sub={m("term.nav.subEmpty")} />
        <Section>
          <EmptyState title={m("term.empty.title")} body={m("term.empty.body")}
            action={{ label: m("term.empty.action"), onClick: () => { play("done"); withUndo(termDefault(), m("term.toast.created")); } }} />
        </Section>
      </main>
    );
  }

  function commitDates() {
    if (!t || !draft) return;
    const d = draft;
    setDraft(null);
    if (d.start === t.start && d.end === t.end) return;
    if (!d.start || !d.end) return;
    if (d.end < d.start) { play("error"); toast(m("term.err.order")); return; }
    if (dayN(d.start, d.end) > 400) { play("error"); toast(m("term.err.long")); return; }
    play("done");
    withUndo({ ...t, start: d.start, end: d.end }, m("term.toast.dates", { start: thaiDate(d.start), end: thaiDate(d.end) }));
  }
  const dateVal = (k: "start" | "end") => draft?.[k] ?? t[k];
  const setDate = (k: "start" | "end", v: string) => setDraft({ start: dateVal("start"), end: dateVal("end"), [k]: v });

  const go = goOf(t);
  const setGo = (v: number) => { play("tap"); write({ ...t, go: Math.min(120, Math.max(0, v)) }); };

  const off = t.off ?? [];
  function addOff() {
    if (!t || !offAdd) return;
    if (off.includes(offAdd)) { setOffAdd(""); return; }
    if (off.length >= OFF_CAP) { play("error"); toast(m("term.err.offCap", { n: OFF_CAP })); return; }
    play("done");
    withUndo({ ...t, off: [...off, offAdd] }, m("term.toast.offAdded", { date: thaiDate(offAdd) }));
    setOffAdd("");
  }

  const openCls = (edit: Cls | null) => { play("tap"); setCls((p) => ({ open: true, edit, n: p.n + 1 })); };
  const from = t.start > today ? t.start : today;
  const week = weekClashes(s, from, 7, today);

  return (
    <main className="screen">
      <NavBar title={m("term.nav.title")} sub={m("term.nav.sub", { start: thaiDate(t.start), end: thaiDate(t.end), n: t.cls.length })} />

      <Section header={m("term.dates.header")} footer={m("term.dates.footer")}>
        <label className="row">
          <span className="row-main row-title">{m("term.dates.start")}</span>
          <input className="time-input term-date" type="date" value={dateVal("start")} onChange={(e) => setDate("start", e.target.value)} onBlur={commitDates} />
        </label>
        <label className="row">
          <span className="row-main row-title">{m("term.dates.end")}</span>
          <input className="time-input term-date" type="date" value={dateVal("end")} onChange={(e) => setDate("end", e.target.value)} onBlur={commitDates} />
        </label>
        <div className="row term-go">
          <span className="row-main">
            <span className="row-title">{m("term.go.title")}</span>
            <span className="row-sub">{m("term.go.sub", { def: go === GO_DEFAULT ? m("term.go.default") : "" })}</span>
          </span>
          <button className="chip" aria-label={m("term.go.less")} disabled={go <= 0} onClick={() => setGo(go - 5)}>-5</button>
          <span className="num term-go-val">{m("term.go.value", { n: go })}</span>
          <button className="chip" aria-label={m("term.go.more")} disabled={go >= 120} onClick={() => setGo(go + 5)}>+5</button>
        </div>
      </Section>

      <Section header={m("term.cls.header", { n: t.cls.length })} footer={m("term.cls.footer")}>
        {t.cls.map((c) => (
          <button key={c.id} className="row" onClick={() => openCls(c)}>
            <span className="row-main">
              <span className="row-title">{c.t}</span>
              <span className="row-sub num">{dowName(c.d)} {clsSpan(c)}{c.r ? m("term.cls.room", { room: c.r }) : ""}</span>
            </span>
            <Chev />
          </button>
        ))}
        <button className="row" onClick={() => openCls(null)}>
          <span className="row-icon link" aria-hidden><IconPlus size={18} /></span>
          <span className="row-main row-title link">{m("term.cls.add")}</span>
        </button>
      </Section>

      <Section header={m("term.off.header")} footer={m("term.off.footer")}>
        {off.map((d) => (
          <button key={d} className="row" aria-label={m("term.off.removeAria", { date: thaiDate(d) })} onClick={() => { play("undo"); withUndo({ ...t, off: off.filter((x) => x !== d) }, m("term.off.removed", { date: thaiDate(d) })); }}>
            <span className="row-main row-title">{thaiDate(d)}</span>
            <span className="row-value fs-sub">{m("term.off.tapRemove")}</span>
          </button>
        ))}
        <div className="row">
          <input className="time-input term-date" type="date" aria-label={m("term.off.dateAria")} value={offAdd} onChange={(e) => setOffAdd(e.target.value)} />
          <span className="row-main" />
          <button className="chip chip--tint" disabled={!offAdd} onClick={addOff}>{m("term.off.add")}</button>
        </div>
      </Section>

      <Section header={m("term.week.header")} footer={m("term.week.footer")}>
        {week.map((w) => {
          const name = resolveTemplate(s.schedule, w.tpl).def.name;
          const stuck = w.clashes > w.fixable ? termClashes(s, w.date, { today: w.date === today }).filter((c) => !c.fixable) : [];
          const body = (
            <>
              <span className="row-main">
                <span className="row-title">{w.date === today ? cm("today") : m("term.week.day", { dow: dowName(dowOf(w.date)) })} · {name}</span>
                <span className="row-sub num">{w.classes ? m("term.week.classes", { n: w.classes, span: w.span }) : m("term.week.none")}{w.date !== today ? ` · ${thaiDate(w.date)}` : ""}</span>
                {stuck.map((c, k) => <span key={k} className="row-sub term-stuck">{c.text} · {c.hint ?? earlyNote()}</span>)}
              </span>
              {(w.classes > 0 || w.clashes > 0) && <span className={`badge ${w.clashes ? "warn" : "ok"}`}>{w.clashes ? m("term.week.clash", { n: w.clashes }) : m("term.week.ok")}</span>}
            </>
          );
          return w.fixable ? (
            <button key={w.date} className="row term-day" onClick={() => { play("tap"); setClash({ open: true, date: w.date }); }}>{body}<Chev /></button>
          ) : <div key={w.date} className="row term-day">{body}</div>;
        })}
      </Section>

      <Section header={m("term.plan.header")} footer={isTermWeek(s) ? m("term.plan.using") : undefined}>
        <button className="row" onClick={() => { play("tap"); setPlan(true); }}>
          <span className="row-main">
            <span className="row-title">{m("term.plan.row")}</span>
            {preset && <span className="row-sub">{preset.note}</span>}
          </span>
          <Chev />
        </button>
      </Section>

      <Section>
        <button className="row" onClick={() => { play("undo"); withUndo(null, m("term.toast.deleted")); }}>
          <span className="row-main row-title ink-danger">{m("term.delete")}</span>
        </button>
      </Section>

      <ClassSheet key={cls.n} open={cls.open} edit={cls.edit} onClose={() => setCls((p) => ({ ...p, open: false }))} />
      <ClashSheet open={clash.open} date={clash.date} today={today} onClose={() => setClash((p) => ({ ...p, open: false }))} />
      <TermPlan open={plan} onClose={() => setPlan(false)} />
    </main>
  );
}
