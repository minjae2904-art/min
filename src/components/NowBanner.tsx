"use client";

import { hm } from "@/lib/date";
import type { DayLog, State } from "@/lib/model";
import { currentPhase } from "@/lib/phase";

const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} ชม. ${m % 60} น.` : `${m} นาที`);

// Big "where am I in my day" card: live clock, current block, progress through it, what comes next.
export function NowBanner({ s, day, date, now, nowMin }: { s: State; day: DayLog; date: string; now: Date; nowMin: number }) {
  const { phase, next, progress, left } = currentPhase(s, day, nowMin, date);
  const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return (
    <div className="now" style={{ ["--phase" as string]: phase.color }}>
      <div className="now-top">
        <div className="now-clock num">{clock}</div>
        <div className="now-range num">{hm(phase.start)} - {hm(phase.end)}</div>
      </div>
      {/* Keyed on the phase: cross-fades only when the phase changes, never on the 15 s tick. */}
      <div key={phase.key} className="now-swap">
        <div className="now-label">ตอนนี้</div>
        <div className="now-phase">{phase.label}</div>
        <div className="now-tip">{phase.tip}</div>
      </div>
      <div className="now-bar"><span className="fill-x grow" style={{ ["--p" as string]: progress }} /></div>
      <div className="now-next">
        <span>เหลือ {dur(Math.max(0, left))}</span>
        <span>ต่อไป: {next.label}</span>
      </div>
    </div>
  );
}
