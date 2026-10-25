"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState, type RefObject } from "react";
import { useSearchParams } from "next/navigation";
import { IconBell, IconCalendar, IconGame, IconMoon, IconSound, IconSpark } from "@/components/Icons";
import { CheckIn } from "@/components/CheckIn";
import { useHealthNotice } from "@/components/HealthBanner";
import { MiniTimeline } from "@/components/MiniTimeline";
import { SleepWake } from "@/components/SleepWake";
import { TemplatePicker } from "@/components/TemplatePicker";
import { snoozeWithUndo } from "@/components/reschedule";
import { GlanceStrip, type Glance } from "@/components/today/GlanceStrip";
import { NoticeSlot, type Notice } from "@/components/today/NoticeSlot";
import { NowCard } from "@/components/today/NowCard";
import { Checklist, type ChecklistSection, type FocusReq } from "@/components/today/Checklist";
import { RowActions } from "@/components/today/RowActions";
import { applyWeekPlan, markSleep, setDayTemplate, setDone, setTickTime, setVoiceRest, setWeight, startStreamSeason, stopTaper, taperOffer } from "@/lib/actions";
import { thaiDate } from "@/lib/brain/copy";
import { Chev, Section, Segmented, Sheet, motionOff, toast } from "@/components/ui";
import { THAI_DATE, at, hm, logicalDate, logicalMinutes } from "@/lib/date";
import { GYM_CYCLE, GYM_LABEL, PERSONALITY_CYCLE, PERSONALITY_LABEL, nextInCycle } from "@/lib/rotation";
import { MEAL2_LABEL, blockEnd, canReschedule, itemsFor, resolveTemplate, taperDone, taperShift, type Item, type Meal2 } from "@/lib/schedule";
import { blockColor, currentPhase, liveBlock, phases } from "@/lib/phase";
import { introPreset } from "@/lib/templates";
import { DEFAULT_IDENTITY, badgeCatalog, dayMessage, maybePraise, microStep } from "@/lib/psych";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { isLateNow } from "@/lib/ticks";
import { cancelLateTick, queueLateTick } from "@/components/TickTime";
import { dayFor, plannedType, type TradeLog, type TradeResult } from "@/lib/model";
import { fireConfetti, openQuickLog, parseIntent, type Intent } from "@/lib/intent";
import { nowVariant } from "@/lib/today";

const TRADE_RESULT: [TradeResult, string][] = [["win", "กำไร"], ["loss", "ขาดทุน"], ["be", "เสมอ"], ["open", "ยังถืออยู่"]];

const span = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} ชม.${m % 60 ? ` ${m % 60} น.` : ""}` : `${m} น.`);

// Reads ?do= once per value (Suspense-wrapped per the useSearchParams docs), runs it, then strips it without a navigation.
function IntentReader({ run }: { run: RefObject<(i: Intent) => void> }) {
  const v = parseIntent(useSearchParams().get("do"));
  const seen = useRef<Intent | null>(null);
  useEffect(() => {
    if (!v) { seen.current = null; return; }
    if (seen.current === v) return;
    seen.current = v;
    // Next task: on a cold start Nav and the Toaster (later siblings) attach their listeners after this effect.
    setTimeout(() => run.current(v), 0);
    window.history.replaceState(null, "", "/");
  }, [v, run]);
  return null;
}

function greeting(d: Date) {
  const h = d.getHours();
  if (h >= 5 && h < 12) return "สวัสดีตอนเช้า";
  if (h >= 12 && h < 17) return "สวัสดีตอนบ่าย";
  if (h >= 17 && h < 21) return "สวัสดีตอนเย็น";
  return "สวัสดีตอนดึก";
}

export default function Today() {
  const { s, update, pulled } = useStore();
  const [now, setNow] = useState(() => new Date());
  const [sheet, setSheet] = useState<null | "meal2" | "weigh" | "journal" | "trade" | "sing">(null);
  const [tr, setTr] = useState<TradeLog>({ count: 1, result: "open" });
  const [jr, setJr] = useState({ good: "", fix: "", thanks: "" });
  const [kg, setKg] = useState("");
  const [popped, setPopped] = useState<string | null>(null); // check/strike animation of the last tick
  const [settling, setSettling] = useState<ReadonlySet<string>>(() => new Set()); // ticked on this visit, not yet in "ทำแล้ว"
  const [openDone, setOpenDone] = useState<ReadonlySet<string>>(() => new Set());
  const [act, setAct] = useState<Item | null>(null); // row menu (RowActions / MoveSheet)
  const [focusReq, setFocusReq] = useState<FocusReq | null>(null);
  const settleT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const listDown = useRef(false);
  const settlingRef = useRef(settling);
  const [won, setWon] = useState(false); // the day was completed on this visit: the end card bounces
  const [picker, setPicker] = useState(false);
  const [glance, setGlance] = useState<Glance>(null);
  const [singMin, setSingMin] = useState<10 | 20 | 30 | 45 | null>(null); // optional "sang for N min" chip

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    // iOS pauses the interval in the background: jump straight to the current time on resume (nothing replays).
    const onVis = () => { if (!document.hidden) setNow(new Date()); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  useEffect(() => { settlingRef.current = settling; });
  useEffect(() => () => clearTimeout(settleT.current), []);

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

  const doneCount = tracked.filter((i) => day.done[i.id]).length;
  const pending = tracked.filter((i) => !day.done[i.id]);
  const sleepItem = items.find((i) => i.kind === "sleep");
  const dayOver = !!sleepItem && nowMin >= sleepItem.min + 60;
  const next = dayOver ? undefined : pending.find((i) => i.min >= nowMin - 30) ?? pending[0];
  const [firstNext] = useState(next?.id); // Now card next item on mount: slide only when it changes

  const dnd = s.settings.dndUntil > now.getTime();
  const wakeMin = items.find((i) => i.id === "weigh")?.min ?? items[0]?.min ?? 0;
  const showCheckin = !day.checkin && (!!day.wakeAt || nowMin >= wakeMin) && nowMin < wakeMin + 6 * 60;
  const msg = dayMessage(s, date);
  const health = useHealthNotice();

  // Now card + ambient tone: a running live/game block wins over the phase (same colours as the accessory).
  const cp = currentPhase(s, day, nowMin, date);
  const live = liveBlock(items, nowMin);
  const tone = live ? blockColor(live.kind) : cp.phase.color;
  const progress = live ? (nowMin - live.item.min) / Math.max(1, live.end - live.item.min) : cp.progress;
  const left = live ? live.end - nowMin : cp.left;
  const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const variant = nowVariant({ phaseKey: cp.phase.key, live: !!live, hasNext: !!next, pending: pending.length });

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

  const celebrate = () => { fireConfetti(); setWon(true); }; // app-wide confetti (Nav) + the end card bounce

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
        celebrate();
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

  // Settle (spec 8.6): rows ticked on this visit stay in place and leave for "ทำแล้ว" together, 1200 ms after the
  // last tick, never while a pointer is down in the list. Focus inside a leaving row moves to the next pending row.
  function flush() {
    if (listDown.current) { settleT.current = setTimeout(flush, 400); return; }
    const id = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>(".tpl-list .swipe[data-id]")?.dataset.id;
    if (id && settlingRef.current.has(id)) setFocusReq((p) => ({ id, pendingOnly: true, n: (p?.n ?? 0) + 1 }));
    setSettling(new Set());
  }
  function settle(id: string) {
    setSettling((p) => new Set(p).add(id));
    clearTimeout(settleT.current);
    settleT.current = setTimeout(flush, motionOff() ? 0 : 1200);
  }

  // A pointer down in the list holds the flush; a release anywhere (even outside the list) ends it.
  function onListPointer(down: boolean) {
    listDown.current = down;
    if (!down) return;
    const off = () => { listDown.current = false; window.removeEventListener("pointerup", off, true); window.removeEventListener("pointercancel", off, true); };
    window.addEventListener("pointerup", off, true);
    window.addEventListener("pointercancel", off, true);
  }

  function toggle(item: Item, opts?: { undo?: boolean }) {
    if (day.done[item.id]) return untick(item);
    if (item.id === "meal2" && def.work && !day.done.meal2 && !day.meal2) return setSheet("meal2");
    if (item.kind === "weigh" && !day.done.weigh) return setSheet("weigh");
    if (item.kind === "trade" && !day.done[item.id]) { setTr(day.trade ?? { count: 1, result: "open" }); return setSheet("trade"); }
    if (item.id === "night" && !day.done.night) { setJr(day.journal ?? { good: "", fix: "", thanks: "" }); return setSheet("journal"); }
    if (item.kind === "sing" && !day.done[item.id]) return setSheet("sing");
    tick(item, true, opts);
  }

  // Untick with Undo (spec 8.8): the undo restores the tick time, its late-tick source and today's workout code.
  function untick(item: Item) {
    const prevTs = day.done[item.id];
    if (!prevTs) return;
    const ds = day.doneSrc?.[item.id];
    const prevSrc = ds && ds.ts === prevTs ? ds.src : null;
    const prevCode = gymToday;
    // The row moves from the done list to the pending area and remounts: keep keyboard/VoiceOver focus on it.
    if (document.activeElement?.closest(`.swipe[data-id="${CSS.escape(item.id)}"]`)) setFocusReq((p) => ({ id: item.id, pendingOnly: false, n: (p?.n ?? 0) + 1 }));
    tick(item, false);
    toast(`ยกเลิกติ๊ก "${item.title}"`, { action: "เลิกทำ", onAction: () => update((x) => {
      if (item.kind === "sleep") markSleep(x, date, true, prevTs);
      else setDone(x, date, item, true, prevCode, { at: prevTs, src: prevSrc });
    }) });
  }

  // A tick > 60 min after its planned time (not sleep/weigh): ask when it was really done (one ask per burst).
  const isLate = (item: Item) => isLateNow(date, item);
  const askTime = (item: Item) => queueLateTick({ date, item, apply: (ts, src) => update((x) => setTickTime(x, date, item.id, ts, src)) });

  // Sheet saves that tick an item: through setDone with the real item (old direct patch only if it is missing).
  function finish(id: string, extra?: (d: typeof day) => void) {
    const it = items.find((i) => i.id === id);
    update((x) => {
      if (it) setDone(x, date, it, true);
      const d = dayFor(x, date);
      if (!it) d.done[id] = Date.now();
      extra?.(d);
      x.days[date] = d;
    });
    settle(id);
    if (it && isLate(it)) askTime(it);
  }

  // opts.undo (Now card check, swipes): the ring / praise text, or "ติ๊กแล้ว", becomes one toast with เลิกทำ.
  function tick(item: Item, on: boolean, opts: { undo?: boolean } = {}) {
    const late = on && isLate(item);
    const finishing = on && doneCount + 1 === tracked.length;
    const code = item.id === "cardio" ? gymToday ?? "R" : gymToday ?? gymNext;
    play(!on ? "undo" : finishing ? "complete" : "done");
    if (on) { setPopped(item.id); settle(item.id); }
    if (finishing) celebrate();
    let msg: string | null = null;
    if (on && !finishing) {
      const ringLeft = tracked.filter((i) => i.ring === item.ring && i.id !== item.id && !day.done[i.id]).length;
      const ringName = { food: "กิน", body: "ร่างกาย", habit: "นิสัย" }[item.ring ?? "habit"];
      const praise = maybePraise(((doneCount * 7 + item.min) % 100) / 100); // deterministic "random" keeps render pure
      if (ringLeft === 0) msg = `ปิดวง${ringName}ครบแล้ว`;
      else if (praise && !late) msg = praise; // a late tick gets the time ask instead
    }
    if (on && opts.undo) {
      // The toast action already plays "undo".
      toast(msg ?? `ติ๊กแล้ว: ${item.title}`, { action: "เลิกทำ", onAction: () => { update((x) => setDone(x, date, item, false, code)); cancelLateTick(date, item.id); } });
    } else if (msg) toast(msg);
    update((x) => setDone(x, date, item, on, code));
    if (late) askTime(item);
    if (!on) cancelLateTick(date, item.id);
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

  // DND and voice rest notices: switching off is one tap with Undo.
  function resumeNotify() {
    const prev = s.settings.dndUntil;
    play("toggle");
    update((x) => { x.settings.dndUntil = 0; });
    toast("เปิดการแจ้งเตือนแล้ว", { action: "เลิกทำ", onAction: () => update((x) => { x.settings.dndUntil = prev; }) });
  }
  function unrestVoice() {
    play("toggle");
    update((x) => setVoiceRest(x, date, false));
    toast("เลิกพักเสียงแล้ว รายการร้องเพลงกลับมา", { action: "เลิกทำ", onAction: () => update((x) => setVoiceRest(x, date, true)) });
  }

  // One notice slot (spec 8.3); NoticeSlot orders them and keeps at most 2 pills.
  const notices: Notice[] = [];
  if (health) notices.push({
    key: "health", tone: "warn", status: true, text: health.text, icon: <IconBell size={18} />, onDismiss: health.dismiss,
    act: health.act ? { label: health.act, href: health.href, onAct: health.retry } : undefined,
  });
  if (streamCard) notices.push({
    key: "stream", tone: "accent", text: "ช่วงไลฟ์ยาวก่อนเปิดเทอม · แตะเพื่อดูและเลือก", icon: <IconGame size={18} />,
    sheet: { title: "ช่วงไลฟ์ยาวก่อนเปิดเทอม", body: (close) => (
      <div className="notice-sheet">
        <div className="sw-sub">ไลฟ์ทุกวันอย่างน้อย 5 ชม. (19:00-00:30 · เสาร์มาราธอน 15:00-00:30) · นอน 01:30 ตื่น 09:30 · ยก 4 วัน · เทรด London 15:00 วันธรรมดา · แอปจะตั้งแผนสัปดาห์และสถานะงานกะเป็น &apos;ไม่ได้ทำแล้ว&apos; (เปลี่ยนได้ที่ ตั้งค่า &gt; สมอง Krob) เลิกทำได้</div>
        {streamNotes.map((n) => <div key={n} className="sw-sub">{n}</div>)}
        <div className="sw-actions">
          {streamOffer && <button className="chip chip--fill" onClick={() => { close(); answerStream("taper"); }}>ค่อยๆ เลื่อน (แนะนำ)</button>}
          <button className={`chip ${streamOffer ? "" : "chip--fill"}`} onClick={() => { close(); answerStream("now"); }}>เริ่มเลย</button>
          <button className="chip" onClick={() => { close(); answerStream(null); }}>ไว้ทีหลัง</button>
        </div>
        {streamOffer && <div className="sw-sub">เริ่มเลย: คืนแรกจะนอนได้สั้นถ้าเข้านอนตามเวลาเดิม</div>}
      </div>
    ) },
  });
  if (pulled && s.settings.streamAsked && !s.settings.planAsked) notices.push({
    key: "intro", tone: "accent", text: "ใหม่: เลือกแผนแต่ละวันได้แล้ว", icon: <IconCalendar size={18} />,
    sheet: { title: "ใหม่: เลือกแผนแต่ละวันได้แล้ว", body: (close) => (
      <div className="notice-sheet">
        <div className="sw-sub">ตอนนี้ยังทำงานกะดึก 16:00-02:00 อยู่ไหม แอปจะจัดแผนสัปดาห์ให้ เปลี่ยนได้ทุกเมื่อ ตารางเดิมยังอยู่</div>
        <div className="sw-actions">
          <button className="chip chip--fill" onClick={() => { close(); answerIntro(true); }}>ยังทำงานอยู่</button>
          <button className="chip chip--fill" onClick={() => { close(); answerIntro(false); }}>ไม่ได้ทำแล้ว</button>
          <button className="chip" onClick={() => { close(); answerIntro(null); }}>ไว้ทีหลัง</button>
        </div>
      </div>
    ) },
  });
  if (dnd) notices.push({
    key: "dnd", tone: "neutral", icon: <IconMoon size={18} />, act: { label: "เปิดต่อ", onAct: resumeNotify },
    text: `พักการแจ้งเตือนถึง ${new Date(s.settings.dndUntil).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`,
  });
  if (day.voiceRest) notices.push({ key: "voice", tone: "neutral", icon: <IconSound size={18} />, text: "พักเสียงวันนี้ (ซ่อนรายการร้องเพลง)", act: { label: "ยกเลิก", onAct: unrestVoice } });
  if (msg) notices.push({ key: "daymsg", tone: "accent", icon: <IconSpark size={18} />, text: msg });

  // List sections: the v1.0 three-way split for templates without phases, else one section per phase (sleep excluded).
  // Each phase takes items from its start to the next start; the first also takes anything earlier, the last anything later.
  // Skipped ("ข้ามวันนี้") items are placed by time into the same sections, inside the done group.
  const sections: ChecklistSection[] = [];
  const skippedAll = day.skip ? itemsFor(s.schedule, { ...day, skip: undefined }, date).filter((i) => day.skip?.[i.id] && canReschedule(i)) : [];
  const ringCount = (list: Item[]) => `${list.filter((i) => i.ring && day.done[i.id]).length}/${list.filter((i) => i.ring).length}`;
  const addSec = (key: string, has: (i: Item) => boolean, header: (l: Item[]) => string) => {
    const list = items.filter(has);
    sections.push({ key, header: header(list), list, skipped: skippedAll.filter(has) });
  };
  if (!def.phases) {
    const split: [string, (i: Item) => boolean][] = [
      ["ก่อนเข้างาน", (i) => i.min < at(16)],
      [def.work ? "ระหว่างงาน" : "ช่วงเย็น", (i) => i.min >= at(16) && i.min < at(2)],
      [def.work ? "หลังเลิกงาน" : "ก่อนนอน", (i) => i.min >= at(2)],
    ];
    for (const [title, has] of split) addSec(title, has, (l) => `${title} · ${ringCount(l)}`);
  } else {
    const ps = phases(s, day, date).filter((p) => p.key !== "sleep");
    ps.forEach((p, k) => addSec(p.key, (i) => (k === 0 || i.min >= p.start) && (k === ps.length - 1 || i.min < p.end),
      (l) => `${p.label} · ${hm(p.start)}-${hm(p.end)}${l.some((i) => i.ring) ? ` · ${ringCount(l)}` : ""}`));
  }

  // "Open live checklist": the section holding the stream item (else the running game block), expanded if it is done.
  function goLive() {
    const it = items.find((i) => i.id === "stream") ?? (live?.kind === "game" ? live.item : undefined);
    const sec = it && sections.find((x) => x.list.some((i) => i.id === it.id));
    if (!it || !sec) { toast("วันนี้ไม่มีช่วงไลฟ์"); return; }
    if (day.done[it.id] && !settling.has(it.id)) setOpenDone((p) => new Set(p).add(sec.key));
    // Two frames: the expand has committed before the scroll measures.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.getElementById(`sec-${sec.key}`);
      if (!el) return;
      el.scrollIntoView({ block: "start", behavior: motionOff() ? "auto" : "smooth" });
      el.classList.add("flash");
      setTimeout(() => el.classList.remove("flash"), 1200);
    }));
  }
  // Today deep links (?do=, "+" quick actions, accessory). Kept in a ref so the listener always sees fresh state.
  function onIntent(i: Intent) {
    if (i === "water") setGlance("water");
    else if (i === "weigh") setSheet("weigh");
    else if (i === "trade") {
      if (!items.some((x) => x.kind === "trade")) { toast("วันนี้ไม่มีรายการเทรด"); return; }
      setTr(day.trade ?? { count: 1, result: "open" });
      setSheet("trade");
    } else if (i === "live") goLive();
    else openQuickLog();
  }
  const intentRef = useRef(onIntent);
  useEffect(() => { intentRef.current = onIntent; });
  useEffect(() => {
    const on = (e: Event) => intentRef.current((e as CustomEvent<Intent>).detail);
    window.addEventListener("krob-intent", on);
    return () => window.removeEventListener("krob-intent", on);
  }, []);

  // Row menu close: focus goes back to that row (or the next pending one / the done toggle when it left).
  const closeAct = () => { if (act) setFocusReq((p) => ({ id: act.id, pendingOnly: false, n: (p?.n ?? 0) + 1 })); setAct(null); };

  return (
    <main className="screen today" style={{ ["--phase" as string]: tone }}>
      <div className="topbar">
        <div>
          <div className="eyebrow">{THAI_DATE(date)}</div>
          <h1 className="large-title">{greeting(now)}{s.profile.name ? ` ${s.profile.name}` : ""}</h1>
        </div>
        <Link href="/settings" className="avatar" aria-label="ตั้งค่า">{(s.profile.name || "K").slice(0, 1).toUpperCase()}</Link>
      </div>
      <div className="identity"><span>เป้าหมายตัวตน:</span><b>{s.profile.identity || DEFAULT_IDENTITY}</b></div>

      <NoticeSlot notices={notices} />

      <NowCard
        tone={tone} phase={cp.phase} progress={progress} left={left} clock={clock} nowMin={nowMin} variant={variant} live={live}
        next={next} nextSub={next ? subFor(next) : undefined} nextCue={next ? cueFor(next) : null}
        micro={next && next.min + 15 < nowMin ? microStep(next) : null} firstNextId={firstNext}
        doneCount={doneCount} total={tracked.length} pendingCount={pending.length} won={won}
        onCheck={() => { if (next) toggle(next, { undo: true }); }}
        onLater={next ? () => snoozeWithUndo(update, date, next, nowMin) : undefined}
      />

      <div className="sw-slot"><SleepWake date={date} now={now} /></div>

      {showCheckin && (
        <CheckIn
          onSkip={() => patch((d) => { d.checkin = { mood: 0, energy: 0, sleep: 0 }; })}
          onSave={(v) => { patch((d) => { d.checkin = { ...v, at: Date.now() }; }); toast(v.energy <= 2 ? "พลังงานต่ำวันนี้ เริ่มจากข้อเล็กๆ ก่อนก็พอ" : "บันทึกแล้ว ขอให้เป็นวันที่ดี"); }}
        />
      )}

      <GlanceStrip date={date} glance={glance} setGlance={setGlance} />

      <button className="card plan-row" onClick={() => setPicker(true)}>
        <span key={day.type} className="plan-row-body swap">
          <span className="plan-row-top">
            <span className="tpl-dot" style={{ ["--tone" as string]: def.color }} />
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
      <Checklist
        sections={sections} swapKey={day.type} day={day} date={date} nowMin={nowMin} nextId={next?.id} popped={popped}
        settling={settling} openDone={openDone}
        onToggleDone={(k) => setOpenDone((p) => { const n = new Set(p); if (!n.delete(k)) n.add(k); return n; })}
        onTick={toggle} onUntick={untick} onRowActions={(i) => setAct(i)} focusReq={focusReq}
        onPointer={onListPointer} subFor={subFor} cueFor={cueFor} infoSub={infoSub}
      />

      <Sheet open={sheet === "meal2"} title="มื้อ 2 วันนี้เป็นแบบไหน" detent="medium" onClose={() => setSheet(null)}>
        <Section>
          {(Object.keys(MEAL2_LABEL) as Meal2[]).map((k) => (
            <button key={k} className="row" onClick={() => {
              play("done");
              if (k !== "C") finish("meal2", (d) => { d.meal2 = k; });
              else patch((d) => { d.meal2 = k; });
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

      <Sheet open={sheet === "sing"} title="ร้องเพลง" detent="medium" onClose={() => setSheet(null)}>
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
              <button key={n} className={`chip ${tr.count === n && tr.result !== "skip" ? "on" : ""}`} aria-pressed={tr.count === n && tr.result !== "skip"} onClick={() => { play("tap"); setTr({ ...tr, count: n, result: tr.result === "skip" ? "open" : tr.result }); }}>{n === 5 ? "5+" : n}</button>
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
          if (finishing) celebrate();
          finish("trade", (d) => { d.trade = { ...tr, result: tr.result === "skip" ? "open" : tr.result, note: tr.note?.trim() || undefined }; });
          setSheet(null);
          toast(`บันทึกเทรด ${tr.count} ไม้แล้ว`);
        }}>บันทึกว่าเทรดแล้ว</button>
        <button className="btn secondary" style={{ marginTop: 10 }} onClick={() => {
          play("done");
          finish("trade", (d) => { d.trade = { count: 0, result: "skip", note: tr.note?.trim() || undefined }; });
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
          if (doneCount + 1 === tracked.length) celebrate();
          finish("night", (d) => { d.journal = jr; });
          setSheet(null);
          toast("บันทึกแล้ว นอนหลับฝันดี");
        }}>บันทึกและติ๊กเสร็จ</button>
        <button className="btn secondary" style={{ marginTop: 10 }} onClick={() => { play("done"); finish("night"); setSheet(null); }}>ติ๊กเสร็จโดยไม่เขียน</button>
      </Sheet>

      <Sheet open={sheet === "weigh"} title="น้ำหนักเช้านี้" detent="medium" onClose={() => setSheet(null)}>
        <input className="field num fs-title1" inputMode="decimal" placeholder="เช่น 67.4" value={kg} onChange={(e) => setKg(e.target.value)} autoFocus style={{ textAlign: "center" }} />
        <div style={{ height: 16 }} />
        <button className="btn" onClick={() => {
          const v = parseFloat(kg);
          if (!(v > 30 && v < 250)) return play("error");
          play("done");
          const fresh = !day.done.weigh && items.some((i) => i.id === "weigh");
          update((x) => setWeight(x, date, v, date));
          if (fresh) { setPopped("weigh"); settle("weigh"); }
          setKg("");
          setSheet(null);
        }}>บันทึก</button>
      </Sheet>
      <RowActions item={act} date={date} nowMin={nowMin} onClose={closeAct} onTick={(i) => toggle(i, { undo: true })} onUntick={untick} />
      <TemplatePicker open={picker} value={day.type} date={date} onPick={pickPlan} onClose={() => setPicker(false)} />
      <Suspense fallback={null}><IntentReader run={intentRef} /></Suspense>
    </main>
  );
}
