"use client";

// Body page self-care sections (v1.7 spec 4.6): health checks, periodic task history and the product shelf.
// Sheets edit a draft; every commit (save, done today, delete) shows a toast with an exact undo of that list.
import { useState } from "react";
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

type CheckDraft = { id: string | null; name: string; everyM: number; last: string; note: string; flag: boolean; sys: string; dia: string };
type ProdDraft = { id: string | null; p: Product };
const PAO: (3 | 6 | 12 | 24)[] = [3, 6, 12, 24];
const newId = (taken: string[]) => { let id; do id = Math.random().toString(36).slice(2, 9); while (!id || taken.includes(id)); return id; };

export function BodyCare({ today }: { today: string }) {
  const { s, update } = useStore();
  const [ck, setCk] = useState<CheckDraft | null>(null);
  const [pd, setPd] = useState<ProdDraft | null>(null);
  const [tasksOpen, setTasksOpen] = useState(false);
  const c = s.care;

  // Exact undo of one care list.
  function commit<K extends "checks" | "shelf">(key: K, fn: (x: State) => void, msg: string) {
    const prev = structuredClone(s.care[key]);
    play("done");
    update(fn);
    toast(msg, { action: "เลิกทำ", onAction: () => update((x) => { x.care[key] = structuredClone(prev); }) });
  }

  // ---- checks ----
  const openCheck = (x: Check | null) => { play("tap"); setCk(x ? { id: x.id, name: x.name, everyM: x.everyM, last: x.last ?? "", note: x.note ?? "", flag: !!x.flag, sys: "", dia: "" } : { id: null, name: "", everyM: 12, last: "", note: "", flag: false, sys: "", dia: "" }); };
  function doneToday() {
    if (!ck?.id) return;
    const id = ck.id;
    setCk(null);
    commit("checks", (x) => { const y = x.care.checks.find((z) => z.id === id); if (y) y.last = today; }, `บันทึก ${ck.name} วันนี้แล้ว`);
  }
  function saveCheck() {
    if (!ck) return;
    const name = ck.name.trim().slice(0, 40);
    if (!name) { play("error"); return; }
    const sys = parseInt(ck.sys, 10), dia = parseInt(ck.dia, 10);
    const bp = sys >= 70 && sys <= 250 && dia >= 40 && dia <= 150 ? ([sys, dia, today] as [number, number, string]) : null;
    if ((ck.sys || ck.dia) && !bp) { play("error"); toast("ความดันบน 70-250 ล่าง 40-150"); return; }
    if (!ck.id && c.checks.length >= 15) { play("error"); toast("เพิ่มได้สูงสุด 15 รายการ"); return; }
    const d = ck;
    setCk(null);
    commit("checks", (x) => {
      let y = d.id ? x.care.checks.find((z) => z.id === d.id) : undefined;
      if (!y) { y = { id: newId(x.care.checks.map((z) => z.id)), name, everyM: d.everyM }; x.care.checks.push(y); }
      y.name = name; y.everyM = Math.max(0, Math.min(60, d.everyM));
      if (d.last) y.last = d.last; else delete y.last;
      if (d.note.trim()) y.note = d.note.trim().slice(0, 80); else delete y.note;
      if (d.flag) y.flag = true; else delete y.flag;
      if (bp) { y.bp = [...(y.bp ?? []).filter((r) => r[2] !== today), bp].sort((a, b) => a[2].localeCompare(b[2])).slice(-10); y.last = today; }
    }, `บันทึก ${name} แล้ว`);
  }
  function removeCheck() {
    if (!ck?.id) return;
    const id = ck.id, name = ck.name;
    setCk(null);
    commit("checks", (x) => { x.care.checks = x.care.checks.filter((z) => z.id !== id); }, `ลบ ${name} แล้ว`);
  }
  const ckOrig = ck?.id ? c.checks.find((x) => x.id === ck.id) : undefined;

  // ---- shelf ----
  const openProd = (p: Product | null) => { play("tap"); setPd(p ? { id: p.id, p: structuredClone(p) } : { id: null, p: { id: "", name: "", cat: "face", opened: today } }); };
  const patchP = (fn: (p: Product) => void) => setPd((v) => { if (!v) return v; const n = structuredClone(v); fn(n.p); return n; });
  function saveProd() {
    if (!pd) return;
    const name = pd.p.name.trim().slice(0, 40);
    if (!name) { play("error"); return; }
    if (!pd.id && c.shelf.length >= 40) { play("error"); toast("ชั้นวางเต็ม 40 ชิ้น ลบของที่ใช้หมดแล้วก่อน"); return; }
    const d = pd;
    setPd(null);
    commit("shelf", (x) => {
      const p: Product = { ...structuredClone(d.p), name, id: d.id ?? newId(x.care.shelf.map((z) => z.id)) };
      const i = x.care.shelf.findIndex((z) => z.id === p.id);
      if (i >= 0) x.care.shelf[i] = p; else x.care.shelf.push(p);
    }, `บันทึก ${name} แล้ว`);
  }
  function removeProd() {
    if (!pd?.id) return;
    const id = pd.id, name = pd.p.name;
    setPd(null);
    commit("shelf", (x) => { x.care.shelf = x.care.shelf.filter((z) => z.id !== id); }, `ลบ ${name} แล้ว`);
  }
  const shelf = [...c.shelf].sort((a, b) => Number(!!a.done) - Number(!!b.done));
  const pday = pd ? patchDay(pd.p, today) : null;

  return (
    <>
      <Section header="ตรวจสุขภาพ" footer="ไม่แจ้งเตือน · ข้อมูลสุขภาพทั่วไป ไม่ใช่การวินิจฉัย">
        {c.checks.map((x) => {
          const n = checkNext(x, today);
          return (
            <button key={x.id} className="row" onClick={() => openCheck(x)}>
              <span className="row-main"><span className="row-title">{x.name}</span><span className="row-sub">{n.label}{x.last ? ` · ล่าสุด ${thShort(x.last)}` : ""}</span></span>
              {n.due && x.last && <span className="badge warn">เลยกำหนด</span>}
              <Chev />
            </button>
          );
        })}
        <button className="row" onClick={() => openCheck(null)}>
          <span className="icon-btn ink-accent"><IconPlus size={20} /></span>
          <span className="row-main row-title link">เพิ่มการตรวจ</span>
        </button>
      </Section>

      {c.tasks.some((t) => t.on) && (
        <Section header="ดูแลตามรอบ">
          {c.tasks.filter((t) => t.on).map((t) => (
            <div key={t.id} className="row"><span className="row-main"><span className="row-title">{t.title}</span><span className="row-sub">{taskWhen(s, t, today)}</span></span></div>
          ))}
          <button className="row" onClick={() => { play("tap"); setTasksOpen(true); }}>
            <span className="row-main row-title link">บันทึกงานตามรอบ</span>
            <Chev />
          </button>
        </Section>
      )}

      <Section header="ชั้นวาง" footer="วันใช้ได้ถึง = วันเปิด + อายุหลังเปิด (PAO) หรือวันหมดอายุ อย่างไหนถึงก่อน">
        {shelf.map((p) => {
          const chip = byChip(p, today), k = patchDay(p, today);
          return (
            <button key={p.id} className={`row ${p.done ? "disabled" : ""}`} onClick={() => openProd(p)}>
              <span className="row-main">
                <span className="row-title">{p.name}</span>
                <span className="row-sub">{TAG_LABEL[p.cat]}{p.done ? " · ใช้หมดแล้ว" : ""}{k ? ` · ทดสอบผิววันที่ ${k}` : ""}{p.patch?.res === "red" ? " · ผลทดสอบแดง-คัน" : ""}</span>
              </span>
              {p.low && !p.done && <span className="badge">ใกล้หมด</span>}
              {chip && <span className={`badge ${chip.warn ? "warn" : ""}`}>{chip.text}</span>}
              <Chev />
            </button>
          );
        })}
        <button className="row" onClick={() => openProd(null)}>
          <span className="icon-btn ink-accent"><IconPlus size={20} /></span>
          <span className="row-main row-title link">เพิ่มของใช้</span>
        </button>
      </Section>

      <Sheet open={ck !== null} title={ck?.id ? ck.name || "การตรวจ" : "เพิ่มการตรวจ"} onClose={() => setCk(null)}>
        {ck && (
          <>
            {ck.id && <button className="btn" onClick={doneToday}>ทำแล้ววันนี้</button>}
            <Section>
              <label className="row form-row">
                <span className="row-title form-label">ชื่อ</span>
                <input className="inline-input" maxLength={40} value={ck.name} onChange={(e) => setCk({ ...ck, name: e.target.value })} />
              </label>
              <div className="row care-stepper">
                <span className="row-main row-title">ทุก</span>
                <button className="chip" disabled={ck.everyM <= 0} onClick={() => setCk({ ...ck, everyM: Math.max(0, ck.everyM - 1) })}>-1</button>
                <span className="num care-stepper-val">{ck.everyM ? `${ck.everyM} เดือน` : "เมื่อมีอาการ"}</span>
                <button className="chip" disabled={ck.everyM >= 60} onClick={() => setCk({ ...ck, everyM: Math.min(60, ck.everyM + 1) })}>+1</button>
              </div>
              <label className="row form-row">
                <span className="row-main row-title">ตรวจล่าสุด</span>
                <input className="inline-input" type="date" max={today} value={ck.last} onChange={(e) => setCk({ ...ck, last: e.target.value })} />
              </label>
            </Section>
            {(ck.id === "bp" || ckOrig?.bp?.length) && (
              <Section header="ความดัน (วัดเองที่บ้าน)" footer="วัดหลังนั่งพัก 5 นาที ไม่ใช่หลังออกกำลัง กาแฟ หรือไลฟ์ · ดูผลจาก 2 วันที่วัด">
                <div className="row care-bp">
                  <input className="field field--fill num" inputMode="numeric" placeholder="บน" aria-label="ความดันตัวบน" value={ck.sys} onChange={(e) => setCk({ ...ck, sys: e.target.value })} />
                  <span>/</span>
                  <input className="field field--fill num" inputMode="numeric" placeholder="ล่าง" aria-label="ความดันตัวล่าง" value={ck.dia} onChange={(e) => setCk({ ...ck, dia: e.target.value })} />
                </div>
                {(ckOrig?.bp ?? []).slice(-3).reverse().map((r) => (
                  <div key={r[2]} className="row"><span className="row-main row-sub">{thShort(r[2])}</span><span className="row-value num">{r[0]}/{r[1]}</span></div>
                ))}
              </Section>
            )}
            <Section>
              <div className="row">
                <span className="row-main"><span className="row-title">ผลมีค่าผิดปกติ (ตามใบผล)</span><span className="row-sub">ไม่ใช่การวินิจฉัย นำใบผลไปปรึกษาแพทย์</span></span>
                <Switch label="ผลมีค่าผิดปกติ" on={ck.flag} onChange={(v) => setCk({ ...ck, flag: v })} />
              </div>
              <label className="row form-row">
                <span className="row-title form-label">โน้ต</span>
                <input className="inline-input" maxLength={80} placeholder="ไม่บังคับ" value={ck.note} onChange={(e) => setCk({ ...ck, note: e.target.value })} />
              </label>
            </Section>
            <button className="btn" disabled={!ck.name.trim()} onClick={saveCheck}>บันทึก</button>
            {ck.id && <button className="btn danger care-gap" onClick={removeCheck}>ลบรายการนี้</button>}
          </>
        )}
      </Sheet>

      <Sheet open={pd !== null} title={pd?.id ? pd.p.name || "ของใช้" : "เพิ่มของใช้"} onClose={() => setPd(null)}>
        {pd && (
          <>
            <Section>
              <label className="row form-row">
                <span className="row-title form-label">ชื่อ</span>
                <input className="inline-input" maxLength={40} placeholder="เช่น กันแดดหน้า" value={pd.p.name} onChange={(e) => patchP((p) => { p.name = e.target.value; })} />
              </label>
              <div className="row care-ctx--wrap">
                <span className="row-main row-title">หมวด</span>
                <span className="chips">{TAGS.map((t: Tag) => <button key={t} className={`chip chip--sm ${pd.p.cat === t ? "on" : ""}`} aria-pressed={pd.p.cat === t} onClick={() => patchP((p) => { p.cat = t; })}>{TAG_LABEL[t]}</button>)}</span>
              </div>
              <label className="row form-row">
                <span className="row-main row-title">เปิดใช้วันที่</span>
                <input className="inline-input" type="date" max={today} value={pd.p.opened ?? ""} onChange={(e) => patchP((p) => { if (e.target.value) p.opened = e.target.value; else delete p.opened; })} />
              </label>
              <div className="row care-ctx--wrap">
                <span className="row-main row-title">อายุหลังเปิด (เดือน)</span>
                <span className="chips">{PAO.map((m) => <button key={m} className={`chip chip--sm ${pd.p.pao === m ? "on" : ""}`} aria-pressed={pd.p.pao === m} onClick={() => patchP((p) => { if (p.pao === m) delete p.pao; else p.pao = m; })}>{m}</button>)}</span>
              </div>
              <label className="row form-row">
                <span className="row-main row-title">หมดอายุ</span>
                <input className="inline-input" type="date" value={pd.p.exp ?? ""} onChange={(e) => patchP((p) => { if (e.target.value) p.exp = e.target.value; else delete p.exp; })} />
              </label>
              <div className="row care-ctx--wrap">
                <span className="row-main row-title">ตัวแรง</span>
                <span className="chips">
                  <button className={`chip chip--sm ${!pd.p.irr ? "on" : ""}`} aria-pressed={!pd.p.irr} onClick={() => patchP((p) => { delete p.irr; })}>ไม่มี</button>
                  {IRRITANTS.map((k: Irritant) => <button key={k} className={`chip chip--sm ${pd.p.irr === k ? "on" : ""}`} aria-pressed={pd.p.irr === k} onClick={() => patchP((p) => { p.irr = k; })}>{IRR_LABEL[k]}</button>)}
                </span>
              </div>
              <div className="row">
                <span className="row-main row-title">ใกล้หมด</span>
                <Switch label="ใกล้หมด" on={!!pd.p.low} onChange={(v) => patchP((p) => { if (v) p.low = true; else delete p.low; })} />
              </div>
              <div className="row">
                <span className="row-main row-title">ใช้หมดแล้ว</span>
                <Switch label="ใช้หมดแล้ว" on={!!pd.p.done} onChange={(v) => patchP((p) => { if (v) p.done = today; else delete p.done; })} />
              </div>
            </Section>
            <Section footer="ทาหลังหูหรือข้อพับแขน วันละครั้ง 7 วัน · หน้า/ปากบวม หายใจลำบาก โทร 1669">
              <div className="row">
                <span className="row-main row-title">ทดสอบผิว 7 วัน</span>
                <Switch label="ทดสอบผิว 7 วัน" on={!!pd.p.patch} onChange={(v) => patchP((p) => { if (v) p.patch = { start: today }; else delete p.patch; })} />
              </div>
              {pd.p.patch && (
                <div className="row care-ctx--wrap">
                  <span className="row-main row-title">{pday ? `วันที่ ${pday}` : pd.p.patch.res ? "ผลทดสอบ" : "ครบ 7 วันแล้ว"}</span>
                  <span className="chips">
                    <button className={`chip chip--sm ${pd.p.patch.res === "ok" ? "on" : ""}`} aria-pressed={pd.p.patch.res === "ok"} onClick={() => patchP((p) => { if (p.patch) p.patch.res = "ok"; })}>ปกติ</button>
                    <button className={`chip chip--sm ${pd.p.patch.res === "red" ? "on" : ""}`} aria-pressed={pd.p.patch.res === "red"} onClick={() => patchP((p) => { if (p.patch) p.patch.res = "red"; })}>แดง-คัน</button>
                  </span>
                </div>
              )}
            </Section>
            <button className="btn" disabled={!pd.p.name.trim()} onClick={saveProd}>บันทึก</button>
            {pd.id && <button className="btn danger care-gap" onClick={removeProd}>ลบ</button>}
          </>
        )}
      </Sheet>

      <TasksSheet open={tasksOpen} date={today} all onClose={() => setTasksOpen(false)} />
    </>
  );
}
