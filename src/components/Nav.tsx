"use client";

// Shell navigation (Round B G3): 4 tabs + a separate glass "+", tab bar minimize on scroll, and the bottom accessory.
// QuickLog and the single app-wide Confetti render as siblings of nav.navlayer (a z-20 stacking context), never inside it.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmt, langArr, msgs, withLang } from "@/i18n";
import { useLang } from "@/i18n/react";
import * as C from "@/i18n/msg/components";
import * as Common from "@/i18n/msg/common";
import { addWater } from "@/lib/actions";
import { logicalDate, logicalMinutes } from "@/lib/date";
import { BAR0, barStep, type Bar } from "@/lib/gesture";
import { fireConfetti, intentHref, sendIntent, type Intent } from "@/lib/intent";
import { dayFor, type RunKind } from "@/lib/model";
import { accessoryFor, leftText } from "@/lib/phase";
import { ritualNow } from "@/lib/rituals";
import { itemsFor } from "@/lib/schedule";
import { msClock, restLeft } from "@/lib/session";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { vtOn } from "@/lib/vt";
import { useLongPress } from "./gestures";
import { IconBody, IconCalendar, IconDrop, IconGym, IconMoon, IconPlus, IconPulse, IconScale, IconStats, IconToday } from "./Icons";
import { LiveRecap } from "./live/LiveRecap";
import { LiveView } from "./live/LiveView";
import { RestSheet } from "./live/RestSheet";
import { QuickLog } from "./QuickLog";
import { Confetti, Sheet, Tap, Tile, motionOff, toast } from "./ui";

const m = msgs(C), c = msgs(Common);

export const TABS = langArr(() => [
  { href: "/", label: c("tab.today"), Icon: IconToday },
  { href: "/gym", label: c("tab.gym"), Icon: IconGym },
  { href: "/body", label: c("tab.body"), Icon: IconBody },
  { href: "/insights", label: c("tab.insights"), Icon: IconStats },
]);
// Tab a path belongs to (-1 = none: settings, the 404 page). Any /insights?tab= URL keeps the Insights tab active.
export const tabOf = (p: string) => TABS.findIndex(({ href }) => (href === "/" ? p === "/" : p.startsWith(href)));

const setBarAttr = (min: boolean) => { const el = document.documentElement; if (min) el.dataset.bar = "min"; else delete el.dataset.bar; };

// One passive scroll listener, rAF-throttled; html[data-bar] is written only when the state flips. Resets per path.
function useBarMinimize(path: string) {
  const bar = useRef<Bar>(BAR0);
  useEffect(() => {
    let raf = 0;
    bar.current = { ...BAR0, y: Math.max(0, window.scrollY) };
    setBarAttr(false);
    const run = () => {
      raf = 0;
      const prev = bar.current;
      const next = barStep(prev, window.scrollY, document.documentElement.scrollHeight - window.innerHeight);
      bar.current = next;
      if (next.min !== prev.min) setBarAttr(next.min);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(run); };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); setBarAttr(false); };
  }, [path]);
  return useCallback(() => { bar.current = { min: false, y: Math.max(0, window.scrollY), acc: 0 }; setBarAttr(false); }, []);
}

// k = this tab, cur = the current tab (-1 off the tab pages). A tab-to-tab switch carries "tab-l" (moving right) or
// "tab-r" for <TabPage>, only while view transitions are allowed (vt.ts); otherwise no types, so nothing animates.
function TabLink({ tab, k, cur, onActive }: { tab: (typeof TABS)[number]; k: number; cur: number; onActive: () => void }) {
  const router = useRouter();
  const { armed, bind } = useLongPress(() => { play("nav"); router.push("/settings"); });
  const { href, label, Icon } = tab;
  const active = k === cur;
  const types = !active && cur >= 0 && vtOn() ? [k > cur ? "tab-l" : "tab-r"] : undefined;
  return (
    <Link
      {...bind}
      href={href}
      draggable={false}
      className={`tab ${active ? "active" : ""}`}
      data-armed={armed || undefined}
      aria-current={active ? "page" : undefined}
      transitionTypes={types}
      onClick={() => play(active ? "tap" : "nav")}
      // The active tab never re-navigates (it would reset the Insights segment): it scrolls to the top instead.
      onNavigate={active ? (e) => { e.preventDefault(); onActive(); } : undefined}
    >
      <Icon size={26} />
      {label}
    </Link>
  );
}

export function Nav() {
  const { s, update } = useStore();
  const lang = useLang();
  const path = usePathname();
  const router = useRouter();
  const cur = tabOf(path);
  const expand = useBarMinimize(path);
  const toTop = () => { window.scrollTo({ top: 0, behavior: motionOff() ? "auto" : "smooth" }); expand(); };

  const [ql, setQl] = useState<string | null>(null); // QuickLog date while open
  const [party, setParty] = useState(0);
  const [qa, setQa] = useState(false);
  const [lv, setLv] = useState<RunKind | null>(null); // Live mode overlay (opened by a tap only, never automatically)
  const [recap, setRecap] = useState<string | null>(null); // LiveRecap date
  const [restOpen, setRestOpen] = useState(false);
  useEffect(() => {
    const onQuick = () => { play("open"); setQl(logicalDate()); };
    const onParty = () => setParty((n) => n + 1);
    const onLive = (e: Event) => { const k = (e as CustomEvent<RunKind>).detail; setLv(k === "sing" ? "sing" : "live"); };
    window.addEventListener("krob-quicklog", onQuick);
    window.addEventListener("krob-confetti", onParty);
    window.addEventListener("krob-live", onLive);
    return () => { window.removeEventListener("krob-quicklog", onQuick); window.removeEventListener("krob-confetti", onParty); window.removeEventListener("krob-live", onLive); };
  }, []);

  // Accessory clock: 1 s only while a gym rest timer runs (checked before accessoryFor), else 30 s (a session shows h:mm),
  // plus a refresh whenever the app comes back to the foreground.
  const [now, setNow] = useState(() => Date.now());
  const resting = restLeft(s, now) !== null;
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), resting ? 1000 : 30_000);
    const onVis = () => { if (document.visibilityState === "visible") setNow(Date.now()); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [resting]);
  // A rest that was just started may be newer than the clock: catch up once so the countdown starts at once.
  const restEnd = s.gym.run?.rest?.end;
  useEffect(() => { if (!restEnd) return; const t = setTimeout(() => setNow(Date.now()), 0); return () => clearTimeout(t); }, [restEnd]);
  const date = logicalDate(new Date(now));
  const acc = useMemo(() => withLang(lang, () => accessoryFor(s, dayFor(s, date), date, logicalMinutes(new Date(now)), now)), [s, date, now, lang]);
  // Rest done: one optional beep (gym.beep, off by default; Live mode itself never plays sound).
  const beeped = useRef<number | null>(null);
  useEffect(() => {
    if (acc.kind !== "rest" || acc.sec !== 0 || !restEnd || beeped.current === restEnd) return;
    beeped.current = restEnd;
    if (s.gym.beep) play("done");
  }, [acc.kind, acc.sec, restEnd, s.gym.beep]);
  const items = useMemo(() => withLang(lang, () => itemsFor(s.schedule, dayFor(s, date), date)), [s, date, lang]);

  const goToday = (i: Intent) => {
    if (path === "/") sendIntent(i);
    else router.push(intentHref(i), { scroll: i !== "live" }); // live scrolls itself; the router must not race it
  };
  const plus = useLongPress(() => setQa(true)); // Sheet plays "open"

  function water() {
    const d = logicalDate();
    const total = Math.max(0, (dayFor(s, d).waterMl || 0) + 250);
    update((x) => { addWater(x, d, 250); });
    play("water");
    setQa(false);
    toast(m("nav.toast.water", { l: (total / 1000).toFixed(2) }), { action: c("undo"), onAction: () => update((x) => { addWater(x, d, -250); }) });
  }
  const pick = (i: Intent) => { play("nav"); setQa(false); goToday(i); };

  const openLive = (k: RunKind = "live") => { play("open"); setQa(false); setLv(k); };
  const hasStream = items.some((i) => i.id === "stream");
  const rit = ritualNow(s, date, logicalMinutes(new Date(now))); // v1.7 morning plan / evening shutdown, by time of day
  const ActiveIcon = TABS[cur]?.Icon ?? IconToday;
  const showAcc = !(acc.kind === "phase" && acc.key === "sleep");
  const restDone = acc.kind === "rest" && acc.sec === 0;
  const accLabel = acc.kind === "rest" && restDone ? m("nav.acc.restDone") : acc.label;
  const accLeft = acc.stale ? "" : acc.kind === "rest" ? (restDone ? m("nav.acc.next") : `· ${msClock(acc.sec ?? 0)}`) : acc.up ? `· ${leftText(acc.left)}` : m("nav.acc.left", { left: leftText(acc.left) });
  const accAria = acc.stale ? acc.label : acc.kind === "rest" ? (restDone ? m("nav.aria.restDone") : m("nav.aria.restLeft", { time: msClock(acc.sec ?? 0) })) : acc.up ? m("nav.aria.up", { label: acc.label, dur: fmt.durLong(acc.left) }) : m("nav.aria.left", { label: acc.label, dur: fmt.durLong(acc.left) });
  return (
    <>
      <nav className="navlayer" aria-label={m("nav.aria.menu")}>
        <div className="tabbar" data-none={cur < 0 || undefined} style={{ ["--i" as string]: Math.max(0, cur), ["--n" as string]: TABS.length }}>
          <span className="tab-pill" aria-hidden />
          {TABS.map((t, k) => <TabLink key={t.href} tab={t} k={k} cur={cur} onActive={toTop} />)}
        </div>
        <button className="tabbar-mini" aria-label={m("nav.aria.showTabs")} onClick={() => { play("tap"); expand(); }}>
          <ActiveIcon size={26} />
        </button>
        {showAcc && (
          <button
            className="accessory"
            data-kind={acc.kind}
            data-done={restDone || undefined}
            style={{ ["--phase" as string]: acc.color }}
            aria-label={accAria}
            onClick={() => {
              if (acc.kind === "rest") { play("open"); setRestOpen(true); }
              else if (acc.kind === "session" || acc.kind === "live") openLive(s.run?.k ?? "live");
              else if (acc.kind === "game") { play("nav"); goToday("live"); }
              else if (path === "/") { play("tap"); toTop(); }
              else { play("nav"); router.push("/"); }
            }}
          >
            <span className="acc-dot" aria-hidden />
            <span className="acc-label">{accLabel}</span>
            <span className="acc-left num">{accLeft}</span>
          </button>
        )}
        <Tap className="plus" label={m("nav.aria.quickLog")} bind={plus.bind} onTap={() => { play("open"); setQl(logicalDate()); }}>
          <IconPlus size={28} weight={2.4} />
        </Tap>
      </nav>
      {ql && <QuickLog date={ql} scope="phase" onClose={() => setQl(null)} onComplete={fireConfetti} />}
      <Confetti fire={party} />
      <LiveView kind={lv} onClose={() => setLv(null)} onEnded={(d, k) => { setLv(null); if (k === "live") setRecap(d); }} />
      <LiveRecap date={recap} onClose={() => setRecap(null)} />
      <RestSheet open={restOpen} onClose={() => setRestOpen(false)} />
      <Sheet open={qa} title={m("nav.shortcuts.title")} detent="medium" onClose={() => setQa(false)}>
        <div className="group">
          <button className="row has-tile" onClick={water}>
            <Tile color="var(--area-water)"><IconDrop size={18} /></Tile>
            <span className="row-main row-title">{m("nav.shortcuts.water")}</span>
          </button>
          <button className="row has-tile" onClick={() => pick("weigh")}>
            <Tile color="var(--area-training)"><IconScale size={18} /></Tile>
            <span className="row-main row-title">{m("nav.shortcuts.weigh")}</span>
          </button>
          {items.some((i) => i.kind === "trade") && (
            <button className="row has-tile" onClick={() => pick("trade")}>
              <Tile color="var(--area-trading)"><IconStats size={18} /></Tile>
              <span className="row-main row-title">{m("nav.shortcuts.trade")}</span>
            </button>
          )}
          {(hasStream || s.run) && (
            <button className="row has-tile" onClick={() => openLive(s.run?.k ?? "live")}>
              <Tile color="var(--ph-live)"><IconPulse size={18} /></Tile>
              <span className="row-main row-title">{s.run ? (s.run.k === "live" ? m("nav.shortcuts.openLive") : m("nav.shortcuts.openSing")) : m("nav.shortcuts.live")}</span>
            </button>
          )}
          {rit && (
            <button className="row has-tile" onClick={() => pick(rit)}>
              <Tile color={rit === "plan" ? "var(--ph-morning)" : "var(--ph-sleep)"}>{rit === "plan" ? <IconCalendar size={18} /> : <IconMoon size={18} />}</Tile>
              <span className="row-main row-title">{rit === "plan" ? m("nav.shortcuts.plan") : m("nav.shortcuts.shutdown")}</span>
            </button>
          )}
          <button className="row has-tile" onClick={() => { play("nav"); setQa(false); router.push("/gym?start=1"); }}>
            <Tile color="var(--area-training)"><IconGym size={18} /></Tile>
            <span className="row-main row-title">{m("nav.shortcuts.gymSets")}</span>
          </button>
        </div>
      </Sheet>
    </>
  );
}
