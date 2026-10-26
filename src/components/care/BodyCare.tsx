"use client";

// Body page self-care sections (v1.7 spec 4.6): health checks, periodic task history and the product shelf.
// Sheets edit a draft; every commit (save, done today, delete) shows a toast with an exact undo of that list.
import { useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { IconPlus } from "@/components/Icons";
import { Chev, Section, Sheet, Switch, toast } from "@/components/ui";
import { checkNext, patchDay, thShort, useByChip as byChip } from "@/lib/care/body"; // not a hook (aliased for the lint rule)
import { TAG_LABEL } from "@/lib/care/presets";
import { IRRITANTS, TAGS, type Check, type Irritant, type Product, type Tag } from "@/lib/care/types";
import type { State } from "@/lib/model";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { IRR_LABEL } from "./RoutineEditor";
import { TasksSheet, taskWhen } from "./TasksSheet";
import { keepStored, msgs } from "@/i18n";
import { useLang } from "@/i18n/react";
import { careCheckText, careTaskText } from "@/i18n/stored";
import * as C from "@/i18n/msg/components-care";
import * as Common from "@/i18n/msg/common";

const m = msgs(C), c = msgs(Common);

// on/oc: the stored name/note when the sheet opened, so save restores an untouched built-in default (spec 7).
type CheckDraft = { id: string | null; name: string; everyM: number; last: string; note: string; flag: boolean; sys: string; dia: string; on?: string; oc?: string };
type ProdDraft = { id: string | null; p: Product };
const PAO: (3 | 6 | 12 | 24)[] = [3, 6, 12, 24];
const newId = (taken: string[]) => { let id; do id = Math.random().toString(36).slice(2, 9); while (!id || taken.includes(id)); return id; };

export function BodyCare({ today }: { today: string }) {
  const { s, update } = useStore();
  const [ck, setCk] = useState<CheckDraft | null>(null);
  const [pd, setPd] = useState<ProdDraft | null>(null);
  const [tasksOpen, setTasksOpen] = useState(false);
  useLang();
  const cs = s.care;

  // Exact undo of one care list.
  function commit<K extends "checks" | "shelf">(key: K, fn: (x: State) => void, msg: string) {
    const prev = structuredClone(s.care[key]);
    play("done");
    update(fn);
    toast(msg, { action: c("undo"), onAction: () => update((x) => { x.care[key] = structuredClone(prev); }) });
  }

  // ---- checks ----
  const openCheck = (x: Check | null) => { play("tap"); setCk(x ? { id: x.id, name: careCheckText(x.name), everyM: x.everyM, last: x.last ?? "", note: x.note === undefined ? "" : careCheckText(x.note), flag: !!x.flag, sys: "", dia: "", on: x.name, oc: x.note } : { id: null, name: "", everyM: 12, last: "", note: "", flag: false, sys: "", dia: "" }); };
  function doneToday() {
    if (!ck?.id) return;
    const id = ck.id;
    setCk(null);
    commit("checks", (x) => { const y = x.care.checks.find((z) => z.id === id); if (y) y.last = today; }, m("bodyCare.toast.doneToday", { name: ck.name }));
  }
  function saveCheck() {
    if (!ck) return;
    const raw = ck.name.trim();
    // An untouched built-in default is stored canonically (th), typed text as typed (capped) (spec 7)
    const nameC = keepStored(careCheckText, ck.on, raw, 40);
    if (!nameC) { play("error"); return; }
    const name = nameC === ck.on ? raw : nameC;
    const sys = parseInt(ck.sys, 10), dia = parseInt(ck.dia, 10);
    const bp = sys >= 70 && sys <= 250 && dia >= 40 && dia <= 150 ? ([sys, dia, today] as [number, number, string]) : null;
    if ((ck.sys || ck.dia) && !bp) { play("error"); toast(m("bodyCare.toast.bpRange")); return; }
    if (!ck.id && cs.checks.length >= 15) { play("error"); toast(m("bodyCare.toast.max")); return; }
    const d = ck;
    setCk(null);
    commit("checks", (x) => {
      let y = d.id ? x.care.checks.find((z) => z.id === d.id) : undefined;
      if (!y) { y = { id: newId(x.care.checks.map((z) => z.id)), name: nameC, everyM: d.everyM }; x.care.checks.push(y); }
      y.name = nameC; y.everyM = Math.max(0, Math.min(60, d.everyM));
      if (d.last) y.last = d.last; else delete y.last;
      const note = d.note.trim();
      if (note) y.note = keepStored(careCheckText, d.oc, note, 80); else delete y.note;
      if (d.flag) y.flag = true; else delete y.flag;
      if (bp) { y.bp = [...(y.bp ?? []).filter((r) => r[2] !== today), bp].sort((a, b) => a[2].localeCompare(b[2])).slice(-10); y.last = today; }
    }, m("bodyCare.toast.saved", { name }));
  }
  function removeCheck() {
    if (!ck?.id) return;
    const id = ck.id, name = ck.name;
    setCk(null);
    commit("checks", (x) => { x.care.checks = x.care.checks.filter((z) => z.id !== id); }, m("bodyCare.toast.removed", { name }));
  }
  const ckOrig = ck?.id ? cs.checks.find((x) => x.id === ck.id) : undefined;

  // ---- shelf ----
  const openProd = (p: Product | null) => { play("tap"); setPd(p ? { id: p.id, p: structuredClone(p) } : { id: null, p: { id: "", name: "", cat: "face", opened: today } }); };
  const patchP = (fn: (p: Product) => void) => setPd((v) => { if (!v) return v; const n = structuredClone(v); fn(n.p); return n; });
  function saveProd() {
    if (!pd) return;
    const name = pd.p.name.trim().slice(0, 40);
    if (!name) { play("error"); return; }
    if (!pd.id && cs.shelf.length >= 40) { play("error"); toast(m("bodyCare.toast.shelfFull")); return; }
    const d = pd;
    setPd(null);
    commit("shelf", (x) => {
      const p: Product = { ...structuredClone(d.p), name, id: d.id ?? newId(x.care.shelf.map((z) => z.id)) };
      const i = x.care.shelf.findIndex((z) => z.id === p.id);
      if (i >= 0) x.care.shelf[i] = p; else x.care.shelf.push(p);
    }, m("bodyCare.toast.saved", { name }));
  }
  function removeProd() {
    if (!pd?.id) return;
    const id = pd.id, name = pd.p.name;
    setPd(null);
    commit("shelf", (x) => { x.care.shelf = x.care.shelf.filter((z) => z.id !== id); }, m("bodyCare.toast.removed", { name }));
  }
  const shelf = [...cs.shelf].sort((a, b) => Number(!!a.done) - Number(!!b.done));
  const pday = pd ? patchDay(pd.p, today) : null;

  return (
    <>
      <Section header={m("bodyCare.checks.header")} footer={m("bodyCare.checks.footer")}>
        {cs.checks.map((x) => {
          const n = checkNext(x, today);
          return (
            <button key={x.id} className="row" onClick={() => openCheck(x)}>
              <span className="row-main"><span className="row-title">{careCheckText(x.name)}</span><span className="row-sub">{n.label}{x.last ? m("bodyCare.checks.last", { date: thShort(x.last) }) : ""}</span></span>
              {n.due && x.last && <span className="badge warn">{m("bodyCare.checks.overdue")}</span>}
              <Chev />
            </button>
          );
        })}
        <button className="row" onClick={() => openCheck(null)}>
          <span className="icon-btn ink-accent"><IconPlus size={20} /></span>
          <span className="row-main row-title link">{m("bodyCare.checks.add")}</span>
        </button>
      </Section>

      {cs.tasks.some((t) => t.on) && (
        <Section header={m("bodyCare.tasks.header")}>
          {cs.tasks.filter((t) => t.on).map((t) => (
            <div key={t.id} className="row"><span className="row-main"><span className="row-title">{careTaskText(t.title)}</span><span className="row-sub">{taskWhen(s, t, today)}</span></span></div>
          ))}
          <button className="row" onClick={() => { play("tap"); setTasksOpen(true); }}>
            <span className="row-main row-title link">{m("bodyCare.tasks.log")}</span>
            <Chev />
          </button>
        </Section>
      )}

      <Section header={m("bodyCare.shelf.header")} footer={m("bodyCare.shelf.footer")}>
        {shelf.map((p) => {
          const chip = byChip(p, today), k = patchDay(p, today);
          return (
            <button key={p.id} className={`row ${p.done ? "disabled" : ""}`} onClick={() => openProd(p)}>
              <span className="row-main">
                <span className="row-title">{p.name}</span>
                <span className="row-sub">{TAG_LABEL[p.cat]}{p.done ? m("bodyCare.shelf.usedUp") : ""}{k ? m("bodyCare.shelf.patchDay", { k }) : ""}{p.patch?.res === "red" ? m("bodyCare.shelf.patchRed") : ""}</span>
              </span>
              {p.low && !p.done && <span className="badge">{m("bodyCare.shelf.low")}</span>}
              {chip && <span className={`badge ${chip.warn ? "warn" : ""}`}>{chip.text}</span>}
              <Chev />
            </button>
          );
        })}
        {shelf.length === 0 ? <EmptyState title={m("bodyCare.shelf.empty")} action={{ label: m("bodyCare.shelf.add"), onClick: () => openProd(null) }} /> : (
          <button className="row" onClick={() => openProd(null)}>
            <span className="icon-btn ink-accent"><IconPlus size={20} /></span>
            <span className="row-main row-title link">{m("bodyCare.shelf.add")}</span>
          </button>
        )}
      </Section>

      <Sheet open={ck !== null} title={ck?.id ? ck.name || m("bodyCare.check.title") : m("bodyCare.checks.add")} onClose={() => setCk(null)}>
        {ck && (
          <>
            {ck.id && <button className="btn" onClick={doneToday}>{m("bodyCare.check.doneToday")}</button>}
            <Section>
              <label className="row form-row">
                <span className="row-title form-label">{m("bodyCare.form.name")}</span>
                <input className="inline-input" maxLength={40} value={ck.name} onChange={(e) => setCk({ ...ck, name: e.target.value })} />
              </label>
              <div className="row care-stepper">
                <span className="row-main row-title">{m("bodyCare.check.every")}</span>
                <button className="chip" disabled={ck.everyM <= 0} onClick={() => setCk({ ...ck, everyM: Math.max(0, ck.everyM - 1) })}>-1</button>
                <span className="num care-stepper-val">{ck.everyM ? m("bodyCare.check.months", { n: ck.everyM }) : m("bodyCare.check.onSymptoms")}</span>
                <button className="chip" disabled={ck.everyM >= 60} onClick={() => setCk({ ...ck, everyM: Math.min(60, ck.everyM + 1) })}>+1</button>
              </div>
              <label className="row form-row">
                <span className="row-main row-title">{m("bodyCare.check.last")}</span>
                <input className="inline-input" type="date" max={today} value={ck.last} onChange={(e) => setCk({ ...ck, last: e.target.value })} />
              </label>
            </Section>
            {(ck.id === "bp" || ckOrig?.bp?.length) && (
              <Section header={m("bodyCare.bp.header")} footer={m("bodyCare.bp.footer")}>
                <div className="row care-bp">
                  <input className="field field--fill num" inputMode="numeric" placeholder={m("bodyCare.bp.sys")} aria-label={m("bodyCare.bp.sysAria")} value={ck.sys} onChange={(e) => setCk({ ...ck, sys: e.target.value })} />
                  <span>/</span>
                  <input className="field field--fill num" inputMode="numeric" placeholder={m("bodyCare.bp.dia")} aria-label={m("bodyCare.bp.diaAria")} value={ck.dia} onChange={(e) => setCk({ ...ck, dia: e.target.value })} />
                </div>
                {(ckOrig?.bp ?? []).slice(-3).reverse().map((r) => (
                  <div key={r[2]} className="row"><span className="row-main row-sub">{thShort(r[2])}</span><span className="row-value num">{r[0]}/{r[1]}</span></div>
                ))}
              </Section>
            )}
            <Section>
              <div className="row">
                <span className="row-main"><span className="row-title">{m("bodyCare.check.flag")}</span><span className="row-sub">{m("bodyCare.check.flagSub")}</span></span>
                <Switch label={m("bodyCare.check.flagLabel")} on={ck.flag} onChange={(v) => setCk({ ...ck, flag: v })} />
              </div>
              <label className="row form-row">
                <span className="row-title form-label">{m("bodyCare.check.note")}</span>
                <input className="inline-input" maxLength={80} placeholder={c("optional")} value={ck.note} onChange={(e) => setCk({ ...ck, note: e.target.value })} />
              </label>
            </Section>
            <button className="btn" disabled={!ck.name.trim()} onClick={saveCheck}>{c("save")}</button>
            {ck.id && <button className="btn danger care-gap" onClick={removeCheck}>{m("bodyCare.check.remove")}</button>}
          </>
        )}
      </Sheet>

      <Sheet open={pd !== null} title={pd?.id ? pd.p.name || m("bodyCare.prod.title") : m("bodyCare.shelf.add")} onClose={() => setPd(null)}>
        {pd && (
          <>
            <Section>
              <label className="row form-row">
                <span className="row-title form-label">{m("bodyCare.form.name")}</span>
                <input className="inline-input" maxLength={40} placeholder={m("bodyCare.prod.namePh")} value={pd.p.name} onChange={(e) => patchP((p) => { p.name = e.target.value; })} />
              </label>
              <div className="row care-ctx--wrap">
                <span className="row-main row-title">{m("bodyCare.prod.cat")}</span>
                <span className="chips">{TAGS.map((t: Tag) => <button key={t} className={`chip chip--sm ${pd.p.cat === t ? "on" : ""}`} aria-pressed={pd.p.cat === t} onClick={() => patchP((p) => { p.cat = t; })}>{TAG_LABEL[t]}</button>)}</span>
              </div>
              <label className="row form-row">
                <span className="row-main row-title">{m("bodyCare.prod.opened")}</span>
                <input className="inline-input" type="date" max={today} value={pd.p.opened ?? ""} onChange={(e) => patchP((p) => { if (e.target.value) p.opened = e.target.value; else delete p.opened; })} />
              </label>
              <div className="row care-ctx--wrap">
                <span className="row-main row-title">{m("bodyCare.prod.pao")}</span>
                <span className="chips">{PAO.map((m) => <button key={m} className={`chip chip--sm ${pd.p.pao === m ? "on" : ""}`} aria-pressed={pd.p.pao === m} onClick={() => patchP((p) => { if (p.pao === m) delete p.pao; else p.pao = m; })}>{m}</button>)}</span>
              </div>
              <label className="row form-row">
                <span className="row-main row-title">{m("bodyCare.prod.exp")}</span>
                <input className="inline-input" type="date" value={pd.p.exp ?? ""} onChange={(e) => patchP((p) => { if (e.target.value) p.exp = e.target.value; else delete p.exp; })} />
              </label>
              <div className="row care-ctx--wrap">
                <span className="row-main row-title">{m("bodyCare.prod.irr")}</span>
                <span className="chips">
                  <button className={`chip chip--sm ${!pd.p.irr ? "on" : ""}`} aria-pressed={!pd.p.irr} onClick={() => patchP((p) => { delete p.irr; })}>{m("bodyCare.prod.none")}</button>
                  {IRRITANTS.map((k: Irritant) => <button key={k} className={`chip chip--sm ${pd.p.irr === k ? "on" : ""}`} aria-pressed={pd.p.irr === k} onClick={() => patchP((p) => { p.irr = k; })}>{IRR_LABEL[k]}</button>)}
                </span>
              </div>
              <div className="row">
                <span className="row-main row-title">{m("bodyCare.shelf.low")}</span>
                <Switch label={m("bodyCare.shelf.low")} on={!!pd.p.low} onChange={(v) => patchP((p) => { if (v) p.low = true; else delete p.low; })} />
              </div>
              <div className="row">
                <span className="row-main row-title">{m("bodyCare.prod.usedUp")}</span>
                <Switch label={m("bodyCare.prod.usedUp")} on={!!pd.p.done} onChange={(v) => patchP((p) => { if (v) p.done = today; else delete p.done; })} />
              </div>
            </Section>
            <Section footer={m("bodyCare.patch.footer")}>
              <div className="row">
                <span className="row-main row-title">{m("bodyCare.patch.title")}</span>
                <Switch label={m("bodyCare.patch.title")} on={!!pd.p.patch} onChange={(v) => patchP((p) => { if (v) p.patch = { start: today }; else delete p.patch; })} />
              </div>
              {pd.p.patch && (
                <div className="row care-ctx--wrap">
                  <span className="row-main row-title">{pday ? m("bodyCare.patch.day", { d: pday }) : pd.p.patch.res ? m("bodyCare.patch.result") : m("bodyCare.patch.done")}</span>
                  <span className="chips">
                    <button className={`chip chip--sm ${pd.p.patch.res === "ok" ? "on" : ""}`} aria-pressed={pd.p.patch.res === "ok"} onClick={() => patchP((p) => { if (p.patch) p.patch.res = "ok"; })}>{c("normal")}</button>
                    <button className={`chip chip--sm ${pd.p.patch.res === "red" ? "on" : ""}`} aria-pressed={pd.p.patch.res === "red"} onClick={() => patchP((p) => { if (p.patch) p.patch.res = "red"; })}>{m("bodyCare.patch.red")}</button>
                  </span>
                </div>
              )}
            </Section>
            <button className="btn" disabled={!pd.p.name.trim()} onClick={saveProd}>{c("save")}</button>
            {pd.id && <button className="btn danger care-gap" onClick={removeProd}>{c("delete")}</button>}
          </>
        )}
      </Sheet>

      <TasksSheet open={tasksOpen} date={today} all onClose={() => setTasksOpen(false)} />
    </>
  );
}
