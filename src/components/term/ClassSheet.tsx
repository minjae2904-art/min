"use client";

// v1.8 class editor (Settings > ตารางเรียน). Add = one class per selected weekday; edit = one class, one weekday.
// Writes the whole term through sanitizeTerm, so a saved timetable is always valid. Every save and delete has undo.
import { useState } from "react";
import { Sheet, toast } from "@/components/ui";
import { fmt, msgs } from "@/i18n";
import * as C from "@/i18n/msg/components-term";
import * as Common from "@/i18n/msg/common";
import { dowName } from "@/lib/brain/copy";
import { ROLLOVER_HOUR, hm } from "@/lib/date";
import type { Cls } from "@/lib/model";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { CLS_CAP, CLS_MAX, CLS_MIN, EARLY_WARN, newClsId, sanitizeTerm } from "@/lib/term";

const m = msgs(C), cm = msgs(Common);
const DAYS = [0, 1, 2, 3, 4, 5, 6];
// "HH:MM" -> logical minutes (times before the 08:00 rollover land past 1440 and fail the range check).
const toMin = (v: string) => { const [h, m] = v.split(":").map(Number); return Number.isFinite(h) && Number.isFinite(m) ? Math.round(((h < ROLLOVER_HOUR ? h + 24 : h) * 60 + m) / 5) * 5 : NaN; };

export function ClassSheet({ open, edit, onClose }: { open: boolean; edit: Cls | null; onClose: () => void }) {
  const { s, update } = useStore();
  const [title, setTitle] = useState(edit?.t ?? "");
  const [days, setDays] = useState<number[]>(edit ? [edit.d] : []);
  const [st, setSt] = useState(hm(edit?.s ?? 540));
  const [en, setEn] = useState(hm(edit?.e ?? 630));
  const [room, setRoom] = useState(edit?.r ?? "");
  const term = s.schedule.term;
  const a = toMin(st);

  const bad = (m: string) => { play("error"); toast(m); };
  const restore = (cls: Cls[]) => update((x) => { if (x.schedule.term) x.schedule.term = sanitizeTerm({ ...x.schedule.term, cls }) ?? x.schedule.term; });

  function pickDay(d: number) {
    play("tap");
    if (edit) setDays([d]);
    else setDays((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d].sort()));
  }

  function save() {
    if (!term) return;
    const t = title.trim().slice(0, 40), b = toMin(en);
    if (!t) return bad(m("classSheet.err.name"));
    if (!days.length) return bad(m("classSheet.err.days"));
    if (!(a >= CLS_MIN && b <= CLS_MAX)) return bad(m("classSheet.err.range"));
    if (b <= a) return bad(m("classSheet.err.order"));
    if (b - a > 600) return bad(m("classSheet.err.long"));
    if (b - a < 15) return bad(m("classSheet.err.short"));
    const others = term.cls.filter((c) => c.id !== edit?.id);
    if (others.length + days.length > CLS_CAP) return bad(m("classSheet.err.cap"));
    const r = room.trim().slice(0, 20);
    const base = { s: a, e: b, t, ...(r ? { r } : {}) };
    let list: Cls[];
    if (edit) list = [...others, { id: edit.id, d: days[0], ...base }];
    else {
      list = [...term.cls];
      const now = Date.now();
      for (const d of days) list.push({ id: newClsId({ ...term, cls: list }, now), d, ...base });
    }
    const prev = term.cls;
    play("done");
    restore(list);
    toast(edit ? m("classSheet.toast.saved", { t }) : days.length > 1 ? m("classSheet.toast.addedDays", { t, n: days.length }) : m("classSheet.toast.added", { t }), { action: cm("undo"), onAction: () => restore(prev) });
    onClose();
  }

  function remove() {
    if (!term || !edit) return;
    const prev = term.cls;
    play("undo");
    restore(prev.filter((c) => c.id !== edit.id));
    toast(m("classSheet.toast.removed", { t: edit.t }), { action: cm("undo"), onAction: () => restore(prev) });
    onClose();
  }

  return (
    <Sheet open={open} title={edit ? m("classSheet.title.edit") : m("classSheet.title.add")} onClose={onClose}>
      <div className="cls-form">
        <label className="journal-label" htmlFor="cls-title">{m("classSheet.label.name")}</label>
        <input id="cls-title" className="field field--fill" value={title} maxLength={40} placeholder={m("classSheet.placeholder.name")} onChange={(e) => setTitle(e.target.value)} />
        <div className="journal-label" id="cls-days-label">{edit ? m("classSheet.label.day") : m("classSheet.label.days")}</div>
        <div className="chips cls-days" role="group" aria-labelledby="cls-days-label">
          {DAYS.map((i) => (
            <button key={i} type="button" className={`chip chip--day ${days.includes(i) ? "on" : ""}`} aria-pressed={days.includes(i)} aria-label={dowName(i)} onClick={() => pickDay(i)}>{fmt.dowShort(i)}</button>
          ))}
        </div>
        <div className="cls-times">
          <label className="cls-time"><span className="journal-label">{m("classSheet.label.start")}</span>
            <input className="time-input" type="time" step={300} value={st} onChange={(e) => setSt(e.target.value)} />
          </label>
          <label className="cls-time"><span className="journal-label">{m("classSheet.label.end")}</span>
            <input className="time-input" type="time" step={300} value={en} onChange={(e) => setEn(e.target.value)} />
          </label>
        </div>
        {a >= CLS_MIN && a < EARLY_WARN && (
          <div className="sw-sub cls-note">{m("classSheet.note.early")}</div>
        )}
        <label className="journal-label" htmlFor="cls-room">{m("classSheet.label.room")}</label>
        <input id="cls-room" className="field field--fill" value={room} maxLength={20} onChange={(e) => setRoom(e.target.value)} />
        <button className="btn cls-save" onClick={save}>{cm("save")}</button>
        {edit && <button className="btn danger cls-del" onClick={remove}>{m("classSheet.btn.delete")}</button>}
      </div>
    </Sheet>
  );
}
