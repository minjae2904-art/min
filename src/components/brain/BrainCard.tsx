"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { msgs } from "@/i18n";
import { rich } from "@/i18n/react";
import * as C from "@/i18n/msg/components-brain";
import * as Common from "@/i18n/msg/common";
import { ProgressRing } from "@/components/Charts";
import { RollNum } from "@/components/ui";
import { describeOps } from "@/lib/brain/actions";
import { AREA_LABEL, MICRO_STEPS, RULE_COPY, logMoreDays, mvdText } from "@/lib/brain/copy";
import { reviewDue } from "@/lib/brain/review";
import { plannedWakeOf } from "@/lib/brain/signals";
import type { MicroStepId } from "@/lib/brain/types";
import { reqGuard } from "@/lib/brain-client";
import { insightsHref } from "@/lib/intent";
import { addDays, logicalDate, logicalMinutes } from "@/lib/date";
import { dayFor } from "@/lib/model";
import { blockEnd, itemsFor } from "@/lib/schedule";
import { play } from "@/lib/sound";
import { wakeMinOf } from "@/lib/stats";
import { PROVIDER_LABEL, rulesLabel, useBrain } from "@/lib/useBrain";
import { ArrowDiff, ProposalCard } from "./ProposalCard";
import { WeeklyReview } from "./WeeklyReview";

const m = msgs(C), c = msgs(Common);
const HIDE = "krob-brain-hide"; // date the card was hidden for
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} };

// Balance ring (0..100), a thin wrapper over the shared ProgressRing; bare = ring only (glance tile).
export function Ring({ value, size = 44, bare }: { value: number | null; size?: number; bare?: boolean }) {
  return (
    <ProgressRing value={(value ?? 0) / 100} size={size} width={5} tone="var(--accent)" className="brain-ring">
      {!bare && <b className="num">{value === null ? "-" : <RollNum value={value} />}</b>}
    </ProgressRing>
  );
}

// Today's balance logic (spec 8.5), used by the glance strip's Balance tile only, so the engine runs only while
// settings.brainCard is on. "Hidden today" now only removes the tile's dot and proposal hint.
export function useBrainToday() {
  const b = useBrain("brief");
  const { s, report, brief, today, now, requestAi, aiState, aiBusy, aiAt } = b;
  const [hiddenFor, setHiddenFor] = useState(() => lsGet(HIDE));
  const day = dayFor(s, today);
  const items = itemsFor(s.schedule, day, today);
  const nowMin = logicalMinutes(now);
  const plannedWake = plannedWakeOf(items);
  const logged = report.sigs.filter((d) => d.logged && d.date < today && d.date >= addDays(today, -13)).length;

  // One automatic AI brief per logical day (spec 6 item 3): guard first, no retry.
  useEffect(() => {
    if (!s.settings.brainAi || !s.settings.brainAutoAi || aiState !== "ok" || aiBusy || aiAt !== null || logged < 3) return;
    if (hiddenFor === today || document.hidden || reqGuard.has(today)) return;
    const wakeMin = day.wakeAt ? wakeMinOf(today, day.wakeAt) : plannedWake;
    if (!(day.wakeAt || nowMin >= plannedWake) || !(day.checkin || nowMin >= wakeMin + 30)) return;
    reqGuard.set(today);
    void requestAi("brief");
  }, [s.settings.brainAi, s.settings.brainAutoAi, aiState, aiBusy, aiAt, logged, hiddenFor, today, day.wakeAt, day.checkin, nowMin, plannedWake, requestAi]);

  const inGame = items.some((i) => (i.id === "game" || i.id === "game1") && nowMin >= i.min && nowMin < (blockEnd(items, i) ?? i.min));
  const todays = s.brain.decisions.filter((d) => d.d !== "u" && logicalDate(new Date(d.at)) === today);
  const f = s.brain.focus;
  return {
    b, logged, inGame,
    bal: report.balance.b,
    weakest: report.balance.weakest,
    hidden: hiddenFor === today,
    hide: () => { lsSet(HIDE, today); setHiddenFor(today); },
    used: todays.filter((d) => d.d === "a").length,
    decided: todays.length,
    shown: brief.items.slice(0, Math.max(0, 2 - todays.length)),
    applied: s.brain.applied.filter((r) => r.date === today && !r.undoneAt && r.ops.length).slice(0, 2),
    focusText: f && f.from <= today && today <= f.to ? (f.ref === "mvd" ? mvdText() : MICRO_STEPS[f.ref as MicroStepId] ?? "") : "",
    due: reviewDue(s, today),
    lost: b.lost,
  };
}
export type BrainToday = ReturnType<typeof useBrainToday>;

// The old Today card body, shown in the glance strip's "สมดุลวันนี้" sheet. Always rendered there, even when hidden today.
export function BrainPanel({ t, onHide }: { t: BrainToday; onHide: () => void }) {
  const [review, setReview] = useState(false);
  const { b, bal, logged, shown, applied, focusText, due, lost } = t;
  const { s, brief, aiBusy } = b;
  const f = s.brain.focus;
  const chip = brief.src === "ai" ? PROVIDER_LABEL[brief.provider ?? ""] ?? "AI" : rulesLabel();
  const foot = (
    <div className="brain-foot">
      <Link href={insightsHref("balance")} className="link" onClick={() => play("nav")}>{m("brainCard.seeAll")}</Link>
      <button className="link brain-hide" onClick={() => { play("tap"); t.hide(); onHide(); }}>{m("brainCard.hideToday")}</button>
    </div>
  );
  if (logged < 3) return <div className="card brain-card"><div className="brain-line">{logMoreDays(3 - logged)}</div>{foot}</div>;
  // Everything handled for today: one line (spec 5.4).
  if (!shown.length && t.decided > 0 && !lost.length && !due) {
    return <div className="card brain-card"><div className="brain-line">{m("brainCard.usedToday", { used: t.used, bal: bal ?? "-" })}</div>{foot}</div>;
  }

  return (
    <div className="card brain-card">
      <div className="brain-head">
        <Ring value={bal} />
        <div className="brain-headline">{brief.headline}</div>
        <span className="badge">{chip}</span>
      </div>
      {aiBusy && <div className="ai-skel" aria-hidden><span className="skel" style={{ width: "88%" }} /><span className="skel" style={{ width: "64%" }} /></div>}

      {focusText && <div className="brain-focus"><b>{m("brainCard.focus", { area: AREA_LABEL[f!.area] })}</b> {focusText}</div>}

      {lost.map((r) => (
        <div key={r.id} className="brain-notice">
          <div>{rich(m("brainCard.lost"), { diff: <ArrowDiff d={describeOps(s, r.ops)[0]} fallback={RULE_COPY[r.rule as keyof typeof RULE_COPY]?.short} /> })}</div>
          <div className="sw-actions">
            <button className="chip prop-go" onClick={() => b.reapply(r)}>{m("brainCard.reapply")}</button>
            <button className="chip" onClick={() => b.dismissLost(r)}>{m("brainCard.dismissLost")}</button>
          </div>
        </div>
      ))}

      {due && (
        <button className="brain-review" onClick={() => { play("open"); setReview(true); }}>
          <b>{m("brainCard.reviewReady")}</b><span className="link">{m("brainCard.start")}</span>
        </button>
      )}

      {shown.map((it) => <ProposalCard key={it.cand.id} item={it} b={b} />)}
      {applied.map((r) => (
        <div key={r.id} className="brain-applied">
          <span>{rich(m("brainCard.applied"), { diff: <ArrowDiff d={describeOps(s, r.ops)[0]} /> })}</span>
          <button className="link" onClick={() => { play("undo"); b.undo(r.id); }}>{c("undo")}</button>
        </div>
      ))}

      {foot}
      <WeeklyReview open={review} onClose={() => setReview(false)} />
    </div>
  );
}
