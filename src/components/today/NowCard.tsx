"use client";

import { useEffect, useRef } from "react";
import { ProgressRing } from "@/components/Charts";
import { IconCheck, IconClock } from "@/components/Icons";
import { Tap } from "@/components/ui";
import { hm } from "@/lib/date";
import type { Phase } from "@/lib/phase";
import { leftText } from "@/lib/phase";
import { canReschedule, type Item } from "@/lib/schedule";
import type { NowVariant } from "@/lib/today";
import { fmt, msgs } from "@/i18n";
import * as C from "@/i18n/msg/components-today";

const m = msgs(C);

function countdown(diff: number) {
  if (Math.abs(diff) < 5) return m("nowCard.cd.now");
  const a = Math.abs(diff);
  const t = a >= 60 ? m("nowCard.cd.hm", { h: Math.floor(a / 60), m: a % 60 }) : m("nowCard.cd.m", { m: a });
  return diff > 0 ? m("nowCard.cd.in", { t }) : m("nowCard.cd.ago", { t });
}

// Phase progress arc on the shared ProgressRing (mesh track via --mesh-track); it advances on the 15 s clock tick.
function Arc({ progress, left }: { progress: number; left: number }) {
  const p = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <ProgressRing value={p / 100} size={56} width={5} tone="var(--on-mesh)" track="var(--mesh-track)" className="nowcard-arc"
      label={m("nowCard.arc", { p, left: fmt.dur(Math.max(0, left)) })}>
      <b className="num" aria-hidden>{leftText(left)}</b>
    </ProgressRing>
  );
}

// One "what now?" card (spec 8.2): phase (or live block) with its progress arc, then the next item with a one-tap check.
export function NowCard(p: {
  tone: string; phase: Phase; progress: number; left: number; clock: string; nowMin: number; variant: NowVariant;
  live: { item: Item; end: number; kind: "live" | "game" } | null;
  cls?: { item: Item; end: number } | null; // v1.8: a running class when no live block (page passes tone var(--info) and class progress)
  next?: Item; nextSub?: string; nextCue?: string | null; micro?: string | null; firstNextId?: string;
  doneCount: number; total: number; pendingCount: number; won: boolean; onCheck: () => void; onLater?: () => void;
  action?: { label: string; onTap: () => void }; // v1.7: one mode shortcut (Live mode, gym sets, plan/shutdown)
}) {
  const { phase, live, next } = p;
  const ref = useRef<HTMLElement>(null);

  // html[data-now="in"] while the card is visible: the shell hides the accessory (same info) while the bar is expanded.
  useEffect(() => {
    const el = ref.current, root = document.documentElement;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) root.dataset.now = "in"; else delete root.dataset.now; }, { threshold: 0.25 });
    io.observe(el);
    return () => { io.disconnect(); delete root.dataset.now; };
  }, []);

  const liveName = live ? (live.kind === "live" ? m("nowCard.live") : m("nowCard.game")) : "";
  const cls = live ? null : p.cls ?? null;
  const eyebrow = live ? m("nowCard.eyebrow.live", { name: liveName, time: hm(live.end) }) : cls ? m("nowCard.eyebrow.class", { time: hm(cls.end) }) : m("nowCard.eyebrow.now", { clock: p.clock, start: hm(phase.start), end: hm(phase.end) });
  const title = live ? live.item.title : cls ? cls.item.title : phase.label;
  const tip = live ? live.item.sub || phase.tip : cls ? cls.item.sub : phase.tip;
  const onAir = !!live && !!next && next.id === live.item.id;
  return (
    <section ref={ref} className="nowcard" data-variant={p.variant} aria-label={m("nowCard.aria")} style={{ ["--phase" as string]: p.tone }}>
      <div className="nowcard-head">
        <div className="nowcard-text">
          <div className="nowcard-eyebrow num">{eyebrow}</div>
          {/* Keyed on the phase (or block): cross-fades only when it changes, never on the 15 s tick. */}
          <div key={live ? live.item.id : cls ? cls.item.id : phase.key} className="nowcard-swap">
            <div className="nowcard-phase">{title}</div>
            {tip && <div className="nowcard-tip">{tip}</div>}
          </div>
        </div>
        <Arc progress={p.progress} left={p.left} />
      </div>
      {next ? (
        <div className="nowcard-next">
          <div key={next.id} className={`nowcard-item ${next.id !== p.firstNextId ? "next-in" : ""}`}>
            {onAir ? (
              // The running block's own start item: the head already shows its title, so only ask for the tick.
              <div className="nowcard-label">{m("nowCard.onAir", { name: liveName })}</div>
            ) : (
              <>
                <div className="nowcard-label">
                  {m("nowCard.next", { time: hm(next.min), cd: countdown(next.min - p.nowMin), moved: next.planMin !== undefined ? m("nowCard.moved", { time: hm(next.planMin) }) : "" })}
                </div>
                <div className="nowcard-title">{next.title}</div>
                {p.nextSub && <div className="nowcard-sub">{p.nextSub}</div>}
                {p.nextCue && <div className="nowcard-sub">{m("nowCard.cue", { cue: p.nextCue })}</div>}
                {p.micro && <div className="nowcard-micro">{p.micro}</div>}
              </>
            )}
          </div>
          <div className="nowcard-actions">
            {p.onLater && !onAir && canReschedule(next) && (
              <button type="button" className="nowcard-later" aria-label={m("nowCard.aria.later", { title: next.title })} onClick={p.onLater}><IconClock size={20} /></button>
            )}
            <Tap className="nowcard-check" label={m("nowCard.aria.check", { title: next.title })} onTap={p.onCheck}><IconCheck size={26} /></Tap>
          </div>
        </div>
      ) : (
        <div className={`nowcard-end ${p.won ? "won" : ""}`}>
          <div className="nowcard-label">{p.pendingCount ? m("nowCard.end.over") : m("nowCard.end.all")}</div>
          <div className="nowcard-title">{m("nowCard.end.count", { done: p.doneCount, total: p.total })}</div>
          <div className="nowcard-sub">{p.pendingCount ? m("nowCard.end.pending", { n: p.pendingCount }) : m("nowCard.end.rest")}</div>
        </div>
      )}
      {p.action && (
        <div className="nowcard-action">
          <button type="button" className="chip" onClick={p.action.onTap}>{p.action.label}</button>
        </div>
      )}
    </section>
  );
}
