"use client";

// v1.7 morning ritual "วางแผนวันนี้" (spec 7.2): today's plan at a glance, an overcommit check against bedtime and
// tomorrow's wake, and one-tap fixes through the existing today-only levers (each with undo). No notices.
import { MiniTimeline } from "@/components/MiniTimeline";
import { Sheet, toast } from "@/components/ui";
import { addDays, hm, logicalMinutes } from "@/lib/date";
import { dayFor, type State } from "@/lib/model";
import { applyFix, overcommit, planLines, type Fix } from "@/lib/rituals";
import { itemsFor, resolveTemplate } from "@/lib/schedule";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";

const h1 = (h: number) => (Math.round(h * 10) / 10).toFixed(1);
const hmm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;

// Undo of a fix: restores the today-only fields it can touch. The reschedAt clock moves forward (never back) and the log
// is kept, so a later 409 merge against an already-pushed fix cannot bring the skip or move back.
function snapDay(s: State, date: string) {
  const d = s.days[date];
  return { shiftMin: d?.shiftMin, moved: d?.moved, skip: d?.skip };
}
function restoreDay(x: State, date: string, p: ReturnType<typeof snapDay>) {
  const d = x.days[date];
  if (!d) return;
  for (const k of ["shiftMin", "moved", "skip"] as const) {
    if (p[k] === undefined) delete d[k]; else (d as Record<string, unknown>)[k] = structuredClone(p[k]);
  }
  d.reschedAt = Date.now();
}

export function PlanSheet({ open, date, now, onClose, onPickPlan }: { open: boolean; date: string; now: Date; onClose: () => void; onPickPlan: () => void }) {
  const { s, update } = useStore();
  const day = dayFor(s, date);
  const { def } = resolveTemplate(s.schedule, day.type);
  const nowMin = logicalMinutes(now);
  const items = itemsFor(s.schedule, day, date);
  const lines = planLines(s, date);
  const over = overcommit(s, date, nowMin);
  const prev = s.days[addDays(date, -1)];
  const intent = prev?.journal?.fix?.trim();
  const slept = prev?.sleepAt && day.wakeAt && day.wakeAt > prev.sleepAt ? (day.wakeAt - prev.sleepAt) / 3_600_000 : null;

  function fix(f: Fix) {
    const snap = snapDay(s, date);
    play("toggle");
    update((x) => applyFix(x, date, f));
    toast(f.k === "skip" ? `ข้ามวันนี้แล้ว · ไม่นับคะแนน` : f.k === "unmove" ? "คืนเวลาเดิมแล้ว" : "คืนตารางตามแผนแล้ว", {
      action: "เลิกทำ", onAction: () => update((x) => restoreDay(x, date, snap)),
    });
  }
  function ready() {
    const had = !!s.days[date];
    play("done");
    update((x) => { const d = dayFor(x, date); d.planAt = Date.now(); x.days[date] = d; });
    toast("เริ่มวันได้เลย", { action: "เลิกทำ", onAction: () => update((x) => {
      const d = x.days[date];
      if (!d) return;
      delete d.planAt;
      if (!had && !Object.keys(d.done).length) delete x.days[date];
    }) });
    onClose();
  }

  return (
    <Sheet open={open} title="วางแผนวันนี้" onClose={onClose}>
      <div className="card ritual-card">
        <div className="ritual-tpl">
          <span className="tpl-dot" style={{ ["--tone" as string]: def.color }} />
          <span className="row-main row-title">{def.name}</span>
          <button className="link" onClick={() => { play("tap"); onPickPlan(); }}>เปลี่ยนแผน</button>
        </div>
        <MiniTimeline items={items} work={def.work} nowMin={nowMin} />
        <ul className="ritual-lines">{lines.map((l) => <li key={l} className="num">{l}</li>)}</ul>
      </div>
      {intent && <div className="sheet-meta ritual-meta">เมื่อคืนตั้งใจไว้: {intent}</div>}
      {slept !== null && slept < 7 && <div className="sheet-meta ritual-meta">เมื่อคืนนอน {h1(slept)} ชม.</div>}
      {over && (
        <div className="ritual-over">
          {over.overBy > 0
            ? <div className="ritual-chip warn num">เกินไป {hmm(over.overBy)} · นอนจะเหลือ {h1(over.sleepH)} ชม.</div>
            : over.info && <div className="sheet-meta">{over.info}</div>}
          {over.fixes.length > 0 && (
            <div className="sw-actions">
              {over.fixes.map((f) => <button key={f.k + (f.id ?? "")} className="chip" onClick={() => fix(f)}>{f.label}</button>)}
            </div>
          )}
          {over.hint && <div className="sheet-meta">{over.hint}</div>}
        </div>
      )}
      <button className="btn ritual-go" onClick={ready}>พร้อมแล้ว เริ่มวัน</button>
      {over && over.overBy > 0 && <div className="section-footer ritual-foot">นอนตามแผน {hm(items.find((i) => i.kind === "sleep")?.min ?? 0)} · เลือกปรับเฉพาะวันนี้ ไม่เปลี่ยนแผนหลัก</div>}
    </Sheet>
  );
}
