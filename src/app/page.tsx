"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState, type RefObject } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { CareSheet, routineOf, skipRoutineWithUndo } from "@/components/care/CareSheet";
import { useCareNotices } from "@/components/care/CareNotices";
import { RoutineEditor } from "@/components/care/RoutineEditor";
import { TasksSheet } from "@/components/care/TasksSheet";
import { careSub, completeRoutine, restoreCare, rowState, snapCare, untickRoutine } from "@/lib/care/progress";
import { PlanSheet } from "@/components/rituals/PlanSheet";
import { ShutdownSheet } from "@/components/rituals/ShutdownSheet";
import { TradeSheet } from "@/components/TradeSheet";
import { ritualNow } from "@/lib/rituals";
import { tradeSub } from "@/lib/trade";
import { applyWeekPlan, markSleep, setDayTemplate, setDone, setTickTime, setVoiceRest, setWeight, startStreamSeason, stopTaper, taperOffer } from "@/lib/actions";
import { thaiDate } from "@/lib/brain/copy";
import { AppBar, Chev, Section, Sheet, motionOff, toast } from "@/components/ui";
import { TabPage } from "@/components/TabPage";
import { THAI_DATE, addDays, at, hm, logicalDate, logicalMinutes } from "@/lib/date";
import { GYM_CYCLE, GYM_LABEL, PERSONALITY_CYCLE, PERSONALITY_LABEL, nextInCycle } from "@/lib/rotation";
import { MEAL2_LABEL, blockEnd, canReschedule, itemsFor, resolveTemplate, taperDone, taperShift, type Item, type Meal2 } from "@/lib/schedule";
import { blockColor, currentPhase, liveBlock, phases } from "@/lib/phase";
import { introPreset } from "@/lib/templates";
import { badgeCatalog, defaultIdentity, dayMessage, maybePraise, microStep } from "@/lib/psych";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { isLateNow } from "@/lib/ticks";
import { cancelLateTick, queueLateTick } from "@/components/TickTime";
import { dayFor, plannedType, type TradeLog } from "@/lib/model";
import { fireConfetti, openLive, openQuickLog, parseIntent, parseRoutineParam, type Intent } from "@/lib/intent";
import { nowVariant } from "@/lib/today";
import { runProgress } from "@/lib/gymlog";
import { classNow } from "@/lib/term";
import { useTermNotice } from "@/components/term/TermNotice";
import { fmt, msgs } from "@/i18n";
import { useLang } from "@/i18n/react";
import { routineName } from "@/i18n/stored";
import * as A from "@/i18n/msg/app";
import * as Common from "@/i18n/msg/common";

const m = msgs(A), c = msgs(Common);
const span = (min: number) => fmt.dur(min);

// Reads ?do= (and &r= for care) once per value (Suspense-wrapped per the useSearchParams docs), runs it, then strips it
// without a navigation. useSearchParams re-renders on every search change, so a push tap while Today is open (router.push
// from the shell's krob-open listener) runs too.
function IntentReader({ run }: { run: RefObject<(i: Intent, r: string | null) => void> }) {
  const q = useSearchParams();
  const v = parseIntent(q.get("do")), r = parseRoutineParam(q.get("r"));
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (!v) { seen.current = null; return; }
    const k = `${v}|${r ?? ""}`;
    if (seen.current === k) return;
    seen.current = k;
    // Next task: on a cold start Nav and the Toaster (later siblings) attach their listeners after this effect.
    setTimeout(() => run.current(v, r), 0);
    window.history.replaceState(null, "", "/");
  }, [v, r, run]);
  return null;
}

function greeting(d: Date) {
  const h = d.getHours();
  if (h >= 5 && h < 12) return m("today.greet.morning");
  if (h >= 12 && h < 17) return m("today.greet.afternoon");
  if (h >= 17 && h < 21) return m("today.greet.evening");
  return m("today.greet.night");
}

export default function Today() {
  const { s, update, pulled } = useStore();
  useLang(); // re-render on a language switch (text is built during render)
  const router = useRouter();
  const [now, setNow] = useState(() => new Date());
  const [sheet, setSheet] = useState<null | "meal2" | "weigh" | "journal" | "trade" | "sing">(null);
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
  const [careRid, setCareRid] = useState<string | null>(null); // v1.7 CareSheet routine
  const [editor, setEditor] = useState<{ rid: string; sid?: string } | null>(null); // RoutineEditor
  const [tasksOpen, setTasksOpen] = useState(false);
  const [ritual, setRitual] = useState<"plan" | "shut" | null>(null); // v1.7 morning plan / evening shutdown sheets

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
  const careNotices = useCareNotices(date, pulled);
  const termNotice = useTermNotice(date, pulled, now.getTime());
  const prevDay = s.days[addDays(date, -1)];

  // Now card + ambient tone: a running live/game block wins over the phase (same colours as the accessory).
  const cp = currentPhase(s, day, nowMin, date);
  const live = liveBlock(items, nowMin);
  const cls = live ? null : classNow(items, nowMin); // v1.8 term day: a running class beats the phase (not a live block)
  const run = live ?? cls;
  const tone = live ? blockColor(live.kind) : cls ? "var(--info)" : cp.phase.color;
  const progress = run ? (nowMin - run.item.min) / Math.max(1, run.end - run.item.min) : cp.progress;
  const left = run ? run.end - nowMin : cp.left;
  const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const variant = nowVariant({ phaseKey: cp.phase.key, live: !!live, hasNext: !!next, pending: pending.length });
  const rit = ritualNow(s, date, nowMin);
  // Now card mode shortcut, highest first: Live mode (a run or a live block) > gym sets (G4) > plan / shutdown (G5).
  const nowAction = s.run ? { label: s.run.k === "live" ? m("today.now.liveMode") : m("today.now.singTimer"), onTap: () => openLive(s.run!.k) }
    : live?.kind === "live" ? { label: m("today.now.startLive"), onTap: () => openLive("live") }
    : s.gym.run ? { label: m("today.now.openSets"), onTap: () => { play("nav"); router.push("/gym"); } }
    : next?.id === "gym" ? { label: m("today.now.startSets"), onTap: () => { play("nav"); router.push("/gym?start=1"); } }
    : rit === "plan" ? { label: m("today.now.plan"), onTap: () => { play("open"); setRitual("plan"); } }
    : rit === "shut" ? { label: m("today.now.shut"), onTap: () => { play("open"); setRitual("shut"); } } : undefined;

  // v1.4 stream season card (one-time) and its notes. Season wake/sleep are 09:30/01:30 plus the global shift.
  const seasonWake = hm(570 + s.schedule.shiftMin), seasonSleep = hm(1530 + s.schedule.shiftMin);
  const streamCard = pulled && !s.settings.streamAsked;
  const streamOffer = streamCard ? taperOffer(s, date) : null;
  const streamNotes: string[] = [];
  if (streamCard) {
    const sh = s.schedule.shiftMin;
    if (streamOffer) streamNotes.push(m("today.stream.taperNote", { start: thaiDate(streamOffer.start), wake: hm(streamOffer.firstWake), target: seasonWake, end: thaiDate(streamOffer.doneDate) }));
    if (s.days[date]) streamNotes.push(m("today.stream.keptToday"));
    if (sh < -60) streamNotes.push(m("today.stream.shiftBig", { n: sh }));
    else if (sh) streamNotes.push(m("today.stream.shift", { sign: sh > 0 ? "+" : "", n: sh }));
    const outside = s.schedule.custom.filter((c) => c.days === "both" && (c.min + sh < 570 || c.min + sh > 1530));
    if (outside.length) streamNotes.push(m("today.stream.outside", { items: outside.map((x) => x.title).join(", ") }));
    if (s.schedule.custom.some((c) => c.days === "off")) streamNotes.push(m("today.stream.offItems"));
  }

  // Sleep taper note: before it starts, or while today (a season day) is still shifted. Times come from the built days.
  const tp = s.schedule.taper;
  const tpNow = def.season === "stream" ? taperShift(tp, date) : 0;
  const taperStopped = !!tp?.stop;
  let taperNote: string | null = null;
  if (tp && !tp.stop && date < tp.start) {
    const w = itemsFor(s.schedule, dayFor(s, tp.start), tp.start).find((i) => i.id === "weigh");
    taperNote = m("today.taper.start", { date: thaiDate(tp.start), wake: w ? m("today.taper.wake", { time: hm(w.min) }) : "" });
  } else if (tp && tpNow > 0 && taperStopped) {
    taperNote = m("today.taper.stopped", { wake: hm(wakeMin), sleep: sleepItem ? m("today.taper.sleep", { time: hm(sleepItem.min) }) : "", from: seasonWake, to: seasonSleep });
  } else if (tp && tpNow > 0) {
    taperNote = m("today.taper.now", { wake: hm(wakeMin), sleep: sleepItem ? m("today.taper.sleep", { time: hm(sleepItem.min) }) : "", target: seasonWake, date: thaiDate(taperDone(tp)) });
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
        toast(m("today.toast.badge", { list: fresh.map((b) => b.title).join(", ") }));
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
    // v1.7 routine rows: the Now card / swipe completes every required step; a plain tap opens the CareSheet.
    if (item.routine) { if (opts?.undo) completeCare(item, item.routine); else setCareRid(item.routine); return; }
    if (item.id === "meal2" && def.work && !day.done.meal2 && !day.meal2) return setSheet("meal2");
    if (item.kind === "weigh" && !day.done.weigh) return setSheet("weigh");
    if (item.kind === "trade" && !day.done[item.id]) return setSheet("trade");
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
    if (item.routine) {
      // Removes the required step ticks with the row; the undo restores both exactly.
      const rid = item.routine, snap = snapCare(s, date, rid);
      play("undo");
      update((x) => untickRoutine(x, date, rid));
      cancelLateTick(date, item.id);
      toast(m("today.toast.untick", { title: item.title }), { action: c("undo"), onAction: () => update((x) => restoreCare(x, date, rid, snap)) });
      return;
    }
    tick(item, false);
    toast(m("today.toast.untick", { title: item.title }), { action: c("undo"), onAction: () => update((x) => {
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
      const ringName = { food: m("today.ring.food"), body: m("today.ring.body"), habit: m("today.ring.habit") }[item.ring ?? "habit"];
      const praise = maybePraise(((doneCount * 7 + item.min) % 100) / 100); // deterministic "random" keeps render pure
      if (ringLeft === 0) msg = m("today.toast.ringClosed", { ring: ringName });
      else if (praise && !late) msg = praise; // a late tick gets the time ask instead
    }
    // v1.7: ticking the stream row stays a plain tick; its toast offers Live mode (never opened automatically).
    const liveAct = on && item.id === "stream" ? { actions: [{ label: m("today.now.liveMode"), onAction: () => openLive("live") }] } : {};
    if (on && opts.undo) {
      // The toast action already plays "undo".
      toast(msg ?? m("today.toast.ticked", { title: item.title }), { ...liveAct, action: c("undo"), onAction: () => { update((x) => setDone(x, date, item, false, code)); cancelLateTick(date, item.id); } });
    } else if (msg || "actions" in liveAct) toast(msg ?? m("today.toast.ticked", { title: item.title }), liveAct);
    update((x) => setDone(x, date, item, on, code));
    if (late) askTime(item);
    if (!on) cancelLateTick(date, item.id);
  }

  // "เสร็จหมด" of a routine (Now card, swipe, CareSheet): every required due step plus the row, one undo for all.
  function completeCare(item: Item | undefined, rid: string) {
    const snap = snapCare(s, date, rid);
    const fresh = !!item && !day.done[item.id];
    const finishing = fresh && doneCount + 1 === tracked.length;
    const late = fresh && isLate(item!);
    play(finishing ? "complete" : "done");
    if (item && fresh) { setPopped(item.id); settle(item.id); }
    if (finishing) celebrate();
    update((x) => completeRoutine(x, date, rid));
    const rn = routineOf(s, rid)?.name;
    toast(m("today.toast.routineDone", { name: rn !== undefined ? routineName(rn) : item?.title ?? "" }), { action: c("undo"), onAction: () => { update((x) => restoreCare(x, date, rid, snap)); if (item) cancelLateTick(date, item.id); } });
    if (late) askTime(item!);
  }
  // While the night row hosts "ก่อนนอน", its journal step opens the evening shutdown sheet (the single journal surface).
  function openJournal() { setRitual("shut"); }

  // Trade sheet saves: the first log ticks the row (finish: settle + late ask); later edits only patch. One undo for both.
  function logTrade(t: TradeLog, msg: string) {
    const it = items.find((i) => i.kind === "trade");
    const id = it?.id ?? "trade";
    const prev = day.trade, was = !!day.done[id];
    if (!was) {
      const finishing = doneCount + 1 === tracked.length;
      play(finishing ? "complete" : "done");
      if (finishing) celebrate();
      finish(id, (d) => { d.trade = t; });
    } else { play("done"); patch((d) => { d.trade = t; }); }
    toast(msg, { action: c("undo"), onAction: () => {
      update((x) => {
        const d = dayFor(x, date);
        if (prev) d.trade = prev; else delete d.trade;
        x.days[date] = d;
        if (!was && it) setDone(x, date, it, false);
      });
      if (!was) cancelLateTick(date, id);
    } });
  }

  // Switch today's plan; ticks stay because the core ids are shared. Undo restores the previous plan.
  function pickPlan(id: string | null) {
    if (!id || id === day.type) return;
    const prev = day.type;
    play("toggle");
    update((x) => setDayTemplate(x, date, id));
    toast(m("today.toast.plan", { name: resolveTemplate(s.schedule, id).def.name, kept: Object.keys(day.done).length ? m("today.toast.planTicksKept") : "" }), {
      action: c("undo"), onAction: () => update((x) => setDayTemplate(x, date, prev)),
    });
  }

  // strain: the hoarse/sore button also logs a strain chip (brain voice signal); undo removes both.
  function restVoice(strain = false) {
    play("toggle");
    update((x) => { setVoiceRest(x, date, true); if (strain) x.days[date].sing = { ...x.days[date].sing, strain: true }; });
    toast(m("today.toast.voiceRest"), { action: c("undo"), onAction: () => update((x) => {
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
    toast(m("today.toast.weekSet", { kept: s.days[date] ? m("today.toast.weekSetKept") : "" }), {
      action: c("undo"), onAction: () => update((x) => { x.settings.weekPlan = prev; x.settings.planAsked = false; x.settings.job = prevJob; }),
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
    toast(m("today.toast.streamStarted", {
      wake: o ? m("today.toast.streamWake", { day: o.start === date ? m("today.when.today") : m("today.when.tomorrow"), time: hm(o.firstWake) }) : "",
      kept: s.days[date] ? m("today.toast.streamKept") : "",
    }), {
      action: c("undo"), onAction: () => update((x) => {
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
    toast(m("today.toast.taperStopped", { from: seasonWake, to: seasonSleep, when: s.days[date] ? m("today.when.tomorrow") : m("today.when.today") }), { action: c("undo"), onAction: () => update((x) => { x.schedule.taper = prev; }) });
  }

  function subFor(item: Item) {
    if (item.routine) { const r = routineOf(s, item.routine); if (r) return careSub(rowState(r, day, date, prevDay), item.sub); }
    if (item.id === "stream") {
      const end = blockEnd(items, item) ?? item.min;
      return `${hm(item.min)}-${hm(end)} · ${span(end - item.min)}${item.sub ? ` · ${item.sub}` : ""}`;
    }
    if (item.id === "gym") {
      const rp = s.gym.run?.d === date ? runProgress(s) : null;
      if (rp) return m("today.sub.gymRun", { code: rp.code, done: rp.done, total: rp.total });
      const code = gymToday ?? gymNext;
      const dl = s.brain.deload;
      const deload = dl && dl.from <= date && date <= dl.to ? (dl.from === dl.to ? m("today.sub.gymLight") : m("today.sub.gymDeload")) : "";
      return `${gymToday ? m("today.sub.gymDone") : m("today.sub.gymNext")}: ${code} ${GYM_LABEL[code]}${deload}`;
    }
    if (item.kind === "personality") return m("today.sub.persona", { code: personaNext, label: PERSONALITY_LABEL[personaNext] });
    if (item.kind === "trade" && day.trade) return tradeSub(day) ?? item.sub;
    // Legacy work/off days keep their v1.0 text.
    if (item.kind === "trade" && !def.legacy && [0, 6].includes(new Date(date + "T12:00:00").getDay())) return m("today.sub.fxClosed");
    if (item.session) return item.sub ? m("today.sub.nyTimeWith", { sub: item.sub }) : m("today.sub.nyTime");
    return item.sub;
  }
  // Info rows (not scored): game blocks show their time span, plus a positive note once everything before is done.
  function infoSub(item: Item) {
    if (item.id !== "game" && item.id !== "game1") return item.sub;
    const end = blockEnd(items, item) ?? item.min;
    const before = tracked.filter((i) => i.min < item.min);
    return `${hm(item.min)}-${hm(end)} · ${span(end - item.min)}${before.length && before.every((i) => day.done[i.id]) ? m("today.sub.gameReady") : ""}`;
  }
  function progressFor(item: Item) {
    const r = item.routine ? routineOf(s, item.routine) : undefined;
    if (!r) return null;
    const st = rowState(r, day, date, prevDay);
    return st.total && !st.complete ? `${st.done}/${st.total}` : null;
  }
  function cueFor(item: Item) {
    return item.cue ? `${item.cue}` : null;
  }

  // DND and voice rest notices: switching off is one tap with Undo.
  function resumeNotify() {
    const prev = s.settings.dndUntil;
    play("toggle");
    update((x) => { x.settings.dndUntil = 0; });
    toast(m("today.toast.notifyOn"), { action: c("undo"), onAction: () => update((x) => { x.settings.dndUntil = prev; }) });
  }
  function unrestVoice() {
    play("toggle");
    update((x) => setVoiceRest(x, date, false));
    toast(m("today.toast.voiceBack"), { action: c("undo"), onAction: () => update((x) => setVoiceRest(x, date, true)) });
  }

  // One notice slot (spec 8.3); NoticeSlot orders them and keeps at most 2 pills.
  const notices: Notice[] = [];
  if (health) notices.push({
    key: "health", tone: "warn", status: true, text: health.text, icon: <IconBell size={18} />, onDismiss: health.dismiss,
    act: health.act ? { label: health.act, href: health.href, onAct: health.retry } : undefined,
  });
  if (streamCard) notices.push({
    key: "stream", tone: "accent", text: m("today.notice.stream"), icon: <IconGame size={18} />,
    sheet: { title: m("today.notice.streamTitle"), body: (close) => (
      <div className="notice-sheet">
        <div className="sw-sub">{m("today.notice.streamBody")}</div>
        {streamNotes.map((n) => <div key={n} className="sw-sub">{n}</div>)}
        <div className="sw-actions">
          {streamOffer && <button className="chip chip--fill" onClick={() => { close(); answerStream("taper"); }}>{m("today.notice.streamTaper")}</button>}
          <button className={`chip ${streamOffer ? "" : "chip--fill"}`} onClick={() => { close(); answerStream("now"); }}>{m("today.notice.streamNow")}</button>
          <button className="chip" onClick={() => { close(); answerStream(null); }}>{c("later")}</button>
        </div>
        {streamOffer && <div className="sw-sub">{m("today.notice.streamNowNote")}</div>}
      </div>
    ) },
  });
  if (pulled && s.settings.streamAsked && !s.settings.planAsked) notices.push({
    key: "intro", tone: "accent", text: m("today.notice.intro"), icon: <IconCalendar size={18} />,
    sheet: { title: m("today.notice.intro"), body: (close) => (
      <div className="notice-sheet">
        <div className="sw-sub">{m("today.notice.introBody")}</div>
        <div className="sw-actions">
          <button className="chip chip--fill" onClick={() => { close(); answerIntro(true); }}>{m("today.notice.introYes")}</button>
          <button className="chip chip--fill" onClick={() => { close(); answerIntro(false); }}>{m("today.notice.introNo")}</button>
          <button className="chip" onClick={() => { close(); answerIntro(null); }}>{c("later")}</button>
        </div>
      </div>
    ) },
  });
  if (termNotice) notices.push(termNotice);
  if (dnd) notices.push({
    key: "dnd", tone: "neutral", icon: <IconMoon size={18} />, act: { label: m("today.notice.dndAct"), onAct: resumeNotify },
    text: m("today.notice.dnd", { time: fmt.clock(s.settings.dndUntil) }),
  });
  if (day.voiceRest) notices.push({ key: "voice", tone: "neutral", icon: <IconSound size={18} />, text: m("today.notice.voice"), act: { label: c("cancel"), onAct: unrestVoice } });
  notices.push(...careNotices);
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
      [m("today.sec.preWork"), (i) => i.min < at(16)],
      [def.work ? m("today.sec.atWork") : m("today.sec.evening"), (i) => i.min >= at(16) && i.min < at(2)],
      [def.work ? m("today.sec.afterWork") : m("today.sec.beforeBed"), (i) => i.min >= at(2)],
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
    if (!it || !sec) { toast(m("today.toast.noLive")); return; }
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
  function onIntent(i: Intent, r: string | null = null) {
    if (i === "water") setGlance("water");
    else if (i === "care") {
      const ro = r ? routineOf(s, r) : undefined;
      if (ro && ro.on) setCareRid(ro.id); else toast(m("today.toast.noRoutine"));
    } else if (i === "sing") {
      if (singItem) setSheet("sing"); else toast(m("today.toast.noSing"));
    } else if (i === "meal2") {
      if (def.work && items.some((x) => x.id === "meal2")) setSheet("meal2");
    }
    else if (i === "weigh") setSheet("weigh");
    else if (i === "trade") {
      if (!items.some((x) => x.kind === "trade")) { toast(m("today.toast.noTrade")); return; }
      setSheet("trade");
    } else if (i === "live") goLive();
    else if (i === "golive") openLive();
    else if (i === "plan" || i === "shut") setRitual(i);
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
    <TabPage>
    <main className="screen today" style={{ ["--phase" as string]: tone }}>
      <AppBar title={c("tab.today")} />
      <div className="topbar">
        <div>
          <div className="eyebrow">{THAI_DATE(date)}</div>
          <h1 className="large-title">{greeting(now)}{s.profile.name ? ` ${s.profile.name}` : ""}</h1>
        </div>
        <Link href="/settings" className="avatar" aria-label={c("settings")}>{(s.profile.name || "K").slice(0, 1).toUpperCase()}</Link>
      </div>
      <div className="identity"><span>{m("today.identity")}</span><b>{s.profile.identity || defaultIdentity()}</b></div>

      <NoticeSlot notices={notices} />

      <NowCard
        tone={tone} phase={cp.phase} progress={progress} left={left} clock={clock} nowMin={nowMin} variant={variant} live={live} cls={cls}
        next={next} nextSub={next ? subFor(next) : undefined} nextCue={next ? cueFor(next) : null}
        micro={next && next.min + 15 < nowMin ? microStep(next) : null} firstNextId={firstNext}
        doneCount={doneCount} total={tracked.length} pendingCount={pending.length} won={won}
        onCheck={() => { if (next) toggle(next, { undo: true }); }}
        onLater={next ? () => snoozeWithUndo(update, date, next, nowMin) : undefined}
        action={nowAction}
      />

      <div className="sw-slot"><SleepWake date={date} now={now} /></div>

      {showCheckin && (
        <CheckIn
          onSkip={() => patch((d) => { d.checkin = { mood: 0, energy: 0, sleep: 0 }; })}
          onSave={(v) => { patch((d) => { d.checkin = { ...v, at: Date.now() }; }); toast(v.energy <= 2 ? m("today.toast.lowEnergy") : m("today.toast.checkinSaved")); }}
          sym={s.care.level !== null && s.care.track.sym ? { on: Array.isArray(day.sym) ? day.sym : [], toggle: (k) => patch((d) => {
            const cur = Array.isArray(d.sym) ? d.sym : [];
            const n = cur.includes(k) ? cur.filter((y) => y !== k) : [...cur, k];
            if (n.length) d.sym = n; else delete d.sym;
          }) } : undefined}
        />
      )}

      <GlanceStrip date={date} nowMin={nowMin} glance={glance} setGlance={setGlance} />

      <button className="card plan-row" onClick={() => setPicker(true)}>
        <span key={day.type} className="plan-row-body swap">
          <span className="plan-row-top">
            <span className="tpl-dot" style={{ ["--tone" as string]: def.color }} />
            <span className="row-main">
              <span className="plan-row-title">{m("today.plan.title", { name: def.name })}</span>
              <span className="row-sub">{def.short}</span>
            </span>
            <Chev />
          </span>
          <MiniTimeline items={items} work={def.work} nowMin={nowMin} />
        </span>
      </button>
      {day.type !== planned && (
        <div className="plan-note">
          <span>{m("today.plan.changed", { name: resolveTemplate(s.schedule, planned).def.name })}</span>
          <button className="link" onClick={() => pickPlan(planned)}>{m("today.plan.useWeek")}</button>
        </div>
      )}
      {taperNote && (
        <div className="plan-note">
          <span>{taperNote}</span>
          {!taperStopped && <button className="link" onClick={endTaper}>{m("today.taper.stop")}</button>}
        </div>
      )}
      <Checklist
        sections={sections} swapKey={day.type} day={day} date={date} nowMin={nowMin} nextId={next?.id} popped={popped}
        settling={settling} openDone={openDone}
        onToggleDone={(k) => setOpenDone((p) => { const n = new Set(p); if (!n.delete(k)) n.add(k); return n; })}
        onTick={toggle} onUntick={untick} onRowActions={(i) => setAct(i)} focusReq={focusReq}
        onPointer={onListPointer} subFor={subFor} cueFor={cueFor} infoSub={infoSub} progressFor={progressFor}
      />

      <Sheet open={sheet === "meal2"} title={m("today.meal2.title")} detent="medium" onClose={() => setSheet(null)}>
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
                  {k === "A" && m("today.meal2.A")}
                  {k === "B" && m("today.meal2.B")}
                  {k === "C" && m("today.meal2.C")}
                </div>
              </span>
              <Chev />
            </button>
          ))}
        </Section>
      </Sheet>

      <Sheet open={sheet === "sing"} title={m("today.sing.title")} detent="medium" onClose={() => setSheet(null)}>
        {singItem?.sub && <p className="confirm-body">{singItem.sub}</p>}
        <div className="section-header">{m("today.sing.real")}</div>
        <div className="chips" style={{ padding: "0 4px 16px" }}>
          {([10, 20, 30, 45] as const).map((mn) => (
            <button key={mn} className={`chip ${singMin === mn ? "on" : ""}`} aria-pressed={singMin === mn} onClick={() => { play("tap"); setSingMin(singMin === mn ? null : mn); }}>{m("today.sing.min", { m: mn })}</button>
          ))}
          {!s.run && <button className="chip chip--tint" onClick={() => { setSheet(null); setSingMin(null); openLive("sing"); }}>{m("today.sing.timer")}</button>}
        </div>
        <div className="confirm-actions">
          <button className="btn" onClick={() => {
            setSheet(null);
            if (singItem) tick(singItem, true);
            if (singMin) { const mn = singMin; patch((d) => { d.sing = { ...d.sing, min: mn }; }); }
            setSingMin(null);
          }}>{m("today.sing.done")}</button>
          <button className="btn secondary" onClick={() => { setSheet(null); setSingMin(null); restVoice(true); }}>{m("today.sing.rest")}</button>
        </div>
        <div className="section-footer" style={{ textAlign: "center", marginTop: 10 }}>{m("today.sing.footer")}</div>
      </Sheet>

      <TradeSheet open={sheet === "trade"} date={date} done={items.some((i) => i.kind === "trade" && !!day.done[i.id])} onClose={() => setSheet(null)} onLog={logTrade} />

      <Sheet open={sheet === "journal"} title={m("today.journal.title")} onClose={() => setSheet(null)}>
        <div className="journal-label">{m("today.journal.good")}</div>
        <textarea className="journal-field" value={jr.good} onChange={(e) => setJr({ ...jr, good: e.target.value })} placeholder={m("today.journal.goodPh")} />
        <div className="journal-label">{m("today.journal.fix")}</div>
        <textarea className="journal-field" value={jr.fix} onChange={(e) => setJr({ ...jr, fix: e.target.value })} placeholder={m("today.journal.fixPh")} />
        <div className="journal-label">{m("today.journal.thanks")}</div>
        <textarea className="journal-field" value={jr.thanks} onChange={(e) => setJr({ ...jr, thanks: e.target.value })} placeholder={m("today.journal.thanksPh")} />
        <button className="btn" onClick={() => {
          setSheet(null);
          play(doneCount + 1 === tracked.length ? "complete" : "done");
          if (doneCount + 1 === tracked.length) celebrate();
          finish("night", (d) => { d.journal = jr; });
          toast(m("today.journal.saved"));
        }}>{m("today.journal.save")}</button>
        <button className="btn secondary" style={{ marginTop: 10 }} onClick={() => { play("done"); setSheet(null); finish("night"); }}>{m("today.journal.skip")}</button>
      </Sheet>

      <Sheet open={sheet === "weigh"} title={m("today.weigh.title")} detent="medium" onClose={() => setSheet(null)}>
        <input className="field num fs-title1" inputMode="decimal" placeholder={m("today.weigh.ph")} value={kg} onChange={(e) => setKg(e.target.value)} autoFocus style={{ textAlign: "center" }} />
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
        }}>{c("save")}</button>
      </Sheet>
      <RowActions item={act} date={date} nowMin={nowMin} onClose={closeAct} onTick={(i) => toggle(i, { undo: true })} onUntick={untick}
        onEditRoutine={(i) => { if (i.routine) setEditor({ rid: i.routine }); }} onSkipRoutine={(i, why) => skipRoutineWithUndo(update, s, date, i, why)} />
      <CareSheet rid={careRid} date={date} onClose={() => setCareRid(null)} onComplete={completeCare} onJournal={openJournal}
        onEdit={(rid, sid) => setEditor({ rid, sid })} onTasks={() => setTasksOpen(true)} />
      <RoutineEditor open={editor} onClose={() => setEditor(null)} />
      <TasksSheet open={tasksOpen} date={date} onClose={() => setTasksOpen(false)} />
      <PlanSheet open={ritual === "plan"} date={date} now={now} onClose={() => setRitual(null)} onPickPlan={() => setPicker(true)} />
      <ShutdownSheet open={ritual === "shut"} date={date} now={now} onClose={() => setRitual(null)} />
      <TemplatePicker open={picker} value={day.type} date={date} onPick={pickPlan} onClose={() => setPicker(false)} />
      <Suspense fallback={null}><IntentReader run={intentRef} /></Suspense>
    </main>
    </TabPage>
  );
}
