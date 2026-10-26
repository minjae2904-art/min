"use client";

// Today notices of the self-care module (v1.7 spec 4.1): the one-time setup card and the doctor flag.
// Nothing changes until a tap; the level choice shows its diff in a toast with an exact undo.
import { IconBell, IconSpark } from "@/components/Icons";
import type { Notice } from "@/components/today/NoticeSlot";
import { toast } from "@/components/ui";
import { careFlag } from "@/lib/care/flags";
import { LEVEL_LABEL, LEVEL_SUMMARY } from "@/lib/care/presets";
import { applyLevel } from "@/lib/care/progress";
import { LEVELS, type Level } from "@/lib/care/types";
import { dayFor, type State } from "@/lib/model";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { waterGoal, weightStats } from "@/lib/stats";
import { CareFlag } from "./CareFlag";
import { msgs } from "@/i18n";
import { useLang } from "@/i18n/react";
import * as C from "@/i18n/msg/components-care";
import * as Common from "@/i18n/msg/common";

const m = msgs(C), c = msgs(Common);

type Upd = (fn: (x: State) => void) => void;

// Shared by the setup card and Settings > ดูแลตัวเอง. The toast text comes from a dry run on a copy (same inputs, same result).
export function applyLevelWithUndo(update: Upd, s: State, level: Level, date: string) {
  const probe = structuredClone(s);
  const res = applyLevel(probe, level, date);
  const prev = { care: structuredClone(s.care), routines: structuredClone(s.schedule.care ?? []) };
  const goal = waterGoal(probe, dayFor(probe, date), weightStats(probe, date).cur);
  play("done");
  update((x) => { applyLevel(x, level, date); });
  const parts = [m("careNotices.toast.level", { level: LEVEL_LABEL[level] }), m("careNotices.toast.added", { n: res.added })];
  if (res.off) parts.push(m("careNotices.toast.off", { n: res.off }));
  if (res.water) parts.push(m("careNotices.toast.water", { l: (goal / 1000).toFixed(1) }));
  toast(parts.join(" · "), { action: c("undo"), onAction: () => update((x) => { x.care = structuredClone(prev.care); x.schedule.care = structuredClone(prev.routines); }) });
}

export function CareSetup({ date, close }: { date: string; close: () => void }) {
  const { s, update } = useStore();
  useLang();
  return (
    <div className="notice-sheet">
      <div className="sw-sub">{m("careNotices.setup.body")}</div>
      <div className="group care-levels">
        {LEVELS.map((l) => (
          <button key={l} className="row" onClick={() => { close(); applyLevelWithUndo(update, s, l, date); }}>
            <span className="row-main"><span className="row-title">{LEVEL_LABEL[l]}</span><span className="row-sub">{LEVEL_SUMMARY[l]}</span></span>
          </button>
        ))}
      </div>
      <div className="sw-actions">
        <button className="chip" onClick={() => { play("tap"); close(); update((x) => { x.care.asked = true; }); }}>{c("later")}</button>
      </div>
      <div className="sw-sub">{m("careNotices.setup.disclaimer")}</div>
    </div>
  );
}

export function useCareNotices(date: string, pulled: boolean): Notice[] {
  const { s } = useStore();
  useLang();
  const out: Notice[] = [];
  if (pulled && s.settings.streamAsked && s.care.level === null && !s.care.asked) out.push({
    key: "care", tone: "accent", icon: <IconSpark size={18} />, text: m("careNotices.notice.text"),
    sheet: { title: m("careNotices.notice.title"), body: (close) => <CareSetup date={date} close={close} /> },
  });
  const flag = careFlag(s, date);
  if (flag) out.push({
    key: "flag", tone: "warn", icon: <IconBell size={18} />, text: flag.title,
    sheet: { title: flag.title, body: (close) => <CareFlag flag={flag} date={date} close={close} /> },
  });
  return out;
}
