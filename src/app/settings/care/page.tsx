"use client";

// Settings > ดูแลตัวเอง (v1.7 spec 4.7): level, packs, routines, periodic tasks, trackers, health links, red flags.
// Level and pack changes show their diff in a toast with an exact undo; nothing changes Today without a tap here.
import Link from "next/link";
import { useMemo, useState } from "react";
import { msgs, withLang } from "@/i18n";
import { useLang } from "@/i18n/react";
import { careTaskText, routineName } from "@/i18n/stored";
import * as C from "@/i18n/msg/app-settings-care";
import * as Common from "@/i18n/msg/common";
import { IconPlus } from "@/components/Icons";
import { RoutineEditor } from "@/components/care/RoutineEditor";
import { TasksSheet, taskWhen } from "@/components/care/TasksSheet";
import { applyLevelWithUndo } from "@/components/care/CareNotices";
import { Chev, NavBar, Section, Segmented, Switch, toast } from "@/components/ui";
import { HELP, RED_FLAGS } from "@/lib/care/flags";
import { LEVEL_LABEL, PACKS, SLOTS } from "@/lib/care/presets";
import { applyLevel, resetPack, rowOf, setPack } from "@/lib/care/progress";
import { CAF_LABEL, type CafKind } from "@/lib/care/track";
import { LEVELS, type Care, type Level } from "@/lib/care/types";
import { hm, logicalDate } from "@/lib/date";
import type { State } from "@/lib/model";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";

const m = msgs(C), cm = msgs(Common);
// Built at render (current language), never at module load.
const track = (): [keyof Care["track"], string, string][] => [
  ["veg", m("care.track.veg"), m("care.track.vegSub")],
  ["urine", m("care.track.urine"), m("care.track.urineSub")],
  ["caf", m("care.track.caf"), m("care.track.cafSub")],
  ["walk", m("care.track.walk"), m("care.track.walkSub")],
  ["bowel", m("care.track.bowel"), m("care.track.bowelSub")],
  ["sym", m("care.track.sym"), m("care.track.symSub")],
];
const CAF_KINDS: CafKind[] = ["c", "t", "e", "p"];
const diffText = (r: { added: number; off: number }) => [r.added ? m("care.diff.added", { n: r.added }) : "", r.off ? m("care.diff.off", { n: r.off }) : ""].filter(Boolean).join(" · ") || m("care.diff.none");

// Number field that commits on blur (or Enter) and snaps back when the value is out of range.
function NumField({ value, min, max, step = 1, label, onCommit }: { value: number; min: number; max: number; step?: number; label: string; onCommit: (v: number) => void }) {
  const [v, setV] = useState<string | null>(null);
  const commit = () => {
    if (v === null) return;
    const n = Math.round(Number(v) / step) * step;
    setV(null);
    if (Number.isFinite(n) && n >= min && n <= max && n !== value) onCommit(n);
  };
  return <input className="inline-input num care-num" inputMode="numeric" aria-label={label} value={v ?? String(value)} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />;
}

export default function CareSettings() {
  const { s, update } = useStore();
  const lang = useLang();
  const today = logicalDate();
  const [editor, setEditor] = useState<{ rid: string } | null>(null);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [chip, setChip] = useState("");
  const c = s.care;
  const level = c.level;
  const routines = s.schedule.care ?? [];
  const customs = routines.filter((r) => !SLOTS.some((x) => x.id === r.id)).length;

  // Dry-run previews of the other levels on a copy (applyLevel is deterministic).
  const preview = useMemo(() => withLang(lang, () => LEVELS.filter((l) => l !== level).map((l) => m("care.preview", { level: LEVEL_LABEL[l], diff: diffText(applyLevel(structuredClone(s), l, today)) })).join(" · ")), [s, level, today, lang]);

  const careEdit = (fn: (x: State) => void) => update(fn);
  function togglePack(id: string, on: boolean) {
    const name = PACKS.find((p) => p.id === id)?.name ?? id;
    const res = setPack(structuredClone(s), id, on, today);
    const prev = { care: structuredClone(s.care), routines: structuredClone(routines) };
    play("toggle");
    update((x) => { setPack(x, id, on, today); });
    toast(m("care.toast.pack", { state: on ? cm("on") : cm("off"), name, diff: diffText(res) }), { action: cm("undo"), onAction: () => update((x) => { x.care = structuredClone(prev.care); x.schedule.care = structuredClone(prev.routines); }) });
  }
  function reset(id: string) {
    const name = PACKS.find((p) => p.id === id)?.name ?? id;
    const prev = { care: structuredClone(s.care), routines: structuredClone(routines) };
    play("undo");
    update((x) => resetPack(x, id, today));
    toast(m("care.toast.reset", { name }), { action: cm("undo"), onAction: () => update((x) => { x.care = structuredClone(prev.care); x.schedule.care = structuredClone(prev.routines); }) });
  }
  function when(rid: string, on: boolean) {
    if (!on) return m("care.when.off");
    const row = rowOf(s, today, rid);
    if (row) return hm(row.min);
    return rid === "gym" ? m("care.when.gym") : rid === "prep" ? m("care.when.prep") : m("care.when.none");
  }
  function addChip() {
    const n = Math.round(Number(chip) / 10) * 10;
    setChip("");
    if (!(n >= 50 && n <= 2000) || c.water.chips.includes(n) || c.water.chips.length >= 6) { play("error"); toast(m("care.toast.chips")); return; }
    play("tap");
    careEdit((x) => { x.care.water.chips = [...x.care.water.chips, n].sort((a, b) => a - b); });
  }

  return (
    <main className="screen">
      <NavBar title={m("care.title")} sub={m("care.sub")} />

      <Section header={m("care.level")} footer={preview}>
        <div className="row">
          <div className="care-grow">
            {level ? (
              <Segmented<Level> label={m("care.level")} value={level} options={LEVELS.map((l) => [l, LEVEL_LABEL[l]])} onChange={(v) => applyLevelWithUndo(update, s, v, today)} />
            ) : (
              <div className="chips">{LEVELS.map((l) => <button key={l} className="chip" onClick={() => applyLevelWithUndo(update, s, l, today)}>{LEVEL_LABEL[l]}</button>)}</div>
            )}
          </div>
        </div>
      </Section>

      {level && (
        <>
          <Section header={m("care.packs.header")} footer={m("care.packs.footer")}>
            {PACKS.map((p) => {
              const on = c.packs.includes(p.id);
              return (
                <div key={p.id} className="row">
                  <span className="row-main">
                    <span className="row-title">{p.name}{p.optIn ? m("care.packs.optIn") : ""}</span>
                    <span className="row-sub">{p.desc}</span>
                    {on && <button className="link fs-foot care-inline-link" onClick={() => reset(p.id)}>{m("care.packs.reset")}</button>}
                  </span>
                  <Switch label={p.name} on={on} onChange={(v) => togglePack(p.id, v)} />
                </div>
              );
            })}
          </Section>

          <Section header={m("care.routines.header")} footer={m("care.routines.footer")}>
            {routines.map((r) => (
              <button key={r.id} className="row" onClick={() => { play("tap"); setEditor({ rid: r.id }); }}>
                <span className="row-main"><span className="row-title">{m("care.routines.row", { name: routineName(r.name), when: when(r.id, r.on), n: r.steps.filter((x) => x.on !== false).length })}</span></span>
                <Chev />
              </button>
            ))}
            {customs < 3 && (
              <button className="row" onClick={() => { play("tap"); setEditor({ rid: "new" }); }}>
                <span className="icon-btn ink-accent"><IconPlus size={20} /></span>
                <span className="row-main row-title link">{m("care.routines.create")}</span>
              </button>
            )}
          </Section>

          <Section header={m("care.tasks.header")} footer={m("care.tasks.footer")}>
            <button className="row" onClick={() => { play("tap"); setTasksOpen(true); }}>
              <span className="row-main row-title link">{m("care.tasks.due")}</span>
              <Chev />
            </button>
            {c.tasks.map((t) => { const title = careTaskText(t.title); return (
              <div key={t.id} className={`row care-task-row ${t.on ? "" : "disabled"}`}>
                <span className="row-main"><span className="row-title">{title}</span><span className="row-sub">{taskWhen(s, t, today)}</span></span>
                <span className="care-mini-stepper">
                  <button className="chip chip--sm" aria-label={m("care.tasks.more", { title })} disabled={t.every <= 1} onClick={() => { play("tap"); careEdit((x) => { const y = x.care.tasks.find((z) => z.id === t.id); if (y) y.every = Math.max(1, y.every - 1); }); }}>-</button>
                  <button className="chip chip--sm" aria-label={m("care.tasks.less", { title })} disabled={t.every >= 365} onClick={() => { play("tap"); careEdit((x) => { const y = x.care.tasks.find((z) => z.id === t.id); if (y) y.every = Math.min(365, y.every + 1); }); }}>+</button>
                </span>
                <Switch label={title} on={t.on} onChange={(v) => careEdit((x) => { const y = x.care.tasks.find((z) => z.id === t.id); if (y) y.on = v; })} />
              </div>
            ); })}
          </Section>

          <Section header={m("care.water.header")} footer={m("care.water.footer")}>
            <div className="row">
              <span className="row-main"><span className="row-title">{m("care.water.plan")}</span><span className="row-sub">{m("care.water.planSub")}</span></span>
              <Switch label={m("care.water.plan")} on={c.water.plan} onChange={(v) => careEdit((x) => { x.care.water.plan = v; })} />
            </div>
            <div className="row">
              <span className="row-title form-label">{m("care.water.goalLabel")}</span>
              <div className="care-grow"><Segmented label={m("care.water.goalAria")} value={String(s.settings.waterGoalMl)} options={[["0", m("care.water.auto")], ["2500", "2.5"], ["3000", "3"], ["3500", "3.5"], ["4000", "4"]]} onChange={(v) => careEdit((x) => { x.settings.waterGoalMl = Number(v); })} /></div>
            </div>
            <div className="row">
              <span className="row-main"><span className="row-title">{m("care.water.live")}</span><span className="row-sub">{m("care.water.liveSub")}</span></span>
              <Switch label={m("care.water.live")} on={c.water.live} onChange={(v) => careEdit((x) => { x.care.water.live = v; })} />
            </div>
            <div className="row care-ctx--wrap">
              <span className="row-main row-title">{m("care.water.chips")}</span>
              <span className="chips">
                {c.water.chips.map((ml) => (
                  <button key={ml} className="chip chip--sm" aria-label={m("care.water.chipRemove", { ml })} disabled={c.water.chips.length <= 1} onClick={() => { play("tap"); careEdit((x) => { x.care.water.chips = x.care.water.chips.filter((y) => y !== ml); }); }}>{ml} x</button>
                ))}
              </span>
            </div>
            {c.water.chips.length < 6 && (
              <div className="row form-row">
                <span className="row-main row-title">{m("care.water.addChip")}</span>
                <input className="inline-input num care-num" inputMode="numeric" placeholder={m("care.water.placeholder")} value={chip} onChange={(e) => setChip(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addChip(); }} />
                <button className="chip chip--sm" disabled={!chip} onClick={addChip}>{cm("add")}</button>
              </div>
            )}
          </Section>

          <Section header={m("care.trackers.header")} footer={m("care.trackers.footer")}>
            {track().map(([k, t, sub]) => (
              <div key={k} className="row">
                <span className="row-main"><span className="row-title">{t}</span><span className="row-sub">{sub}</span></span>
                <Switch label={t} on={c.track[k]} onChange={(v) => careEdit((x) => { x.care.track[k] = v; })} />
              </div>
            ))}
            {c.track.caf && CAF_KINDS.map((k) => (
              <div key={k} className="row">
                <span className="row-main row-title">{m("care.caf.row", { label: CAF_LABEL[k] })}</span>
                <NumField label={m("care.caf.aria", { label: CAF_LABEL[k] })} value={c.cafMg[k]} min={0} max={600} onCommit={(v) => careEdit((x) => { x.care.cafMg[k] = v; })} />
              </div>
            ))}
          </Section>

          <Section header={m("care.health.header")}>
            <Link href="/body" className="row row-link" onClick={() => play("nav")}>
              <span className="row-main"><span className="row-title">{m("care.health.body")}</span><span className="row-sub">{m("care.health.bodySub")}</span></span>
              <Chev />
            </Link>
          </Section>
        </>
      )}

      <Section header={m("care.flags.header")}>
        {RED_FLAGS.map((t) => <div key={t} className="row"><span className="row-main row-sub care-flag-line">{t}</span></div>)}
      </Section>
      <Section header={m("care.help.header")}>
        {HELP.map(([n, t]) => (
          <a key={n} href={`tel:${n}`} className="row row-link" onClick={() => play("tap")}>
            <span className="row-main"><span className="row-title num">{n}</span><span className="row-sub">{t}</span></span>
            <Chev />
          </a>
        ))}
      </Section>
      <div className="section-footer care-foot">{m("care.foot")}</div>

      <RoutineEditor open={editor} onClose={() => setEditor(null)} />
      <TasksSheet open={tasksOpen} date={today} onClose={() => setTasksOpen(false)} />
    </main>
  );
}
