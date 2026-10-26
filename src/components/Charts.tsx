"use client";

// v1.8 chart primitives (spec in src/lib/chart.ts). Colors come only from CSS vars: `area` renders data-area (the
// [data-area] -> --tone map in globals.css) and `tone` sets --tone directly. Every chart is role="img" with a text summary.
import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import type { AreaKey } from "@/lib/brain/types";
import type { Cell } from "@/lib/bands";
import { CH, areaPath, barGap, barPct, enough, goalLabelLeft, linePath, niceExtent, scale, seriesSummary } from "@/lib/chart";
import { motionOff } from "./ui";
import { fmt, msgs } from "@/i18n";
import * as C from "@/i18n/msg/components";

const m = msgs(C);

type Tone = { area?: AreaKey | "water"; tone?: string };
const toneStyle = (tone?: string, extra?: Record<string, string | number>): CSSProperties | undefined =>
  tone || extra ? ({ ...(tone ? { ["--tone" as string]: tone } : {}), ...extra } as CSSProperties) : undefined;
const shortDate = (d: string) => fmt.dayMonth(d);

// Tiny trend line: 2px round line, last point dot + halo. 0 points renders nothing (inline use); 1 point only the dot.
export function Sparkline({ values, label, area, tone, w = CH.spark.w, h = CH.spark.h, unit, decimals, domain }: Tone & {
  values: number[]; label: string; w?: number; h?: number; unit?: string; decimals?: number; domain?: [number, number];
}) {
  if (!values.length) return null;
  const pad = CH.spark.pad;
  const d: [number, number] = domain ?? [Math.min(...values), Math.max(...values)];
  const y = scale(d, [h - pad, pad]);
  const x = (i: number) => (values.length < 2 ? w - pad - CH.halo : pad + (i * (w - 2 * pad - CH.halo)) / (values.length - 1));
  const pts = values.map((v, i): [number, number] => [x(i), y(v)]);
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg className="spark ch" width={w} height={h} viewBox={`0 0 ${w} ${h}`} data-area={area} style={toneStyle(tone)} role="img"
      aria-label={seriesSummary({ label, values, unit, decimals })}>
      {pts.length > 1 && <path className="ch-line" d={linePath(pts)} />}
      <circle className="ch-halo" cx={lx} cy={ly} r={CH.dot + CH.halo} />
      <circle className="ch-dot" cx={lx} cy={ly} r={CH.dot} />
    </svg>
  );
}

// Vertical bars with an optional dashed goal line. goodAt can vary per bar (e.g. each day's own water goal);
// null bars are muted stubs. regrow: replay the grow-in after a range switch on this visit ([data-first] covers the first).
export function BarChart({ values, max, goal, goodAt, area, tone, label, axis, regrow, unit, decimals }: Tone & {
  values: (number | null)[]; max: number; goal?: number; goodAt?: number | ((i: number) => number); label: string;
  axis?: [string, string]; regrow?: boolean; unit?: string; decimals?: number;
}) {
  const good = (v: number, i: number) => goodAt !== undefined && v >= (typeof goodAt === "function" ? goodAt(i) : goodAt);
  return (
    <>
      <div className={`chart ${regrow ? "regrow" : ""}`} data-area={area} role="img" aria-label={seriesSummary({ label, values, unit, decimals })}
        style={toneStyle(tone, { gap: `${barGap(values.length)}px`, "--bstep": `${Math.min(30, 360 / Math.max(1, values.length))}ms` })}>
        {values.map((v, i) => (
          <span key={i} className={`bar ${v === null ? "muted" : good(v, i) ? "good" : ""}`} style={{ height: `${barPct(v, max)}%`, ["--bi" as string]: i }} />
        ))}
        {goal !== undefined && <span className="goal" style={{ bottom: `${Math.min(100, (goal / max) * 100)}%` }} />}
      </div>
      {axis && <div className="chart-axis" aria-hidden><span>{axis[0]}</span><span>{axis[1]}</span></div>}
    </>
  );
}

// Horizontal bar row: label, fill (0..max) and its text. Also the Ready breakdown row.
export function BarRow({ label, value, max, text, area, tone }: Tone & { label: string; value: number; max: number; text: string }) {
  return (
    <div className="hbar" data-area={area}>
      <span className="hbar-label">{label}</span>
      <span className="hbar-track" aria-hidden><span className="hbar-fill fill-x grow" style={toneStyle(tone, { "--p": max ? Math.max(0, Math.min(1, value / max)) : 0 })} /></span>
      <span className="hbar-val">{text}</span>
    </div>
  );
}

// Trend line with raw dots, a soft area fill, min/max labels, 3 dates, a dashed goal (when within reach) and the last value.
// The line draws in on the first visit ([data-first]) and after a range switch (regrow). Fewer than 2 points -> `empty`.
export function TrendLine({ points, goal, unit, label, regrow, empty, area, tone, step = 0.5 }: Tone & {
  points: { date: string; v: number; raw?: number }[]; goal?: number; unit: string; label: string; regrow?: boolean; empty?: ReactNode; step?: number;
}) {
  const gid = useId().replace(/:/g, "");
  if (!enough("line", points.length).ok) return <>{empty ?? null}</>;
  const { w, h, padL, padR, padT, padB } = CH.line;
  const all = points.flatMap((p) => (p.raw === undefined ? [p.v] : [p.v, p.raw]));
  const lo = Math.min(...all), hi = Math.max(...all);
  const showGoal = goal !== undefined && goal >= lo && goal <= hi + 3;
  const [min, max] = niceExtent(all, { step, pad: step, include: showGoal ? [goal] : [] });
  const x = scale([0, points.length - 1], [padL, w - padR]);
  const y = scale([min, max], [h - padB, padT]);
  const pts = points.map((p, i): [number, number] => [x(i), y(p.v)]);
  const last = points[points.length - 1], [lx, ly] = pts[pts.length - 1];
  const mid = Math.floor((points.length - 1) / 2);
  const summary = m("charts.trend.summary", { summary: seriesSummary({ label, values: points.map((p) => p.v), unit, decimals: 1 }), from: shortDate(points[0].date), to: shortDate(last.date), goal: showGoal ? m("charts.trend.goal", { goal }) : "" });
  return (
    <svg className={`wchart ch ${regrow ? "regrow" : ""}`} viewBox={`0 0 ${w} ${h}`} width="100%" height={h} data-area={area} style={toneStyle(tone)} role="img" aria-label={summary}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity={0.28} />
          <stop offset="1" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      <line className="ch-grid" x1={padL} x2={w - padR} y1={y(max)} y2={y(max)} />
      <line className="ch-grid" x1={padL} x2={w - padR} y1={y(min)} y2={y(min)} />
      <text x={padL - 5} y={y(max) + 4} textAnchor="end" className="wlabel">{max.toFixed(1)}</text>
      <text x={padL - 5} y={y(min) + 4} textAnchor="end" className="wlabel">{min.toFixed(1)}</text>
      {showGoal && (
        <g className="wgoal">
          <line className="ch-goal" x1={padL} x2={w - padR} y1={y(goal)} y2={y(goal)} />
          {goalLabelLeft(y(goal), ly)
            ? <text x={padL + 4} y={y(goal) - 3} textAnchor="start" className="wlabel wlabel--goal">{m("charts.goal", { goal })}</text>
            : <text x={w - padR} y={y(goal) - 3} textAnchor="end" className="wlabel wlabel--goal">{m("charts.goal", { goal })}</text>}
        </g>
      )}
      <path className="ch-fill wdots" d={areaPath(pts, y(min))} fill={`url(#${gid})`} />
      <g className="wdots">{points.map((p, i) => (p.raw === undefined ? null : <circle key={p.date} className="ch-raw" cx={x(i)} cy={y(p.raw)} r={2.5} />))}</g>
      <path className="wline ch-line ch-line--lg" pathLength={1} d={linePath(pts)} />
      <g className="wdots">
        <circle className="ch-halo" cx={lx} cy={ly} r={CH.dot + CH.halo} />
        <circle className="ch-dot" cx={lx} cy={ly} r={CH.dot} />
        <text x={lx - 7} y={ly - 7} textAnchor="end" className="wlabel wlabel--last">{last.v.toFixed(1)}</text>
      </g>
      <text x={x(0)} y={h - 4} textAnchor="start" className="wlabel">{shortDate(points[0].date)}</text>
      {mid > 0 && mid < points.length - 1 && <text x={x(mid)} y={h - 4} textAnchor="middle" className="wlabel">{shortDate(points[mid].date)}</text>}
      <text x={x(points.length - 1)} y={h - 4} textAnchor="end" className="wlabel">{shortDate(last.date)}</text>
    </svg>
  );
}

// One track + fill circle pair (shared by ProgressRing and RingStack). value 0..1, clamped like the v1.x rings.
function Arc({ c0, r, width, value, track, tone, style }: { c0: number; r: number; width: number; value: number; track?: string; tone?: string; style?: CSSProperties }) {
  const c = 2 * Math.PI * r;
  return (
    <>
      <circle className="ch-ring-track" cx={c0} cy={c0} r={r} strokeWidth={width} style={track ? ({ ["--ring-track" as string]: track } as CSSProperties) : undefined} />
      <circle className="ch-ring-bar" cx={c0} cy={c0} r={r} strokeWidth={width} strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
        style={{ ...(tone ? { ["--tone" as string]: tone } : {}), ...style } as CSSProperties} />
    </>
  );
}

// Progress ring: SVG track + fill with round caps from 12 o'clock; the fill eases on change (still = no transition).
export function ProgressRing({ value, size = 44, width = 5, area, tone, track, label, children, still, className = "" }: Tone & {
  value: number; size?: number; width?: number; track?: string; label?: string; children?: ReactNode; still?: boolean; className?: string;
}) {
  const c0 = size / 2;
  return (
    <span className={`ch-ring ${className}`} data-area={area} data-still={still || undefined} style={toneStyle(tone, { width: `${size}px`, height: `${size}px` })}
      {...(label ? { role: "img", "aria-label": label } : {})}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden focusable="false">
        <g transform={`rotate(-90 ${c0} ${c0})`}><Arc c0={c0} r={c0 - width / 2 - 1.5} width={width} value={value} track={track} /></g>
      </svg>
      {children}
    </span>
  );
}

// Apple Fitness style activity rings (food, body, habit). values 0..1 (clamped). They sweep in from 0 on first render
// with the v1.x 1 s staggered timing unless motion is reduced, in which case they render at their final value.
export function RingStack({ values, size = 120 }: { values: [number, number, number]; size?: number }) {
  const [shown, setShown] = useState(false);
  const [still, setStill] = useState(false);
  useEffect(() => {
    if (motionOff()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStill(true);
      setShown(true);
      return;
    }
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const tones = ["var(--ring-food)", "var(--ring-body)", "var(--ring-habit)"];
  const stroke = size * 0.11, gap = stroke * 1.1, c0 = size / 2;
  return (
    <svg className="ch-stack" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden focusable="false">
      {/* Start at 12 o'clock via an inner group, so a CSS transform on the svg (day-complete glow) scales around the center. */}
      <g transform={`rotate(-90 ${c0} ${c0})`}>
        {values.map((v, i) => (
          <Arc key={i} c0={c0} r={c0 - stroke / 2 - i * gap} width={stroke} value={shown ? v : 0} tone={tones[i]} track={`color-mix(in oklch, ${tones[i]} 22%, transparent)`}
            style={{ transition: still ? "none" : `stroke-dashoffset 1s cubic-bezier(0.2, 0.9, 0.3, 1) ${i * 0.08}s` }} />
        ))}
      </g>
    </svg>
  );
}

// Consistency band: one dot per day, oldest first. hit = filled tone; miss = neutral outline (never red);
// off = faint dash (rest, sick, not planned); none = empty; today = ring outline (not counted yet).
export function Band({ cells, area, label, size = "md" }: { cells: Cell[]; area?: AreaKey | "water"; label: string; size?: "md" | "sm" }) {
  const hit = cells.filter((c) => c === "hit").length, elig = hit + cells.filter((c) => c === "miss").length;
  return (
    <span className={`ch-band ch-band--${size}`} data-area={area} role="img" aria-label={`${label} ${elig ? m("charts.band.days", { hit, elig }) : m("charts.band.none")}`}>
      {cells.map((c, i) => <i key={i} className={`c-${c}`} />)}
    </span>
  );
}

// 13-week style heatmap: columns are weeks, rows are weekdays (padded from the first date's weekday); tap opens a day.
export function Heatmap({ days, onPick }: { days: { date: string; level: 0 | 1 | 2 | 3 | 4; label: string; today: boolean }[]; onPick: (date: string) => void }) {
  if (!days.length) return null;
  const pad = new Date(days[0].date + "T12:00:00").getDay();
  return (
    <div className="heatmap" role="group" aria-label={m("charts.heatmap.aria")} style={{ gridTemplateColumns: `repeat(${Math.ceil((days.length + pad) / 7)}, 1fr)` }}>
      {Array.from({ length: pad }, (_, i) => <span key={`p${i}`} className="heat-pad" />)}
      {days.map((d) => <button key={d.date} className={`${d.level ? `l${d.level}` : ""} ${d.today ? "today" : ""}`} aria-label={d.label} onClick={() => onPick(d.date)} />)}
    </div>
  );
}

// Card-level empty chart: a faint static ghost of the chart kind, one line and at most one action.
export function ChartEmpty({ kind, text, action }: { kind: "line" | "bars" | "ring"; text: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="ch-empty">
      <svg className="ch-ghost" viewBox="0 0 120 48" width="120" height="48" aria-hidden focusable="false">
        {kind === "line" && <path d="M4 32H116" />}
        {kind === "bars" && [0, 1, 2, 3, 4, 5, 6].map((i) => <rect key={i} x={6 + i * 16} y={20 + ((i * 7) % 3) * 6} width={10} height={28 - ((i * 7) % 3) * 6} rx={2} />)}
        {kind === "ring" && <circle cx="60" cy="24" r="18" />}
      </svg>
      <div className="ch-empty-text">{text}</div>
      {action && <button type="button" className="btn empty-btn" onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}
