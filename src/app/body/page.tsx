"use client";

import { useState } from "react";
import { msgs } from "@/i18n";
import { rich } from "@/i18n/react";
import * as C from "@/i18n/msg/app-body";
import * as Common from "@/i18n/msg/common";
import { TrendLine } from "@/components/Charts";
import { EmptyState } from "@/components/EmptyState";
import { IconArrowRight, IconPlus } from "@/components/Icons";
import { TabPage } from "@/components/TabPage";
import { BodyCare } from "@/components/care/BodyCare";
import { AppBar, Chev, Section, Segmented, Sheet, toast } from "@/components/ui";
import { setWeight } from "@/lib/actions";
import { THAI_DATE, addDays, logicalDate } from "@/lib/date";
import { bmi } from "@/lib/health";
import { NEED, etaRange, kgRate } from "@/lib/honest";
import { weightStats } from "@/lib/stats";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";

const m = msgs(C), c = msgs(Common);

type Range = "30" | "90" | "0";

type Edit = { date: string; kg: string; orig: string | null }; // orig = date of the weigh-in being edited (null = new)

export default function Body() {
  const { s, update } = useStore();
  const p = s.profile;
  const today = logicalDate();
  const { series: t, cur, rate, measured } = weightStats(s, today);
  const [range, setRange] = useState<Range>("30");
  const [ranged, setRanged] = useState(false); // range changed on this visit: the line draws again
  const [edit, setEdit] = useState<Edit | null>(null);
  const from = range === "0" ? "" : addDays(today, -Number(range));
  const shown = t.filter((w) => w.date >= from);

  const toGo = p.goalKg - cur;
  const span = p.goalKg - p.startKg;
  const progress = span ? Math.max(0, Math.min(1, (cur - p.startKg) / span)) : 1;
  const reached = toGo <= 0;

  // v1.8 honest copy: a verdict needs a rate and >= 5 weigh-ins in the last 14 days; the goal date is a month range.
  const recent = s.weights.filter((w) => w.date >= addDays(today, -13) && w.date <= today).length;
  let verdict = rate === null ? m("body.verdict.gap") : m("body.verdict.more", { n: Math.max(1, NEED.weighIns - recent) });
  if (rate !== null && recent >= NEED.weighIns) verdict = rate < 0.2 ? m("body.verdict.slow") : rate > 0.75 ? m("body.verdict.fast") : m("body.verdict.good");
  const eta = reached ? null : etaRange(s, today);

  function save() {
    if (!edit) return;
    const v = parseFloat(edit.kg);
    if (!(v > 30 && v < 250)) { play("error"); return toast(m("body.toast.number")); }
    if (edit.date > today) { play("error"); return toast(m("body.toast.future")); }
    if (edit.orig && edit.date !== edit.orig && s.weights.some((w) => w.date === edit.date)) { play("error"); return toast(m("body.toast.exists", { date: THAI_DATE(edit.date) })); }
    play("done");
    update((st) => {
      if (edit.orig && edit.orig !== edit.date) setWeight(st, edit.orig, null, today);
      setWeight(st, edit.date, v, today);
    });
    setEdit(null);
  }

  function remove() {
    if (!edit?.orig) return;
    const orig = edit.orig, prev = s.weights.find((w) => w.date === orig)?.kg;
    play("undo");
    update((st) => setWeight(st, orig, null, today));
    setEdit(null);
    toast(m("body.toast.deleted", { kg: prev === undefined ? "" : `${prev.toFixed(1)} kg `, date: THAI_DATE(orig) }), { action: c("undo"), onAction: () => { if (prev !== undefined) update((st) => setWeight(st, orig, prev, today)); } });
  }

  return (
    <TabPage>
    <main className="screen">
      <AppBar title={c("tab.body")} />
      <h1 className="large-title">{c("tab.body")}</h1>
      <div className="subtitle">{rich(m("body.goal"), { start: p.startKg, arrow: <span className="ic-arrow" role="img" aria-label={m("body.aria.to")}><IconArrowRight size={14} /></span>, goal: p.goalKg })}</div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div className="fs-foot ink-2">{m("body.trend")}</div>
            <div className="big-number">{measured ? cur.toFixed(1) : "-"}<span className="unit"> kg</span></div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="fs-foot ink-2">{reached ? m("body.goalLabel") : m("body.toGo")}</div>
            <div className={`value-lg ${reached ? "ink-success" : ""}`}>{reached ? m("body.reached") : `${toGo.toFixed(1)} kg`}</div>
          </div>
        </div>
        <div className="goal-track">
          <span className="fill-x grow goal-fill" style={{ ["--p" as string]: progress }} />
        </div>
        <Segmented<Range> value={range} options={[["30", m("body.range.30")], ["90", m("body.range.90")], ["0", m("body.range.all")]]} onChange={(v) => { setRange(v); setRanged(true); }} />
        {/* Dots = daily weigh-ins, line = exponential trend, dashed = goal when within reach of the plotted range. */}
        <TrendLine key={range} regrow={ranged} points={shown.map((w) => ({ date: w.date, v: w.trend, raw: w.kg }))} goal={p.goalKg} unit="kg" label={m("body.trend")} tone="var(--accent)"
          empty={<EmptyState art="lifting-dumbbell" title={m("body.empty.title")} action={{ label: m("body.empty.action"), onClick: () => { play("tap"); setEdit({ date: today, kg: "", orig: null }); } }} />} />
      </div>

      <Section header={m("body.summary.header")} footer={m("body.summary.footer")}>
        <div className="row"><span className="row-main row-title">{m("body.rate")}</span><span className="row-value">{kgRate(rate)}</span></div>
        <div className="row"><span className="row-main row-title">{m("body.advice")}</span><span className="row-value fs-sub">{verdict}</span></div>
        {eta && <div className="row"><span className="row-main row-title">{m("body.eta")}</span><span className="row-value">{eta}</span></div>}
        {measured && <div className="row"><span className="row-main row-title">BMI</span><span className="row-value">{bmi(cur, p.heightCm).toFixed(1)}</span></div>}
        {measured && <div className="row"><span className="row-main row-title">{m("body.gained")}</span><span className="row-value">{(cur - p.startKg).toFixed(1)} kg</span></div>}
      </Section>

      {s.care.level !== null && <BodyCare today={today} />}

      <Section header={m("body.history.header")} footer={s.weights.length ? m("body.history.footer") : undefined}>
        <button className="row" onClick={() => { play("tap"); setEdit({ date: today, kg: "", orig: null }); }}>
          <span className="icon-btn ink-accent"><IconPlus size={18} /></span>
          <span className="row-main row-title link">{m("body.log")}</span>
        </button>
        {[...s.weights].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map((w) => (
          <button key={w.date} className="row" onClick={() => { play("tap"); setEdit({ date: w.date, kg: w.kg.toFixed(1), orig: w.date }); }}>
            <span className="row-main"><div className="row-title">{w.kg.toFixed(1)} kg</div><div className="row-sub">{THAI_DATE(w.date)}</div></span>
            <Chev />
          </button>
        ))}
      </Section>

      <Sheet open={edit !== null} title={edit?.orig ? m("body.editTitle") : m("body.log")} onClose={() => setEdit(null)}>
        {edit && (
          <>
            <input className="field num fs-title1" inputMode="decimal" placeholder={measured ? cur.toFixed(1) : m("body.placeholder")} value={edit.kg} onChange={(e) => setEdit({ ...edit, kg: e.target.value })} autoFocus style={{ textAlign: "center" }}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
            <div style={{ height: 12 }} />
            <Section>
              <label className="row form-row">
                <span className="row-title">{m("body.date")}</span>
                <input className="inline-input" type="date" max={today} value={edit.date} onChange={(e) => e.target.value && setEdit({ ...edit, date: e.target.value })} />
              </label>
            </Section>
            <button className="btn" onClick={save}>{c("save")}</button>
            {edit.orig && <button className="btn danger" style={{ marginTop: 10 }} onClick={remove}>{c("delete")}</button>}
          </>
        )}
      </Sheet>
    </main>
    </TabPage>
  );
}
