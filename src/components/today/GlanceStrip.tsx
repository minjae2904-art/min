"use client";

import { useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { IconDrop, IconFlame } from "@/components/Icons";
import { Rings } from "@/components/Rings";
import { BrainPanel, Ring, useBrainToday } from "@/components/brain/BrainCard";
import { useLongPress } from "@/components/gestures";
import { CountUp, Section, Sheet, Tap, toast } from "@/components/ui";
import { addWater } from "@/lib/actions";
import { AREA_LABEL } from "@/lib/brain/copy";
import { dayFor } from "@/lib/model";
import { itemsFor } from "@/lib/schedule";
import { play } from "@/lib/sound";
import { streak, waterGoal, week, weightStats } from "@/lib/stats";
import { useStore } from "@/lib/store";

export type Glance = null | "balance" | "rings" | "water";
const DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

function Legend({ label, color, v }: { label: string; color: string; v: number }) {
  return (
    <div>
      <div className="legend-label"><span className="tone-dot" style={{ ["--tone" as string]: color }} />{label}</div>
      <div className="legend-value"><CountUp value={Math.round(v * 100)} /><small>%</small></div>
    </div>
  );
}

// Balance tile + its large sheet. Mounted only while settings.brainCard is on, so the engine runs only then.
function BalanceTile({ open, onOpen, onClose }: { open: boolean; onOpen: () => void; onClose: () => void }) {
  const t = useBrainToday();
  const sub = t.lost.length ? "ถูกเขียนทับ"
    : t.due ? "รีวิวพร้อม"
    : t.shown.length && !t.hidden && !t.inGame ? `${t.shown.length} ข้อเสนอ`
    : t.logged < 3 ? `อีก ${3 - t.logged} วัน`
    : t.weakest ? `ดูแล${AREA_LABEL[t.weakest]}` : "ดูรายละเอียด";
  const dot = (t.shown.length > 0 || t.due) && !t.hidden;
  return (
    <>
      <button type="button" className="glance-tile" aria-label={`สมดุล ${t.bal ?? "ยังไม่มีคะแนน"} · ${sub}`} onClick={onOpen}>
        <span className="glance-label">สมดุล</span>
        <span className="glance-art"><Ring value={t.bal} size={32} bare /></span>
        {dot && <span className="glance-dot" aria-hidden />}
        <span className="glance-value">{t.bal ?? "-"}</span>
        <span className="glance-sub">{sub}</span>
      </button>
      <Sheet open={open} title="สมดุลวันนี้" onClose={onClose}>
        <BrainPanel t={t} onHide={onClose} />
      </Sheet>
    </>
  );
}

// Glance strip (spec 8.4): Balance (when on), Rings and Water tiles; each opens a sheet. Open state lives in page.tsx.
export function GlanceStrip({ date, glance, setGlance }: { date: string; glance: Glance; setGlance: (g: Glance) => void }) {
  const { s, update } = useStore();
  const [waterTap, setWaterTap] = useState(0); // water added on this visit: drop bob
  const [waterHit, setWaterHit] = useState(false); // a tap on this visit reached the goal: badge pop
  const hold = useLongPress(() => setGlance("water"));
  const day = dayFor(s, date);
  const tracked = itemsFor(s.schedule, day, date).filter((i) => i.ring);
  const skipped = day.skip ? itemsFor(s.schedule, { ...day, skip: undefined }, date).filter((i) => day.skip?.[i.id]).length : 0;
  const ratio = (ring: string) => {
    const r = tracked.filter((i) => i.ring === ring);
    return r.length ? r.filter((i) => day.done[i.id]).length / r.length : 0;
  };
  const pct = tracked.length ? tracked.filter((i) => day.done[i.id]).length / tracked.length : 0;
  const st = streak(s, date);
  const wk = week(s, date);
  const { cur: latestKg } = weightStats(s, date);
  const goal = waterGoal(s, day, latestKg);
  const brain = s.settings.brainCard;
  const close = () => setGlance(null);

  // Adds water with the v1.x sounds and drop bob. toast: the tile's +250 (undoable); the sheet chips stay silent as before.
  function add(ml: number, withToast: boolean) {
    const hit = day.waterMl < goal && day.waterMl + ml >= goal;
    const total = Math.max(0, day.waterMl + ml);
    play(hit ? "complete" : "water");
    if (hit) setWaterHit(true);
    setWaterTap((n) => n + 1);
    update((x) => { addWater(x, date, ml); });
    if (withToast) toast(`+${ml} ml · ${(total / 1000).toFixed(2)} ลิตร`, { action: "เลิกทำ", onAction: () => update((x) => { addWater(x, date, -ml); }) });
  }
  function remove() {
    const gone = Math.min(250, day.waterMl);
    if (!gone) return play("error");
    play("undo");
    update((x) => { addWater(x, date, -gone); });
    toast(`-${gone} ml`, { action: "เลิกทำ", onAction: () => update((x) => { addWater(x, date, gone); }) });
  }

  const l = day.waterMl / 1000, g = (goal / 1000).toFixed(1);
  return (
    <>
      <div className="glance" role="group" aria-label="สรุปวันนี้" data-n={brain ? 3 : 2}>
        {brain && <BalanceTile open={glance === "balance"} onOpen={() => setGlance("balance")} onClose={close} />}
        <button type="button" className="glance-tile" aria-label={`วันนี้ครบ ${Math.round(pct * 100)}% ติดต่อกัน ${st.days} วัน เปิดรายละเอียด`} onClick={() => setGlance("rings")}>
          <span className="glance-label">วันนี้</span>
          <span className="glance-art"><Rings values={[ratio("food"), ratio("body"), ratio("habit")]} size={36} /></span>
          <span className="glance-value"><CountUp value={Math.round(pct * 100)} /><small>%</small></span>
          <span className="glance-sub">ติดต่อกัน {st.days} วัน</span>
        </button>
        <div className="glance-tile glance-tile--water" data-area="water">
          <button type="button" className="glance-hit" aria-label={`น้ำดื่ม ${l.toFixed(2)} จาก ${g} ลิตร เปิดรายละเอียด`} onClick={() => setGlance("water")} />
          <span className="glance-label">น้ำ</span>
          <span key={waterTap} className={`glance-art water-drop ${waterTap ? "drop-bob" : ""}`}><IconDrop size={22} /></span>
          <span className="glance-value">{l.toFixed(2)}<small> / {g} ล.</small></span>
          <Tap className="chip glance-add" label="ดื่มน้ำ +250 มล." bind={hold.bind} onTap={() => add(250, true)}>+250</Tap>
        </div>
      </div>

      <Sheet open={glance === "rings"} title="ความครบวันนี้" detent="medium" onClose={close}>
        <div className="stat-row">
          <div className="stat">
            <div className="stat-label">วันนี้</div>
            <div className="stat-value"><CountUp value={Math.round(pct * 100)} /><small>%</small></div>
          </div>
          <div className="stat">
            <div className="stat-label"><span className="ic-orange"><IconFlame size={13} /></span>ติดต่อกัน</div>
            <div className="stat-value"><CountUp value={st.days} /><small> วัน</small></div>
          </div>
          <div className="stat">
            <div className="stat-label">7 วันล่าสุด</div>
            <div className="stat-value"><CountUp value={wk.goodDays} /><small>/7</small></div>
          </div>
        </div>
        <div className="card">
          <div className={`rings-card rings-wrap ${pct >= 1 ? "complete" : ""}`}>
            <Rings values={[ratio("food"), ratio("body"), ratio("habit")]} />
            <div className="legend">
              <Legend label="กิน" color="var(--ring-food)" v={ratio("food")} />
              <Legend label="ร่างกาย" color="var(--ring-body)" v={ratio("body")} />
              <Legend label="นิสัย" color="var(--ring-habit)" v={ratio("habit")} />
            </div>
          </div>
          <div className="weekbar" aria-label="ความครบ 7 วัน">
            {wk.scores.map((x, k) => (
              <span key={x.date} className={`${x.score >= s.settings.goodDay ? "good" : ""} ${x.date === date ? "today" : ""}`} style={{ height: `${Math.max(8, x.score * 100)}%`, ["--bi" as string]: k }} />
            ))}
          </div>
          <div className="weekdays">
            {wk.scores.map((x) => <span key={x.date}>{DOW[new Date(x.date + "T12:00:00").getDay()]}</span>)}
          </div>
          {st.forgiven && <div className="card-note">พลาดไป 1 วันไม่เป็นไร ยังนับต่อเนื่อง แค่อย่าพลาด 2 วันติด</div>}
          {skipped > 0 && <div className="card-note">ข้าม {skipped} รายการวันนี้ (ไม่นับคะแนน)</div>}
        </div>
      </Sheet>

      <Sheet open={glance === "water"} title="น้ำดื่ม" detent="medium" onClose={close}>
        <Section footer={`เป้าคำนวณจากน้ำหนัก ${latestKg.toFixed(1)} kg + กิจกรรมวันนี้`}>
          <div className="water-panel">
            <div className="water-head">
              <span key={waterTap} className={`water-drop ${waterTap ? "drop-bob" : ""}`}><IconDrop size={22} /></span>
              <span className="big-number fs-title1"><CountUp value={l} decimals={2} duration={500} /></span>
              <span className="water-goal">/ {g} ลิตร</span>
              {day.waterMl >= goal && <span className={`badge ok water-ok ${waterHit ? "pop-in" : ""}`}>ครบแล้ว</span>}
            </div>
            <div className="water-track">
              <span className="fill-x grow water-fill" style={{ ["--p" as string]: Math.min(1, day.waterMl / goal) }} />
            </div>
            {day.waterMl === 0 && <EmptyState art="holding-water" title="เริ่มแก้วแรกกัน" compact />}
            <div className="chips">
              {[250, 350, 500, 1000].map((ml) => <Tap key={ml} className="chip" onTap={() => add(ml, false)}>+{ml}</Tap>)}
              <button className="chip chip--danger" onClick={remove}>-250</button>
            </div>
          </div>
        </Section>
      </Sheet>
    </>
  );
}
