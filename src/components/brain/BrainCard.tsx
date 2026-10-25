"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { describeOps } from "@/lib/brain/actions";
import { AREA_LABEL, MICRO_STEPS, RULE_COPY, logMoreDays, mvdText } from "@/lib/brain/copy";
import { reviewDue } from "@/lib/brain/review";
import { plannedWakeOf } from "@/lib/brain/signals";
import type { MicroStepId } from "@/lib/brain/types";
import { reqGuard } from "@/lib/brain-client";
import { addDays, logicalDate, logicalMinutes } from "@/lib/date";
import { dayFor } from "@/lib/model";
import { blockEnd, itemsFor } from "@/lib/schedule";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { PROVIDER_LABEL, RULES_LABEL, useBrain } from "@/lib/useBrain";
import { ProposalCard } from "./ProposalCard";
import { WeeklyReview } from "./WeeklyReview";

const HIDE = "krob-brain-hide"; // date the card was hidden for
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} };

// Balance card on Today (spec 5.4). The engine runs only while the card is on.
export function BrainCard() {
  const { s } = useStore();
  return s.settings.brainCard ? <Card /> : null;
}

export function Ring({ value, size = 44 }: { value: number | null; size?: number }) {
  const r = size / 2 - 4, c = 2 * Math.PI * r;
  return (
    <span className="brain-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill)" strokeWidth="5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - (value ?? 0) / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <b className="num">{value ?? "-"}</b>
    </span>
  );
}

function Card() {
  const b = useBrain("brief");
  const { s, report, brief, today, now, requestAi, aiState, aiBusy, aiAt } = b;
  const [hiddenFor, setHiddenFor] = useState(() => lsGet(HIDE));
  const [peek, setPeek] = useState(false); // game-block chip expanded
  const [review, setReview] = useState(false);
  const day = dayFor(s, today);
  const items = itemsFor(s.schedule, day, today);
  const nowMin = logicalMinutes(now);
  const plannedWake = plannedWakeOf(items);
  const logged = report.sigs.filter((d) => d.logged && d.date < today && d.date >= addDays(today, -13)).length;

  // One automatic AI brief per logical day (spec 6 item 3): guard first, no retry.
  useEffect(() => {
    if (!s.settings.brainAi || !s.settings.brainAutoAi || aiState !== "ok" || aiBusy || aiAt !== null || logged < 3) return;
    if (hiddenFor === today || document.hidden || reqGuard.has(today)) return;
    const wakeMin = day.wakeAt ? logicalMinutes(new Date(day.wakeAt)) : plannedWake;
    if (!(day.wakeAt || nowMin >= plannedWake) || !(day.checkin || nowMin >= wakeMin + 30)) return;
    reqGuard.set(today);
    void requestAi("brief");
  }, [s.settings.brainAi, s.settings.brainAutoAi, aiState, aiBusy, aiAt, logged, hiddenFor, today, day.wakeAt, day.checkin, nowMin, plannedWake, requestAi]);

  if (hiddenFor === today) return null;
  if (logged < 3) return <div className="card brain-card brain-line">{logMoreDays(3 - logged)}</div>;

  const bal = report.balance.b;
  const inGame = items.some((i) => (i.id === "game" || i.id === "game1") && nowMin >= i.min && nowMin < (blockEnd(items, i) ?? i.min));
  if (inGame && !peek) {
    return (
      <button className="card brain-card brain-line brain-chip" onClick={() => { play("tap"); setPeek(true); }}>
        สมดุล {bal ?? "-"} · เล่นให้สนุก แตะเพื่อดูข้อเสนอ
      </button>
    );
  }

  const todays = s.brain.decisions.filter((d) => d.d !== "u" && logicalDate(new Date(d.at)) === today);
  const usedToday = todays.filter((d) => d.d === "a").length;
  const shown = brief.items.slice(0, Math.max(0, 2 - todays.length));
  const appliedToday = s.brain.applied.filter((r) => r.date === today && !r.undoneAt && r.ops.length).slice(0, 2);
  const f = s.brain.focus;
  const focusText = f && f.from <= today && today <= f.to ? (f.ref === "mvd" ? mvdText() : MICRO_STEPS[f.ref as MicroStepId] ?? "") : "";
  const chip = brief.src === "ai" ? PROVIDER_LABEL[brief.provider ?? ""] ?? "AI" : RULES_LABEL;
  const due = reviewDue(s, today);

  // Everything handled for today: collapse to one line (spec 5.4).
  if (!shown.length && todays.length > 0 && !b.lost.length && !due) {
    return (
      <div className="card brain-card brain-line">
        วันนี้ใช้ {usedToday} ข้อ · สมดุล {bal ?? "-"} · <Link href="/balance" className="link" onClick={() => play("nav")}>ดูสมดุล</Link>
      </div>
    );
  }

  return (
    <div className="card brain-card">
      <div className="brain-head">
        <Ring value={bal} />
        <div className="brain-headline">{brief.headline}</div>
        <span className="badge">{chip}</span>
      </div>
      {aiBusy && <div className="ai-skel" aria-hidden><span className="skel" style={{ width: "88%" }} /><span className="skel" style={{ width: "64%" }} /></div>}

      {focusText && <div className="brain-focus"><b>ข้อเดียวสัปดาห์นี้ · {AREA_LABEL[f!.area]}:</b> {focusText}</div>}

      {b.lost.map((r) => (
        <div key={r.id} className="brain-notice">
          <div>การปรับนี้ถูกเขียนทับจากอีกเครื่อง · {describeOps(s, r.ops)[0]?.text ?? RULE_COPY[r.rule as keyof typeof RULE_COPY]?.short}</div>
          <div className="sw-actions">
            <button className="chip prop-go" onClick={() => b.reapply(r)}>ใช้อีกครั้ง</button>
            <button className="chip" onClick={() => b.dismissLost(r)}>ปล่อยไป</button>
          </div>
        </div>
      ))}

      {due && (
        <button className="brain-review" onClick={() => { play("open"); setReview(true); }}>
          <b>รีวิวสัปดาห์พร้อมแล้ว · 2 นาที</b><span className="link">เริ่ม</span>
        </button>
      )}

      {shown.map((it) => <ProposalCard key={it.cand.id} item={it} b={b} />)}
      {appliedToday.map((r) => (
        <div key={r.id} className="brain-applied">
          <span>ปรับแล้ว: {describeOps(s, r.ops)[0]?.text}</span>
          <button className="link" onClick={() => { play("undo"); b.undo(r.id); }}>เลิกทำ</button>
        </div>
      ))}

      <div className="brain-foot">
        <Link href="/balance" className="link" onClick={() => play("nav")}>ดูสมดุลทั้งหมด</Link>
        <button className="link brain-hide" onClick={() => { play("tap"); lsSet(HIDE, today); setHiddenFor(today); }}>ซ่อนวันนี้</button>
      </div>
      <WeeklyReview open={review} onClose={() => setReview(false)} />
    </div>
  );
}
