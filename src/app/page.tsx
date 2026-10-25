"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconBriefcase, IconCheck, IconCup, IconDrop, IconFlame, IconGame, IconMoon } from "@/components/Icons";
import { CheckIn } from "@/components/CheckIn";
import { MiniTimeline } from "@/components/MiniTimeline";
import { NowBanner } from "@/components/NowBanner";
import { QuickLog } from "@/components/QuickLog";
import { SleepWake } from "@/components/SleepWake";
import { BrainCard } from "@/components/brain/BrainCard";
import { TemplatePicker } from "@/components/TemplatePicker";
import { applyWeekPlan, setDayTemplate, setDone, setVoiceRest, setWeight, startStreamSeason, stopTaper, taperOffer } from "@/lib/actions";
import { thaiDate } from "@/lib/brain/copy";
import { Rings } from "@/components/Rings";
import { Chev, Confetti, CountUp, Section, Segmented, Sheet, toast } from "@/components/ui";
import { THAI_DATE, at, hm, logicalDate, logicalMinutes } from "@/lib/date";
import { GYM_CYCLE, GYM_LABEL, PERSONALITY_CYCLE, PERSONALITY_LABEL, nextInCycle } from "@/lib/rotation";
import { MEAL2_LABEL, blockEnd, itemsFor, resolveTemplate, taperDone, taperShift, type Item, type Meal2 } from "@/lib/schedule";
import { phases } from "@/lib/phase";
import { introPreset } from "@/lib/templates";
import { DEFAULT_IDENTITY, badgeCatalog, dayMessage, maybePraise, microStep } from "@/lib/psych";
import { play } from "@/lib/sound";
import { streak, waterGoal, week, weightStats } from "@/lib/stats";
import { useStore } from "@/lib/store";
import { dayFor, hasCheckin, plannedType, type TradeLog, type TradeResult } from "@/lib/model";

const TRADE_RESULT: [TradeResult, string][] = [["win", "กำไร"], ["loss", "ขาดทุน"], ["be", "เสมอ"], ["open", "ยังถืออยู่"]];

const DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const span = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} ชม.${m % 60 ? ` ${m % 60} น.` : ""}` : `${m} น.`);

function greeting(d: Date) {
  const h = d.getHours();
  if (h >= 5 && h < 12) return "สวัสดีตอนเช้า";
  if (h >= 12 && h < 17) return "สวัสดีตอนบ่าย";
  if (h >= 17 && h < 21) return "สวัสดีตอนเย็น";
  return "สวัสดีตอนดึก";
}

function countdown(diff: number) {
  if (Math.abs(diff) < 5) return "ถึงเวลาแล้ว";
  const a = Math.abs(diff);
  const t = a >= 60 ? `${Math.floor(a / 60)} ชม. ${a % 60} น.` : `${a} นาที`;
  return diff > 0 ? `อีก ${t}` : `เลยมา ${t}`;
}

export default function Today() {
  const { s, update, pulled } = useStore();
  const [now, setNow] = useState(() => new Date());
  const [sheet, setSheet] = useState<null | "meal2" | "weigh" | "journal" | "trade" | "sing">(null);
  const [tr, setTr] = useState<TradeLog>({ count: 1, result: "open" });
  const [jr, setJr] = useState({ good: "", fix: "", thanks: "" });
  const [kg, setKg] = useState("");
  const [popped, setPopped] = useState<string | null>(null);
  const [party, setParty] = useState(0);
  const [quick, setQuick] = useState(false);
  const [picker, setPicker] = useState(false);
  const [waterTap, setWaterTap] = useState(0); // water added on this visit: drop bob
  const [waterHit, setWaterHit] = useState(false); // a tap on this visit reached the goal: badge pop
  const [singMin, setSingMin] = useState<10 | 20 | 30 | 45 | null>(null); // optional "sang for N min" chip

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    // iOS pauses the interval in the background: jump straight to the current time on resume (nothing replays).
    const onVis = () => { if (!document.hidden) setNow(new Date()); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  const date = logicalDate(now);
  const nowMin = logicalMinutes(now);
  const day = dayFor(s, date);
  const { def } = resolveTemplate(s.schedule, day.type);
  const items = itemsFor(s.schedule, day, date);
  const planned = plannedType(s, date);
  const tracked = items.filter((i) => i.ring);
  const singItem = items.find((i) => i.kind === "sing");

  const gymNext = nextInCycle(GYM_CYCLE, s.workouts.filter((w) => w.date !== date));
  const gymToday = s.workouts.find((w) => w.date === date)?.code;
  const personaNext = nextInCycle(PERSONALITY_CYCLE, s.personality.filter((w) => w.date !== date));

  const ratio = (ring: string) => {
    const r = tracked.filter((i) => i.ring === ring);
    return r.length ? r.filter((i) => day.done[i.id]).length / r.length : 0;
  };
  const doneCount = tracked.filter((i) => day.done[i.id]).length;
  const pct = tracked.length ? doneCount / tracked.length : 0;
  const pending = tracked.filter((i) => !day.done[i.id]);
  const sleepItem = items.find((i) => i.kind === "sleep");
  const dayOver = !!sleepItem && nowMin >= sleepItem.min + 60;
  const next = dayOver ? undefined : pending.find((i) => i.min >= nowMin - 30) ?? pending[0];
  const [firstNext] = useState(next?.id); // hero card on mount: slide only when it changes

  const st = streak(s, date);
  const wk = week(s, date);
  const { cur: latestKg } = weightStats(s, date);
  const waterTarget = waterGoal(s, day, latestKg);
  const dnd = s.settings.dndUntil > now.getTime();
  const wakeMin = items.find((i) => i.id === "weigh")?.min ?? items[0]?.min ?? 0;
  const showCheckin = !day.checkin && (!!day.wakeAt || nowMin >= wakeMin) && nowMin < wakeMin + 6 * 60;
  const msg = dayMessage(s, date);

  // v1.4 stream season card (one-time) and its notes. Season wake/sleep are 09:30/01:30 plus the global shift.
  const seasonWake = hm(570 + s.schedule.shiftMin), seasonSleep = hm(1530 + s.schedule.shiftMin);
  const streamCard = pulled && !s.settings.streamAsked;
  const streamOffer = streamCard ? taperOffer(s, date) : null;
  const streamNotes: string[] = [];
  if (streamCard) {
    const sh = s.schedule.shiftMin;
    if (streamOffer) streamNotes.push(`ค่อยๆ เลื่อน: เริ่มวัน${thaiDate(streamOffer.start)} ตื่น ${hm(streamOffer.firstWake)} แล้วตื่นเร็วขึ้นวันละ 30 นาที ถึงตื่น ${seasonWake} วัน${thaiDate(streamOffer.doneDate)} (ระหว่างนี้เวลาไลฟ์ขยับตามด้วย)`);
    if (s.days[date]) streamNotes.push("วันนี้ยังใช้แผนเดิม");
    if (sh < -60) streamNotes.push(`ตารางทั้งหมดเลื่อนอยู่ ${sh} นาที เวลาตื่นช่วงไลฟ์จะใกล้ 08:00 ซึ่งเป็นเวลาเริ่มวันของแอป แนะนำตั้งเป็น 0 ที่ ตั้งค่า > แผนประจำวัน`);
    else if (sh) streamNotes.push(`ตารางทั้งหมดเลื่อนอยู่ ${sh > 0 ? "+" : ""}${sh} นาที (ตั้งค่า > แผนประจำวัน)`);
    const outside = s.schedule.custom.filter((c) => c.days === "both" && (c.min + sh < 570 || c.min + sh > 1530));
    if (outside.length) streamNotes.push(`รายการที่เพิ่มเอง (ทุกวัน) อยู่นอกเวลาตื่น-นอนใหม่: ${outside.map((c) => c.title).join(", ")} ย้ายได้ที่ ตั้งค่า > แผนประจำวัน`);
    if (s.schedule.custom.some((c) => c.days === "off")) streamNotes.push("รายการที่เพิ่มเองของวันหยุดแบบเดิม จะไม่แสดงในวันช่วงไลฟ์");
  }

  // Sleep taper note: before it starts, or while today (a season day) is still shifted. Times come from the built days.
  const tp = s.schedule.taper;
  const tpNow = def.season === "stream" ? taperShift(tp, date) : 0;
  const taperStopped = !!tp?.stop;
  let taperNote: string | null = null;
  if (tp && !tp.stop && date < tp.start) {
    const w = itemsFor(s.schedule, dayFor(s, tp.start), tp.start).find((i) => i.id === "weigh");
    taperNote = `เริ่มค่อยๆ เลื่อนเวลานอนวัน${thaiDate(tp.start)}${w ? ` ตื่น ${hm(w.min)}` : ""}`;
  } else if (tp && tpNow > 0 && taperStopped) {
    taperNote = `หยุดค่อยๆ เลื่อนแล้ว: วันนี้ตื่น ${hm(wakeMin)}${sleepItem ? ` นอน ${hm(sleepItem.min)}` : ""} · ใช้ ${seasonWake}-${seasonSleep} ตั้งแต่พรุ่งนี้`;
  } else if (tp && tpNow > 0) {
    taperNote = `ค่อยๆ เลื่อนเวลานอน: วันนี้ตื่น ${hm(wakeMin)}${sleepItem ? ` นอน ${hm(sleepItem.min)}` : ""} · ตื่น ${seasonWake} ได้ตั้งแต่วัน${thaiDate(taperDone(tp))}`;
  }

  // Award badges the moment the data qualifies (progress principle: make progress visible).
  const badges = badgeCatalog(s, date);
  const fresh = badges.filter((b) => b.earned && !s.achievements[b.id]);
  useEffect(() => {
    // Wait for the first server pull so a stale local cache does not award (and celebrate) badges twice.
    if (!fresh.length || !pulled) return;
    update((x) => { for (const b of fresh) x.achievements[b.id] = Date.now(); });
    // The first run back-fills old badges silently; only celebrate when 1-2 are new.
    // No cleanup: update() empties `fresh` on the next render, which would cancel the timer.
    if (fresh.length <= 2) {
      setTimeout(() => {
        play("complete");
        setParty((n) => n + 1);
        toast(`ได้เหรียญใหม่: ${fresh.map((b) => b.title).join(", ")}`);
      }, 400);
    }
  }, [fresh.map((b) => b.id).join(), pulled]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (fn: (d: typeof day) => void) =>
    update((x) => {
      const d = dayFor(x, date);
      fn(d);
      x.days[date] = d;
    });

  function toggle(item: Item) {
    if (item.id === "meal2" && def.work && !day.done.meal2 && !day.meal2) return setSheet("meal2");
    if (item.kind === "weigh" && !day.done.weigh) return setSheet("weigh");
    if (item.kind === "trade" && !day.done[item.id]) { setTr(day.trade ?? { count: 1, result: "open" }); return setSheet("trade"); }
    if (item.id === "night" && !day.done.night) { setJr(day.journal ?? { good: "", fix: "", thanks: "" }); return setSheet("journal"); }
    if (item.kind === "sing" && !day.done[item.id]) return setSheet("sing");
    tick(item, !day.done[item.id]);
  }

  function tick(item: Item, on: boolean) {
    const finishing = on && doneCount + 1 === tracked.length;
    play(!on ? "undo" : finishing ? "complete" : "done");
    if (on) setPopped(item.id);
    if (finishing) setParty((n) => n + 1);
    if (on && !finishing) {
      const ringLeft = tracked.filter((i) => i.ring === item.ring && i.id !== item.id && !day.done[i.id]).length;
      const ringName = { food: "กิน", body: "ร่างกาย", habit: "นิสัย" }[item.ring ?? "habit"];
      const praise = maybePraise(((doneCount * 7 + item.min) % 100) / 100); // deterministic "random" keeps render pure
      if (ringLeft === 0) toast(`ปิดวง${ringName}ครบแล้ว`);
      else if (praise) toast(praise);
    }
    update((x) => setDone(x, date, item, on, item.id === "cardio" ? gymToday ?? "R" : gymToday ?? gymNext));
  }

  // Switch today's plan; ticks stay because the core ids are shared. Undo restores the previous plan.
  function pickPlan(id: string | null) {
    if (!id || id === day.type) return;
    const prev = day.type;
    play("toggle");
    update((x) => setDayTemplate(x, date, id));
    toast(`วันนี้ใช้แผน "${resolveTemplate(s.schedule, id).def.name}"${Object.keys(day.done).length ? " · ติ๊กที่ทำแล้วยังอยู่" : ""}`, {
      action: "เลิกทำ", onAction: () => update((x) => setDayTemplate(x, date, prev)),
    });
  }

  // strain: the hoarse/sore button also logs a strain chip (brain voice signal); undo removes both.
  function restVoice(strain = false) {
    play("toggle");
    update((x) => { setVoiceRest(x, date, true); if (strain) x.days[date].sing = { ...x.days[date].sing, strain: true }; });
    toast("พักเสียงวันนี้แล้ว รายการร้องเพลงไม่นับคะแนน", { action: "เลิกทำ", onAction: () => update((x) => {
      setVoiceRest(x, date, false);
      const d = x.days[date];
      if (strain && d?.sing) { const rest = { ...d.sing }; delete rest.strain; if (Object.keys(rest).length) d.sing = rest; else delete d.sing; }
    }) });
  }

  // One-time "still on the night shift?" card: writes the week plan only (offWeekdays untouched).
  function answerIntro(job: boolean | null) {
    play("tap");
    if (job === null) return update((x) => { x.settings.planAsked = true; });
    const prev = [...s.settings.weekPlan], prevJob = s.settings.job;
    update((x) => { applyWeekPlan(x, introPreset(x.settings.offWeekdays, job)); x.settings.job = job ? "yes" : "no"; });
    toast(`ตั้งแผนสัปดาห์แล้ว${s.days[date] ? " · วันนี้ยังใช้แผนเดิม แตะชื่อแผนเพื่อเปลี่ยน" : ""}`, {
      action: "เลิกทำ", onAction: () => update((x) => { x.settings.weekPlan = prev; x.settings.planAsked = false; x.settings.job = prevJob; }),
    });
  }

  // One-time v1.4 "stream season" card: week preset + job "no" (both stated on the card) + optional sleep taper.
  // Nothing is set without a tap; undo restores every field the confirm touched.
  function answerStream(mode: "taper" | "now" | null) {
    play("tap");
    if (mode === null) return update((x) => { x.settings.streamAsked = true; });
    const prev = { weekPlan: [...s.settings.weekPlan], planAsked: s.settings.planAsked, job: s.settings.job, streamAsked: s.settings.streamAsked, taper: s.schedule.taper ?? null };
    const o = mode === "taper" ? streamOffer : null; // same state as the confirm below, so the same offer
    update((x) => { startStreamSeason(x, date, mode === "taper"); });
    toast(`เริ่มช่วงไลฟ์แล้ว${o ? ` · ${o.start === date ? "วันนี้" : "พรุ่งนี้"}ตื่น ${hm(o.firstWake)}` : ""}${s.days[date] ? " · วันนี้ยังใช้แผนเดิม" : ""}`, {
      action: "เลิกทำ", onAction: () => update((x) => {
        x.settings.weekPlan = prev.weekPlan; x.settings.planAsked = prev.planAsked; x.settings.job = prev.job;
        x.settings.streamAsked = prev.streamAsked; x.schedule.taper = prev.taper;
      }),
    });
  }

  // Stop the sleep taper: on plan from today (unlogged) or tomorrow (logged). Undo restores the previous taper object.
  function endTaper() {
    play("undo");
    const prev = s.schedule.taper ?? null;
    update((x) => stopTaper(x, date));
    toast(`หยุดค่อยๆ เลื่อนแล้ว ใช้ ${seasonWake}-${seasonSleep} ตั้งแต่${s.days[date] ? "พรุ่งนี้" : "วันนี้"}`, { action: "เลิกทำ", onAction: () => update((x) => { x.schedule.taper = prev; }) });
  }

  function subFor(item: Item) {
    if (item.id === "stream") {
      const end = blockEnd(items, item) ?? item.min;
      return `${hm(item.min)}-${hm(end)} · ${span(end - item.min)}${item.sub ? ` · ${item.sub}` : ""}`;
    }
    if (item.id === "gym") {
      const code = gymToday ?? gymNext;
      const dl = s.brain.deload;
      const deload = dl && dl.from <= date && date <= dl.to ? (dl.from === dl.to ? " · วันนี้เล่นเบา" : " · deload: ท่าเดิม เซ็ตครึ่งหนึ่ง") : "";
      return `${gymToday ? "เล่นแล้ว" : "ครั้งนี้"}: ${code} ${GYM_LABEL[code]}${deload}`;
    }
    if (item.kind === "personality") return `${personaNext} ${PERSONALITY_LABEL[personaNext]} · 30-45 นาที`;
    if (item.kind === "trade" && day.trade) {
      return day.trade.result === "skip" ? "ดูกราฟแล้ว ไม่มีจังหวะ ไม่เข้า" : `เทรด ${day.trade.count} ไม้ · ${TRADE_RESULT.find(([k]) => k === day.trade!.result)?.[1] ?? ""}${day.trade.note ? ` · ${day.trade.note}` : ""}`;
    }
    // Legacy work/off days keep their v1.0 text.
    if (item.kind === "trade" && !def.legacy && [0, 6].includes(new Date(date + "T12:00:00").getDay())) return "ตลาด FX ปิดวันนี้ กด 'ไม่มีจังหวะ' ได้เลย";
    if (item.session) return item.sub ? `${item.sub} · เวลาตามตลาดนิวยอร์ก` : "เวลาตามตลาดนิวยอร์ก";
    return item.sub;
  }
  // Info rows (not scored): game blocks show their time span, plus a positive note once everything before is done.
  function infoSub(item: Item) {
    if (item.id !== "game" && item.id !== "game1") return item.sub;
    const end = blockEnd(items, item) ?? item.min;
    const before = tracked.filter((i) => i.min < item.min);
    return `${hm(item.min)}-${hm(end)} · ${span(end - item.min)}${before.length && before.every((i) => day.done[i.id]) ? " · ทำครบก่อนเกมแล้ว เล่นเต็มที่" : ""}`;
  }
  function cueFor(item: Item) {
    return item.cue ? `${item.cue}` : null;
  }

  // List sections: the v1.0 three-way split for templates without phases, else one section per phase (sleep excluded).
  // Each phase takes items from its start to the next start; the first also takes anything earlier, the last anything later.
  const sections: { key: string; header: (list: Item[]) => string; list: Item[] }[] = [];
  const ringCount = (list: Item[]) => `${list.filter((i) => i.ring && day.done[i.id]).length}/${list.filter((i) => i.ring).length}`;
  if (!def.phases) {
    const split: [string, Item[]][] = [
      ["ก่อนเข้างาน", items.filter((i) => i.min < at(16))],
      [def.work ? "ระหว่างงาน" : "ช่วงเย็น", items.filter((i) => i.min >= at(16) && i.min < at(2))],
      [def.work ? "หลังเลิกงาน" : "ก่อนนอน", items.filter((i) => i.min >= at(2))],
    ];
    for (const [title, list] of split) sections.push({ key: title, header: (l) => `${title} · ${ringCount(l)}`, list });
  } else {
    const ps = phases(s, day, date).filter((p) => p.key !== "sleep");
    ps.forEach((p, k) => sections.push({
      key: p.key,
      header: (l) => `${p.label} · ${hm(p.start)}-${hm(p.end)}${l.some((i) => i.ring) ? ` · ${ringCount(l)}` : ""}`,
      list: items.filter((i) => (k === 0 || i.min >= p.start) && (k === ps.length - 1 || i.min < p.end)),
    }));
  }

  return (
    <main className="screen today">
      <div className="topbar">
        <div>
          <div className="eyebrow">{THAI_DATE(date)}</div>
          <h1 className="large-title">{greeting(now)}{s.profile.name ? ` ${s.profile.name}` : ""}</h1>
        </div>
        <Link href="/settings" className="avatar" aria-label="ตั้งค่า">{(s.profile.name || "K").slice(0, 1).toUpperCase()}</Link>
      </div>
      <div className="identity"><span>เป้าหมายตัวตน:</span><b>{s.profile.identity || DEFAULT_IDENTITY}</b></div>

      <NowBanner s={s} day={day} date={date} now={now} nowMin={nowMin} />

      <div className="sw-slot"><SleepWake date={date} now={now} /></div>

      {msg && <div className="daymsg">{msg}</div>}

      {showCheckin && (
        <CheckIn
          onSkip={() => patch((d) => { d.checkin = { mood: 0, energy: 0, sleep: 0 }; })}
          onSave={(v) => { patch((d) => { d.checkin = v; }); toast(v.energy <= 2 ? "พลังงานต่ำวันนี้ เริ่มจากข้อเล็กๆ ก่อนก็พอ" : "บันทึกแล้ว ขอให้เป็นวันที่ดี"); }}
        />
      )}

      {streamCard && (
        <div className="card plan-intro">
          <div className="sw-title">ช่วงไลฟ์ยาวก่อนเปิดเทอม</div>
          <div className="sw-sub">ไลฟ์ทุกวันอย่างน้อย 5 ชม. (19:00-00:30 · เสาร์มาราธอน 15:00-00:30) · นอน 01:30 ตื่น 09:30 · ยก 4 วัน · เทรด London 15:00 วันธรรมดา · แอปจะตั้งแผนสัปดาห์และสถานะงานกะเป็น &apos;ไม่ได้ทำแล้ว&apos; (เปลี่ยนได้ที่ ตั้งค่า &gt; สมอง Krob) เลิกทำได้</div>
          {streamNotes.map((n) => <div key={n} className="sw-sub">{n}</div>)}
          <div className="sw-actions">
            {streamOffer && <button className="chip" style={{ background: "var(--red)", color: "#fff" }} onClick={() => answerStream("taper")}>ค่อยๆ เลื่อน (แนะนำ)</button>}
            <button className="chip" style={streamOffer ? undefined : { background: "var(--red)", color: "#fff" }} onClick={() => answerStream("now")}>เริ่มเลย</button>
            <button className="chip" onClick={() => answerStream(null)}>ไว้ทีหลัง</button>
          </div>
          {streamOffer && <div className="sw-sub">เริ่มเลย: คืนแรกจะนอนได้สั้นถ้าเข้านอนตามเวลาเดิม</div>}
        </div>
      )}

      {pulled && s.settings.streamAsked && !s.settings.planAsked && (
        <div className="card plan-intro">
          <div className="sw-title">ใหม่: เลือกแผนแต่ละวันได้แล้ว</div>
          <div className="sw-sub">ตอนนี้ยังทำงานกะดึก 16:00-02:00 อยู่ไหม แอปจะจัดแผนสัปดาห์ให้ เปลี่ยนได้ทุกเมื่อ ตารางเดิมยังอยู่</div>
          <div className="sw-actions">
            <button className="chip" style={{ background: "var(--blue)", color: "#fff" }} onClick={() => answerIntro(true)}>ยังทำงานอยู่</button>
            <button className="chip" style={{ background: "var(--blue)", color: "#fff" }} onClick={() => answerIntro(false)}>ไม่ได้ทำแล้ว</button>
            <button className="chip" onClick={() => answerIntro(null)}>ไว้ทีหลัง</button>
          </div>
        </div>
      )}

      <BrainCard />

      <button className="card plan-row" onClick={() => setPicker(true)}>
        <span key={day.type} className="plan-row-body swap">
          <span className="plan-row-top">
            <span className="tpl-dot" style={{ background: def.color }} />
            <span className="row-main">
              <span className="plan-row-title">แผนวันนี้: {def.name}</span>
              <span className="row-sub">{def.short}</span>
            </span>
            <Chev />
          </span>
          <MiniTimeline items={items} work={def.work} nowMin={nowMin} />
        </span>
      </button>
      {day.type !== planned && (
        <div className="plan-note">
          <span>เปลี่ยนเองวันนี้ · แผนสัปดาห์คือ &quot;{resolveTemplate(s.schedule, planned).def.name}&quot;</span>
          <button className="link" onClick={() => pickPlan(planned)}>ใช้ตามแผนสัปดาห์</button>
        </div>
      )}
      {taperNote && (
        <div className="plan-note">
          <span>{taperNote}</span>
          {!taperStopped && <button className="link" onClick={endTaper}>หยุด</button>}
        </div>
      )}
      {day.voiceRest && (
        <div className="plan-note">
          <span>พักเสียงวันนี้ (ซ่อนรายการร้องเพลง)</span>
          <button className="link" onClick={() => { play("undo"); update((x) => setVoiceRest(x, date, false)); }}>ยกเลิก</button>
        </div>
      )}

      {dnd && (
        <button className="card" style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "12px 16px", marginBottom: 16 }}
          onClick={() => { play("toggle"); update((x) => { x.settings.dndUntil = 0; }); }}>
          <span style={{ color: "var(--purple)" }}><IconMoon size={20} /></span>
          <span style={{ flex: 1, fontSize: 15 }}>พักการแจ้งเตือนถึง {new Date(s.settings.dndUntil).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</span>
          <span className="link" style={{ fontSize: 15 }}>เปิดต่อ</span>
        </button>
      )}

      {next ? (
        <div className="hero">
          <div key={next.id} className={`hero-swap ${next.id !== firstNext ? "next-in" : ""}`} style={{ flex: 1, minWidth: 0, position: "relative" }}>
            <div className="hero-label">ถัดไป · {hm(next.min)} · {countdown(next.min - nowMin)}</div>
            <div className="hero-title">{next.title}</div>
            {subFor(next) && <div className="hero-sub">{subFor(next)}</div>}
            {cueFor(next) && <div className="hero-sub"><span className="cue">ทำต่อจาก:</span> {cueFor(next)}</div>}
            {next.min + 15 < nowMin && <div className="micro">{microStep(next)}</div>}
          </div>
          <button className="hero-check" aria-label="ทำแล้ว" onClick={() => toggle(next)}><IconCheck size={26} /></button>
        </div>
      ) : (
        <div className={`hero allset ${party ? "won" : ""}`}>
          <div style={{ flex: 1, position: "relative" }}>
            <div className="hero-label" style={{ color: pending.length ? "var(--purple)" : "var(--green)" }}>{pending.length ? "จบวันแล้ว" : "ครบทุกอย่างแล้ว"}</div>
            <div className="hero-title">วันนี้ทำครบ {doneCount}/{tracked.length} รายการ</div>
            <div className="hero-sub">{pending.length ? `ยังไม่ได้ติ๊ก ${pending.length} รายการ ใช้บันทึกแบบเร็วเติมย้อนหลังได้ · วันใหม่เริ่ม 08:00` : "พักผ่อนให้เต็มที่ เจอกันพรุ่งนี้"}</div>
          </div>
        </div>
      )}

      <button className="quick-btn" onClick={() => { play("open"); setQuick(true); }}>
        <IconCheck size={20} /> บันทึกแบบเร็ว · ไล่ทีละขั้น ({pending.filter((i) => i.min <= nowMin + 30).length + (hasCheckin(day) ? 0 : 1)})
      </button>

      <div className="stat-row">
        <div className="stat">
          <div className="stat-label">วันนี้</div>
          <div className="stat-value"><CountUp value={Math.round(pct * 100)} /><small>%</small></div>
        </div>
        <div className="stat">
          <div className="stat-label"><span style={{ color: "var(--orange)" }}><IconFlame size={13} /></span>ติดต่อกัน</div>
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
        {st.forgiven && <div style={{ fontSize: 13, color: "var(--label2)", marginTop: 8 }}>พลาดไป 1 วันไม่เป็นไร ยังนับต่อเนื่อง แค่อย่าพลาด 2 วันติด</div>}
      </div>

      <Section header="น้ำดื่ม" footer={`เป้าคำนวณจากน้ำหนัก ${latestKg.toFixed(1)} kg + กิจกรรมวันนี้`}>
        <div style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
            <span key={waterTap} className={waterTap ? "drop-bob" : undefined} style={{ color: "var(--teal)", display: "inline-flex" }}><IconDrop size={22} /></span>
            <span className="big-number" style={{ fontSize: 28 }}><CountUp value={day.waterMl / 1000} decimals={2} duration={500} /></span>
            <span style={{ color: "var(--label2)" }}>/ {(waterTarget / 1000).toFixed(1)} ลิตร</span>
            {day.waterMl >= waterTarget && <span className={`badge ok ${waterHit ? "pop-in" : ""}`} style={{ marginLeft: "auto" }}>ครบแล้ว</span>}
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "var(--fill)", overflow: "hidden", marginBottom: 14 }}>
            <span className="fill-x grow" style={{ ["--p" as string]: Math.min(1, day.waterMl / waterTarget), background: "var(--teal)" }} />
          </div>
          <div className="chips">
            {[250, 350, 500, 1000].map((ml) => (
              <button key={ml} className="chip" onClick={() => { const hit = day.waterMl < waterTarget && day.waterMl + ml >= waterTarget; play(hit ? "complete" : "water"); if (hit) setWaterHit(true); setWaterTap((n) => n + 1); patch((d) => { d.waterMl += ml; }); }}>+{ml}</button>
            ))}
            <button className="chip" style={{ color: "var(--red)" }} onClick={() => { play("undo"); patch((d) => { d.waterMl = Math.max(0, d.waterMl - 250); }); }}>-250</button>
          </div>
        </div>
      </Section>

      <div className="tpl-list"><div key={day.type} className="swap">{sections.map(({ key, header, list }) => list.length > 0 && (
        <Section key={key} header={header(list)}>
          {list.map((item) => {
            if (!item.ring) {
              const sub = infoSub(item);
              const game = item.kind === "game", streamEnd = item.kind === "stream"; // stream-end marker: like game-stop
              return (
                <div key={item.id} className="row info" style={{ ["--inset" as string]: "74px" }}>
                  <span className="row-time">{hm(item.min)}</span>
                  <span style={{ width: 26, color: game && item.id !== "game-stop" ? "var(--purple)" : "var(--label3)", display: "grid", placeItems: "center" }}>
                    {game || streamEnd ? <IconGame size={18} /> : item.id === "caf" ? <IconCup size={18} /> : <IconBriefcase size={18} />}
                  </span>
                  {sub ? (
                    <span className="row-main"><div className="row-title">{item.title}</div><div className="row-sub">{sub}</div></span>
                  ) : <span className="row-main row-title">{item.title}</span>}
                </div>
              );
            }
            const done = !!day.done[item.id];
            const overdue = !done && item.min + 30 < nowMin;
            const just = done && popped === item.id; // ticked on this visit: fill, check draw, strike
            return (
              <button
                key={item.id}
                className={`row ${done ? "done" : ""} ${just ? "just" : ""} ${overdue ? "overdue" : ""} ${item.id === next?.id ? "next" : ""}`}
                style={{ ["--inset" as string]: "74px" }}
                aria-pressed={done}
                onClick={() => toggle(item)}
              >
                <span className="row-time">{hm(item.min)}</span>
                <span className={`check ${done ? "on" : ""} ${just ? "pop" : ""}`}>{done && <IconCheck size={16} />}</span>
                <span className="row-main">
                  <div className="row-title"><span className="strike">{item.title}</span>{overdue && <span className="sr-only">เลยเวลา</span>}</div>
                  {(subFor(item) || cueFor(item)) && (
                    <div className="row-sub">
                      {cueFor(item) && <span className="cue">{cueFor(item)}</span>}
                      {cueFor(item) && subFor(item) ? " · " : ""}
                      {subFor(item)}
                    </div>
                  )}
                </span>
              </button>
            );
          })}
        </Section>
      ))}</div></div>

      <Sheet open={sheet === "meal2"} title="มื้อ 2 วันนี้เป็นแบบไหน" onClose={() => setSheet(null)}>
        <Section>
          {(Object.keys(MEAL2_LABEL) as Meal2[]).map((k) => (
            <button key={k} className="row" onClick={() => {
              play("done");
              patch((d) => { d.meal2 = k; if (k !== "C") d.done.meal2 = Date.now(); });
              setSheet(null);
            }}>
              <span className="row-main">
                <div className="row-title">{k}. {MEAL2_LABEL[k]}</div>
                <div className="row-sub">
                  {k === "A" && "ติ๊กว่ากินแล้ว"}
                  {k === "B" && "เพิ่มของว่างชดเชย ~500 kcal ช่วง 23:45"}
                  {k === "C" && "กินข้าว 02:05 แล้วเลื่อนยิมเป็น 03:00"}
                </div>
              </span>
              <Chev />
            </button>
          ))}
        </Section>
      </Sheet>

      <Sheet open={sheet === "sing"} title="ร้องเพลง" onClose={() => setSheet(null)}>
        {singItem?.sub && <p className="confirm-body">{singItem.sub}</p>}
        <div className="section-header">ร้องจริง (ไม่บังคับ)</div>
        <div className="chips" style={{ padding: "0 4px 16px" }}>
          {([10, 20, 30, 45] as const).map((m) => (
            <button key={m} className={`chip ${singMin === m ? "on" : ""}`} aria-pressed={singMin === m} onClick={() => { play("tap"); setSingMin(singMin === m ? null : m); }}>{m} นาที</button>
          ))}
        </div>
        <div className="confirm-actions">
          <button className="btn" onClick={() => {
            setSheet(null);
            if (singItem) tick(singItem, true);
            if (singMin) { const m = singMin; patch((d) => { d.sing = { ...d.sing, min: m }; }); }
            setSingMin(null);
          }}>ร้องแล้ว</button>
          <button className="btn secondary" onClick={() => { setSheet(null); setSingMin(null); restVoice(true); }}>เสียงแหบ/เจ็บ พักเสียงวันนี้</button>
        </div>
        <div className="section-footer" style={{ textAlign: "center", marginTop: 10 }}>เจ็บคอให้หยุดทันที · แหบเกิน 2 สัปดาห์ควรพบแพทย์ หู คอ จมูก</div>
      </Sheet>

      <Sheet open={sheet === "trade"} title="เทรดวันนี้" onClose={() => setSheet(null)}>
        <Section header="จำนวนไม้">
          <div className="row" style={{ gap: 8 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className="chip" style={tr.count === n && tr.result !== "skip" ? { background: "var(--blue)", color: "#fff" } : undefined} onClick={() => { play("tap"); setTr({ ...tr, count: n, result: tr.result === "skip" ? "open" : tr.result }); }}>{n === 5 ? "5+" : n}</button>
            ))}
          </div>
        </Section>
        <Section header="ผล">
          <div className="row"><div style={{ flex: 1 }}><Segmented value={tr.result === "skip" ? "open" : tr.result} options={TRADE_RESULT} onChange={(v) => setTr({ ...tr, result: v })} /></div></div>
          <label className="row form-row">
            <span className="row-title" style={{ width: 70 }}>โน้ต</span>
            <input className="inline-input" placeholder="คู่เงิน / setup / บทเรียน (ไม่บังคับ)" value={tr.note ?? ""} onChange={(e) => setTr({ ...tr, note: e.target.value })} />
          </label>
        </Section>
        <button className="btn" onClick={() => {
          const finishing = doneCount + 1 === tracked.length;
          play(finishing ? "complete" : "done");
          if (finishing) setParty((n) => n + 1);
          patch((d) => { d.trade = { ...tr, result: tr.result === "skip" ? "open" : tr.result, note: tr.note?.trim() || undefined }; d.done.trade = Date.now(); });
          setSheet(null);
          toast(`บันทึกเทรด ${tr.count} ไม้แล้ว`);
        }}>บันทึกว่าเทรดแล้ว</button>
        <button className="btn secondary" style={{ marginTop: 10 }} onClick={() => {
          play("done");
          patch((d) => { d.trade = { count: 0, result: "skip", note: tr.note?.trim() || undefined }; d.done.trade = Date.now(); });
          setSheet(null);
          toast("ไม่มีจังหวะแล้วไม่เข้า คือวินัยที่ดี");
        }}>ดูกราฟแล้ว ไม่มีจังหวะ ไม่เข้า</button>
        <div className="section-footer" style={{ textAlign: "center", marginTop: 10 }}>บันทึกเพื่อดูวินัยของตัวเอง ไม่ใช่คำแนะนำการลงทุน</div>
      </Sheet>

      <Sheet open={sheet === "journal"} title="ทบทวนก่อนนอน" onClose={() => setSheet(null)}>
        <div className="journal-label">วันนี้ทำอะไรได้ดี 1 อย่าง</div>
        <textarea className="journal-field" value={jr.good} onChange={(e) => setJr({ ...jr, good: e.target.value })} placeholder="เช่น เข้ายิมแม้จะเหนื่อย" />
        <div className="journal-label">พรุ่งนี้อยากแก้ 1 อย่าง</div>
        <textarea className="journal-field" value={jr.fix} onChange={(e) => setJr({ ...jr, fix: e.target.value })} placeholder="เช่น ดื่มน้ำให้ถึงเป้าก่อนเลิกงาน" />
        <div className="journal-label">ขอบคุณ 1 อย่าง</div>
        <textarea className="journal-field" value={jr.thanks} onChange={(e) => setJr({ ...jr, thanks: e.target.value })} placeholder="สิ่งเล็กๆ ก็ได้" />
        <button className="btn" onClick={() => {
          play(doneCount + 1 === tracked.length ? "complete" : "done");
          if (doneCount + 1 === tracked.length) setParty((n) => n + 1);
          patch((d) => { d.journal = jr; d.done.night = Date.now(); });
          setSheet(null);
          toast("บันทึกแล้ว นอนหลับฝันดี");
        }}>บันทึกและติ๊กเสร็จ</button>
        <button className="btn secondary" style={{ marginTop: 10 }} onClick={() => { play("done"); patch((d) => { d.done.night = Date.now(); }); setSheet(null); }}>ติ๊กเสร็จโดยไม่เขียน</button>
      </Sheet>

      <Sheet open={sheet === "weigh"} title="น้ำหนักเช้านี้" onClose={() => setSheet(null)}>
        <input className="field num" inputMode="decimal" placeholder="เช่น 67.4" value={kg} onChange={(e) => setKg(e.target.value)} autoFocus style={{ fontSize: 28, textAlign: "center" }} />
        <div style={{ height: 16 }} />
        <button className="btn" onClick={() => {
          const v = parseFloat(kg);
          if (!(v > 30 && v < 250)) return play("error");
          play("done");
          update((x) => setWeight(x, date, v, date));
          setKg("");
          setSheet(null);
        }}>บันทึก</button>
      </Sheet>
      <TemplatePicker open={picker} value={day.type} date={date} onPick={pickPlan} onClose={() => setPicker(false)} />
      {quick && <QuickLog date={date} onClose={() => setQuick(false)} onComplete={() => setParty((n) => n + 1)} />}
      <Confetti fire={party} />
    </main>
  );
}

function Legend({ label, color, v }: { label: string; color: string; v: number }) {
  return (
    <div>
      <div className="legend-label" style={{ color }}>{label}</div>
      <div className="legend-value"><CountUp value={Math.round(v * 100)} /><small>%</small></div>
    </div>
  );
}
