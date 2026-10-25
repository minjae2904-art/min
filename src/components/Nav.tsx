"use client";

// Shell navigation (Round B G3): 4 tabs + a separate glass "+", tab bar minimize on scroll, and the bottom accessory.
// QuickLog and the single app-wide Confetti render as siblings of nav.navlayer (a z-20 stacking context), never inside it.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addWater } from "@/lib/actions";
import { logicalDate, logicalMinutes } from "@/lib/date";
import { BAR0, barStep, type Bar } from "@/lib/gesture";
import { fireConfetti, intentHref, sendIntent, type Intent } from "@/lib/intent";
import { dayFor } from "@/lib/model";
import { accessoryFor, leftText } from "@/lib/phase";
import { itemsFor } from "@/lib/schedule";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { useLongPress } from "./gestures";
import { IconBody, IconDrop, IconGym, IconPlus, IconPulse, IconScale, IconStats, IconToday } from "./Icons";
import { QuickLog } from "./QuickLog";
import { Confetti, Sheet, Tap, Tile, motionOff, toast } from "./ui";

export const TABS = [
  { href: "/", label: "วันนี้", Icon: IconToday },
  { href: "/gym", label: "ยิม", Icon: IconGym },
  { href: "/body", label: "ร่างกาย", Icon: IconBody },
  { href: "/insights", label: "ภาพรวม", Icon: IconStats },
];
// Tab a path belongs to (-1 = none: settings, the 404 page). Any /insights?tab= URL keeps ภาพรวม active.
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

function TabLink({ tab, active, onActive }: { tab: (typeof TABS)[number]; active: boolean; onActive: () => void }) {
  const router = useRouter();
  const { armed, bind } = useLongPress(() => { play("nav"); router.push("/settings"); });
  const { href, label, Icon } = tab;
  return (
    <Link
      {...bind}
      href={href}
      draggable={false}
      className={`tab ${active ? "active" : ""}`}
      data-armed={armed || undefined}
      aria-current={active ? "page" : undefined}
      onClick={() => play(active ? "tap" : "nav")}
      // The active tab never re-navigates (it would reset the Insights segment): it scrolls to the top instead.
      onNavigate={active ? (e) => { e.preventDefault(); onActive(); } : undefined}
    >
      <Icon size={26} />
      {label}
    </Link>
  );
}

const durText = (m: number) => { const h = Math.floor(m / 60), r = m % 60; return h ? `${h} ชั่วโมง ${r} นาที` : `${r} นาที`; };

export function Nav() {
  const { s, update } = useStore();
  const path = usePathname();
  const router = useRouter();
  const cur = tabOf(path);
  const expand = useBarMinimize(path);
  const toTop = () => { window.scrollTo({ top: 0, behavior: motionOff() ? "auto" : "smooth" }); expand(); };

  const [ql, setQl] = useState<string | null>(null); // QuickLog date while open
  const [party, setParty] = useState(0);
  const [qa, setQa] = useState(false);
  useEffect(() => {
    const onQuick = () => { play("open"); setQl(logicalDate()); };
    const onParty = () => setParty((n) => n + 1);
    window.addEventListener("krob-quicklog", onQuick);
    window.addEventListener("krob-confetti", onParty);
    return () => { window.removeEventListener("krob-quicklog", onQuick); window.removeEventListener("krob-confetti", onParty); };
  }, []);

  // Accessory clock: 30 s, plus a refresh whenever the app comes back to the foreground.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    const onVis = () => { if (document.visibilityState === "visible") setNow(Date.now()); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  const date = logicalDate(new Date(now));
  const acc = useMemo(() => accessoryFor(s, dayFor(s, date), date, logicalMinutes(new Date(now))), [s, date, now]);
  const items = useMemo(() => itemsFor(s.schedule, dayFor(s, date), date), [s, date]);

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
    toast(`+250 ml · ${(total / 1000).toFixed(2)} ลิตร`, { action: "เลิกทำ", onAction: () => update((x) => { addWater(x, d, -250); }) });
  }
  const pick = (i: Intent) => { play("nav"); setQa(false); goToday(i); };

  const ActiveIcon = TABS[cur]?.Icon ?? IconToday;
  const showAcc = !(acc.kind === "phase" && acc.key === "sleep");
  return (
    <>
      <nav className="navlayer" aria-label="เมนูหลัก">
        <div className="tabbar" data-none={cur < 0 || undefined} style={{ ["--i" as string]: Math.max(0, cur), ["--n" as string]: TABS.length }}>
          <span className="tab-pill" aria-hidden />
          {TABS.map((t, k) => <TabLink key={t.href} tab={t} active={k === cur} onActive={toTop} />)}
        </div>
        <button className="tabbar-mini" aria-label="แสดงแถบแท็บ" onClick={() => { play("tap"); expand(); }}>
          <ActiveIcon size={26} />
        </button>
        {showAcc && (
          <button
            className="accessory"
            style={{ ["--phase" as string]: acc.color }}
            aria-label={`${acc.label} เหลืออีก ${durText(acc.left)}`}
            onClick={() => {
              if (acc.kind !== "phase") { play("nav"); goToday("live"); }
              else if (path === "/") { play("tap"); toTop(); }
              else { play("nav"); router.push("/"); }
            }}
          >
            <span className="acc-dot" aria-hidden />
            <span className="acc-label">{acc.label}</span>
            <span className="acc-left num">· เหลือ {leftText(acc.left)}</span>
          </button>
        )}
        <Tap className="plus" label="บันทึกแบบเร็ว" bind={plus.bind} onTap={() => { play("open"); setQl(logicalDate()); }}>
          <IconPlus size={28} weight={2.4} />
        </Tap>
      </nav>
      {ql && <QuickLog date={ql} scope="phase" onClose={() => setQl(null)} onComplete={fireConfetti} />}
      <Confetti fire={party} />
      <Sheet open={qa} title="ทางลัด" detent="medium" onClose={() => setQa(false)}>
        <div className="group">
          <button className="row has-tile" onClick={water}>
            <Tile color="var(--area-water)"><IconDrop size={18} /></Tile>
            <span className="row-main row-title">ดื่มน้ำ +250 ml</span>
          </button>
          <button className="row has-tile" onClick={() => pick("weigh")}>
            <Tile color="var(--area-training)"><IconScale size={18} /></Tile>
            <span className="row-main row-title">ชั่งน้ำหนัก</span>
          </button>
          {items.some((i) => i.kind === "trade") && (
            <button className="row has-tile" onClick={() => pick("trade")}>
              <Tile color="var(--area-trading)"><IconStats size={18} /></Tile>
              <span className="row-main row-title">บันทึกเทรด</span>
            </button>
          )}
          {items.some((i) => i.id === "stream") && (
            <button className="row has-tile" onClick={() => pick("live")}>
              <Tile color="var(--ph-live)"><IconPulse size={18} /></Tile>
              <span className="row-main row-title">เปิดเช็กลิสต์ไลฟ์</span>
            </button>
          )}
        </div>
      </Sheet>
    </>
  );
}
