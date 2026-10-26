"use client";

// v1.8 Today "term" notice, one of: (a) fixable class clashes today -> ClashBody; else (b) one near-term notice:
// no timetable around the default term start -> set it up; timetable set, term week not in use, term 1-14 days ahead
// -> TermPlan. "ไว้ทีหลัง" hides (b) for 7 days on this device (localStorage, best effort).
import Link from "next/link";
import { useMemo, useState } from "react";
import { IconBook } from "@/components/Icons";
import type { Notice } from "@/components/today/NoticeSlot";
import { msgs, withLang } from "@/i18n";
import { useLang } from "@/i18n/react";
import * as C from "@/i18n/msg/components-term";
import * as Common from "@/i18n/msg/common";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { addDays, logicalMinutes } from "@/lib/date";
import { isTermWeek } from "@/lib/clash";
import { TERM_START_DEFAULT } from "@/lib/model";
import { ClashBody, clashesNow } from "./ClashSheet";
import { TermPlanBody } from "./TermPlan";

const m = msgs(C), c = msgs(Common);
const SOON_KEY = "krob-term-soon";
const dayN = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86_400_000);
function hiddenUntil(): number {
  try { return Number(localStorage.getItem(SOON_KEY)) || 0; } catch { return 0; }
}

// pulled gates every read (localStorage included), so the first client render matches the server render.
export function useTermNotice(date: string, pulled: boolean, nowMs: number): Notice | null {
  const { s } = useStore();
  const lang = useLang();
  const [, bump] = useState(0);
  const nowMin = logicalMinutes(new Date(nowMs));
  const clashes = useMemo(() => withLang(lang, () => clashesNow(s, date, date, nowMin)), [s, date, nowMin, lang]);
  if (!pulled) return null;
  const icon = <IconBook size={18} />;
  if (clashes.length) {
    const first = clashes[0];
    const what = first.item?.title ?? (first.kind === "early" ? m("termNotice.what.early") : m("termNotice.what.sleep"));
    return {
      key: "term", tone: "warn", icon,
      text: clashes.length === 1 ? m("termNotice.clash.one", { what }) : m("termNotice.clash.many", { n: clashes.length }),
      sheet: { title: m("termNotice.clash.title"), body: (close) => <ClashBody date={date} today={date} close={close} /> },
    };
  }
  if (hiddenUntil() > nowMs) return null;
  const later = () => {
    try { localStorage.setItem(SOON_KEY, String(Date.now() + 7 * 86_400_000)); } catch { /* private mode: shows again next time */ }
    bump((n) => n + 1);
  };
  const t = s.schedule.term;
  if (!t) {
    if (date < addDays(TERM_START_DEFAULT, -14) || date > addDays(TERM_START_DEFAULT, 30)) return null;
    return {
      key: "term", tone: "accent", icon, text: m("termNotice.soon.text"),
      sheet: { title: m("termNotice.soon.title"), body: (close) => (
        <div className="notice-sheet">
          <div className="sw-sub">{m("termNotice.soon.body")}</div>
          <div className="sw-actions">
            <Link href="/settings/term" className="chip chip--fill" onClick={() => { play("nav"); close(); }}>{m("termNotice.soon.setup")}</Link>
            <button className="chip" onClick={() => { play("tap"); later(); close(); }}>{c("later")}</button>
          </div>
        </div>
      ) },
    };
  }
  const n = dayN(date, t.start);
  if (!t.cls.length || isTermWeek(s) || n < 1 || n > 14) return null;
  return {
    key: "term", tone: "accent", icon, text: m("termNotice.plan.text", { n }),
    sheet: { title: m("termNotice.plan.title"), body: (close) => <TermPlanBody close={close} onLater={later} /> },
  };
}
