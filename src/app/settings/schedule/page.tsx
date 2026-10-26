"use client";

import { useState } from "react";
import Link from "next/link";
import { IconBell, IconPlus, IconTrash } from "@/components/Icons";
import { Chev, ConfirmSheet, NavBar, Section, Segmented, Sheet, Switch, toast } from "@/components/ui";
import { deleteTemplate, duplicateTemplate, renameTemplate } from "@/lib/actions";
import { ROLLOVER_HOUR, hm, logicalDate } from "@/lib/date";
import { dayFor, type CustomItem } from "@/lib/model";
import { buildDay, resolveTemplate, type Ring } from "@/lib/schedule";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { TEMPLATES, TEMPLATE_BY_ID } from "@/lib/templates";

const RING_LABEL: Record<Ring, string> = { food: "กิน", body: "ร่างกาย", habit: "นิสัย" };
const RING_COLOR: Record<Ring, string> = { food: "var(--ring-food)", body: "var(--ring-body)", habit: "var(--ring-habit)" };
const NY_NOTE = "เทรด มื้อเย็น และเวลาเริ่มเกมในวันไม่มีงานเลื่อนตามเวลาตลาดนิวยอร์กอัตโนมัติ (+1 ชม. ตั้งแต่ 1 พ.ย.) ถ้าตั้งเวลาเองจะล็อกเวลานั้น";

// "HH:MM" <-> logical minutes: the day runs 08:00-07:59, times before the rollover hour belong to the night after.
const toMin = (v: string) => { const [h, m] = v.split(":").map(Number); return (h < ROLLOVER_HOUR ? h + 24 : h) * 60 + m; };

export default function ScheduleSettings() {
  const { s, update } = useStore();
  const [sel, setType] = useState<string>(() => resolveTemplate(s.schedule, dayFor(s, logicalDate()).type).key);
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [naming, setNaming] = useState<"copy" | "rename" | null>(null);
  const [nameMode, setNameMode] = useState<"copy" | "rename">("copy"); // stays set while the sheet slides out
  const [name, setName] = useState("");
  const [draft, setDraft] = useState<CustomItem>({ id: "", title: "", min: toMin("14:00"), ring: "habit", days: "both" });
  const cfg = s.schedule;
  const mine = cfg.templates ?? [];
  // Resolved key: a template deleted on another device falls back instead of editing a dead prefix.
  const { key: type, def } = resolveTemplate(cfg, sel);
  const user = mine.find((t) => t.id === type);
  // Self-care routines are edited in Settings > ดูแลตัวเอง: built here without them (no care rows, hosts keep their titles).
  const shown = { ...cfg, care: [], overrides: Object.fromEntries(Object.entries(cfg.overrides).map(([k, v]) => [k, { ...v, enabled: true }])) };
  // Ring items plus the game blocks/markers that follow the shift; all = also list defaultOff items.
  const items = buildDay(type, undefined, shown, 0, { all: true }).filter((i) => (i.ring || i.moves || i.kind === "game") && i.kind !== "care");
  // "เดิม" = where the item lands under the same shift rule (buildDay) without its own time override.
  const orig = (id: string) => buildDay(type, undefined, { ...shown, overrides: { ...shown.overrides, [`${type}:${id}`]: { ...shown.overrides[`${type}:${id}`], min: undefined } } }, 0, { all: true }).find((x) => x.id === id)?.min;

  const ov = (id: string) => cfg.overrides[`${type}:${id}`] ?? {};
  const setOv = (id: string, patch: Partial<{ enabled: boolean; min: number; remind: boolean }>) =>
    update((st) => {
      const k = `${type}:${id}`;
      st.schedule.overrides[k] = { ...st.schedule.overrides[k], ...patch };
    });

  function saveName(now: number) {
    const n = name.trim();
    if (!n) return;
    play("done");
    if (naming === "copy") {
      const id = duplicateTemplate(structuredClone(s), type, n, now); // same inputs -> same id as the real call below
      update((x) => { duplicateTemplate(x, type, n, now); });
      setType(id);
      toast(`สร้างแผน "${n.slice(0, 40)}" แล้ว`);
    } else {
      update((x) => renameTemplate(x, type, n));
      toast("เปลี่ยนชื่อแล้ว");
    }
    setNaming(null);
  }

  function removeTemplate() {
    if (!user) return;
    const id = user.id;
    const snap = structuredClone({ templates: mine, overrides: cfg.overrides, custom: cfg.custom, weekPlan: s.settings.weekPlan, dates: Object.keys(s.days).filter((d) => s.days[d].type === id) });
    play("undo");
    update((x) => { deleteTemplate(x, id); });
    setType(user.from);
    toast(`ลบแผน "${user.name}" แล้ว`, {
      action: "เลิกทำ",
      onAction: () => {
        update((x) => {
          x.schedule.templates = snap.templates; x.schedule.overrides = snap.overrides; x.schedule.custom = snap.custom; x.settings.weekPlan = snap.weekPlan;
          for (const d of snap.dates) if (x.days[d]) x.days[d].type = id;
        });
        setType(id);
      },
    });
  }

  return (
    <main className="screen">
      <NavBar title="แผนประจำวัน" sub="ปรับเวลา เปิด/ปิดรายการ ทำสำเนาแผน และเพิ่มรายการของคุณเอง" />

      <Section header="เลื่อนทั้งตาราง" footer="ใช้เมื่อตื่นช้า/เร็วกว่าปกติ เลื่อนทุกรายการส่วนตัวและช่วงเกม (ไม่รวมเวลาเข้า-เลิกงาน)">
        <div className="row">
          <button className="chip" onClick={() => { play("tap"); update((st) => { st.schedule.shiftMin = Math.max(-180, st.schedule.shiftMin - 15); }); }}>-15</button>
          <span className="row-main" style={{ textAlign: "center" }}>
            <span className="big-number fs-title2">{cfg.shiftMin > 0 ? "+" : ""}{cfg.shiftMin}</span> <span className="fs-foot ink-2">นาที</span>
          </span>
          <button className="chip" onClick={() => { play("tap"); update((st) => { st.schedule.shiftMin = Math.min(180, st.schedule.shiftMin + 15); }); }}>+15</button>
        </div>
        {cfg.shiftMin !== 0 && <button className="row" onClick={() => { play("undo"); update((st) => { st.schedule.shiftMin = 0; }); }}><span className="row-main row-title link">กลับเป็นเวลาเดิม</span></button>}
      </Section>

      <Section header="ตื่น / นอน" footer="ปุ่ม 'ตื่นแล้ว' และ 'เข้านอน' อยู่ในหน้าวันนี้ ใช้คำนวณชั่วโมงนอนในสถิติ">
        <div className="row">
          <span className="row-main">
            <div className="row-title">ถามเลื่อนตารางเมื่อตื่นช้า/เร็ว</div>
            <div className="row-sub">ต่างจากแผนตั้งแต่ 15 นาที เลื่อนเฉพาะวันนั้น</div>
          </span>
          <Switch label="ถามเลื่อนตารางเมื่อตื่นช้า/เร็ว" on={s.settings.askShiftOnWake} onChange={(v) => update((st) => { st.settings.askShiftOnWake = v; })} />
        </div>
        <div className="row">
          <span className="row-main">
            <div className="row-title">กดเข้านอนแล้วพักการแจ้งเตือน</div>
            <div className="row-sub">เงียบจนถึงเวลาตื่นตามแผน</div>
          </span>
          <Switch label="กดเข้านอนแล้วพักการแจ้งเตือน" on={s.settings.sleepDnd} onChange={(v) => update((st) => { st.settings.sleepDnd = v; })} />
        </div>
      </Section>

      <div role="radiogroup" aria-label="แผน" style={{ display: "flex", gap: 6, overflowX: "auto", margin: "0 0 16px", paddingBottom: 2 }}>
        {[...TEMPLATES.map((t) => ({ id: t.id, name: t.name })), ...mine].map((t) => {
          const on = t.id === type;
          return (
            <button key={t.id} role="radio" aria-checked={on} className={`chip nowrap ${on ? "on" : ""}`} onClick={() => { if (!on) { play("tap"); setType(t.id); } }}>{t.name}</button>
          );
        })}
      </div>

      <Section header={`รายการ · ${def.name}`} footer={`แตะเวลาเพื่อแก้ · สวิตช์ = ใช้รายการนี้ · ไอคอนกระดิ่ง = แจ้งเตือนรายการนี้${items.some((i) => i.session) ? ` · ${NY_NOTE}` : ""}`}>
        {items.map((i) => {
          const o = ov(i.id);
          const enabled = o.enabled ?? !i.defaultOff;
          const remind = o.remind !== false;
          const changed = o.min !== undefined;
          return (
            <div key={i.id} className={`row ${enabled ? "" : "disabled"}`}>
              <input
                className="time-input"
                type="time"
                value={hm(i.min)}
                disabled={!enabled}
                onChange={(e) => {
                  if (!e.target.value) return;
                  const m = toMin(e.target.value);
                  if (i.custom) update((st) => { const c = st.schedule.custom.find((x) => x.id === i.id); if (c) c.min = m - st.schedule.shiftMin; });
                  else setOv(i.id, { min: m });
                }}
              />
              <span className="row-main">
                <div className="row-title fs-callout">{i.title}</div>
                <div className="row-sub">
                  {i.ring ? <><span className="tone-dot" style={{ ["--tone" as string]: RING_COLOR[i.ring] }} />{RING_LABEL[i.ring]}</> : "ไม่นับคะแนน"}
                  {i.custom ? " · ของคุณ" : changed ? ` · เดิม ${hm(orig(i.id) ?? i.min)}` : ""}
                </div>
              </span>
              {i.ring && (
                <button className={`icon-btn ${remind && enabled ? "ink-accent" : "ink-3"}`} aria-label="แจ้งเตือน" aria-pressed={remind} onClick={() => { play("tap"); setOv(i.id, { remind: !remind }); }}>
                  <IconBell size={18} fill={remind} />
                </button>
              )}
              {i.custom ? (
                <button className="icon-btn ink-danger" aria-label={`ลบ ${i.title}`} onClick={() => {
                  play("undo");
                  const removed = cfg.custom.find((x) => x.id === i.id);
                  update((st) => { st.schedule.custom = st.schedule.custom.filter((x) => x.id !== i.id); });
                  toast(`ลบ "${i.title}" แล้ว`, { action: "เลิกทำ", onAction: () => { if (removed) update((st) => { if (!st.schedule.custom.some((x) => x.id === removed.id)) st.schedule.custom.push(removed); }); } });
                }}><IconTrash size={18} /></button>
              ) : i.id === "stream-end" ? null : (
                <Switch label={i.title} on={enabled} onChange={(v) => setOv(i.id, { enabled: v })} />
              )}
            </div>
          );
        })}
        <button className="row" onClick={() => { setDraft({ id: "", title: "", min: toMin("14:00"), ring: "habit", days: type }); setAdding(true); }}>
          <span className="icon-btn ink-accent"><IconPlus size={20} /></span>
          <span className="row-main row-title link">เพิ่มรายการของคุณ</span>
        </button>
        <Link href="/settings/care" className="row row-link" onClick={() => play("nav")}>
          <span className="row-main"><span className="row-title">กิจวัตรดูแลตัวเอง</span><span className="row-sub">ตั้งค่า &gt; ดูแลตัวเอง</span></span>
          <Chev />
        </Link>
      </Section>

      <Section header="แผนนี้" footer={user ? `ทำสำเนาจาก "${TEMPLATE_BY_ID.get(user.from)?.name ?? user.from}"` : "แผนสำเร็จรูปเปลี่ยนชื่อหรือลบไม่ได้ ทำสำเนาแล้วปรับเป็นของคุณเองได้"}>
        <button className="row" onClick={() => { play("tap"); setName(`${def.name} (ของฉัน)`.slice(0, 40)); setNaming("copy"); setNameMode("copy"); }}><span className="row-main row-title link">ทำสำเนาแผนนี้</span></button>
        {user && <button className="row" onClick={() => { play("tap"); setName(user.name); setNaming("rename"); setNameMode("rename"); }}><span className="row-main row-title link">เปลี่ยนชื่อ</span></button>}
        {user && <button className="row" onClick={() => { play("tap"); setDeleting(true); }}><span className="row-main row-title ink-danger">ลบแผนนี้</span></button>}
        <button className="row" onClick={() => { play("tap"); setResetting(true); }}><span className="row-main row-title ink-danger">รีเซ็ตแผน &quot;{def.name}&quot;</span></button>
      </Section>

      <ConfirmSheet
        open={deleting}
        title={`ลบแผน "${def.name}"`}
        body={`วันที่บันทึกด้วยแผนนี้จะกลับไปใช้แผน "${TEMPLATE_BY_ID.get(user?.from ?? "off")?.name ?? ""}" และแผนสัปดาห์ที่เลือกแผนนี้จะกลับเป็นค่าพื้นฐาน`}
        confirmLabel="ลบ"
        danger
        onClose={() => setDeleting(false)}
        onConfirm={removeTemplate}
      />

      <ConfirmSheet
        open={resetting}
        title={`รีเซ็ตแผน "${def.name}"`}
        body="เวลาและการเปิด/ปิดของรายการทั้งหมดในแผนนี้จะกลับเป็นค่าเริ่มต้น (รายการของคุณยังอยู่)"
        confirmLabel="รีเซ็ต"
        danger
        onClose={() => setResetting(false)}
        onConfirm={() => {
          play("undo");
          update((st) => { for (const k of Object.keys(st.schedule.overrides)) if (k.startsWith(`${type}:`)) delete st.schedule.overrides[k]; });
          toast("รีเซ็ตแล้ว");
        }}
      />

      <Sheet open={naming !== null} title={nameMode === "copy" ? "ทำสำเนาแผน" : "เปลี่ยนชื่อแผน"} onClose={() => setNaming(null)}>
        <Section>
          <label className="row form-row">
            <span className="row-title form-label">ชื่อแผน</span>
            <input className="inline-input" maxLength={40} placeholder="เช่น วันสมดุล (ของฉัน)" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        </Section>
        <button className="btn" disabled={!name.trim()} onClick={() => saveName(Date.now())}>{nameMode === "copy" ? "ทำสำเนา" : "บันทึก"}</button>
      </Sheet>

      <Sheet open={adding} title="เพิ่มรายการ" onClose={() => setAdding(false)}>
        <Section footer={type === "work" ? "แผนนี้ = ทุกแผนที่มีกะงาน" : type === "off" ? "แผนนี้ = ทุกแผนที่ไม่มีกะงาน" : undefined}>
          <label className="row form-row">
            <span className="row-title form-label">ชื่อ</span>
            <input className="inline-input" placeholder="เช่น ยืดเหยียด 10 นาที" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </label>
          <label className="row form-row">
            <span className="row-title form-label">รายละเอียด</span>
            <input className="inline-input" placeholder="ไม่บังคับ" value={draft.sub ?? ""} onChange={(e) => setDraft({ ...draft, sub: e.target.value })} />
          </label>
          <label className="row form-row">
            <span className="row-title form-label">เวลา</span>
            <span className="row-main" />
            <input className="time-input" type="time" value={hm(draft.min)} onChange={(e) => e.target.value && setDraft({ ...draft, min: toMin(e.target.value) })} />
          </label>
          <div className="row">
            <span className="row-title form-label">หมวด</span>
            <div style={{ flex: 1 }}><Segmented value={draft.ring} options={[["food", "กิน"], ["body", "ร่างกาย"], ["habit", "นิสัย"]]} onChange={(v) => setDraft({ ...draft, ring: v })} /></div>
          </div>
          <div className="row">
            <span className="row-title form-label">ใช้วัน</span>
            <div style={{ flex: 1 }}><Segmented value={draft.days} options={[[type, "แผนนี้"], ["both", "ทุกแผน"]]} onChange={(v) => setDraft({ ...draft, days: v })} /></div>
          </div>
        </Section>
        <button className="btn" disabled={!draft.title.trim()} onClick={() => {
          play("done");
          const id = `c-${Date.now().toString(36)}`;
          update((st) => { st.schedule.custom.push({ ...draft, id, title: draft.title.trim(), sub: draft.sub?.trim() || undefined, min: draft.min - st.schedule.shiftMin }); });
          setAdding(false);
          toast(`เพิ่ม "${draft.title.trim()}" แล้ว`);
        }}>เพิ่ม</button>
      </Sheet>
    </main>
  );
}
