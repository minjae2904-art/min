// Pure gesture decisions (no DOM): long-press state machine, row swipe, sheet detents, tab bar minimize.
// The DOM hooks live in components/gestures.ts and only feed numbers in here.

export const LONG_PRESS = { ms: 500, slop: 10, swallowMs: 350, scrollQuietMs: 150 };
export const SWIPE = { lock: 10, ratio: 1.2, commitPx: 96, commitFrac: 0.3, flickV: 0.5, flickMin: 40, max: 112, damp: 0.25, offMax: 16 };
export const SHEET = { closePx: 90, closeV: 0.8, flingV: 1.2, expandPx: 60, expandV: 0.5, upTravel: 48, tapSlop: 6 };
export const BAR = { top: 24, minY: 96, down: 32, up: 24, minScroll: 160 };

// ---- press (long-press + click swallowing) ----
export type Press = { st: "idle" | "down" | "armed"; x: number; y: number; swallowUntil: number };
export const PRESS0: Press = { st: "idle", x: 0, y: 0, swallowUntil: 0 };
export type PressEv =
  | { t: "down"; x: number; y: number; now: number; scrollAge: number } | { t: "move"; x: number; y: number }
  | { t: "arm" } | { t: "up"; now: number } | { t: "cancel" } | { t: "drag"; now: number } | { t: "click"; now: number };

// A swallow expires after swallowMs, resets on every down and is spent by one click, so it never eats a later real tap.
export function pressStep(s: Press, e: PressEv): { s: Press; fire?: true; swallow?: true } {
  switch (e.t) {
    case "down": return { s: { st: e.scrollAge < LONG_PRESS.scrollQuietMs ? "idle" : "down", x: e.x, y: e.y, swallowUntil: 0 } };
    case "move": return { s: s.st !== "idle" && Math.hypot(e.x - s.x, e.y - s.y) > LONG_PRESS.slop ? { ...s, st: "idle" } : s };
    case "arm": return { s: s.st === "down" ? { ...s, st: "armed" } : s };
    case "up": return s.st === "armed" ? { s: { ...s, st: "idle", swallowUntil: e.now + LONG_PRESS.swallowMs }, fire: true } : { s: { ...s, st: "idle" } };
    case "cancel": return { s: { ...s, st: "idle", swallowUntil: 0 } };
    case "drag": return { s: { ...s, st: "idle", swallowUntil: e.now + LONG_PRESS.swallowMs } };
    case "click": {
      const r: { s: Press; swallow?: true } = { s: { ...s, swallowUntil: 0 } };
      if (e.now <= s.swallowUntil) r.swallow = true;
      return r;
    }
  }
}

// ---- row swipe ----
export function axisLock(dx: number, dy: number): "h" | "v" | null {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax >= SWIPE.lock && ax > SWIPE.ratio * ay) return "h";
  if (ay >= SWIPE.lock && ay >= ax) return "v";
  return null;
}

// Linear up to limit, damped beyond it; keeps the sign.
export function rubber(x: number, limit: number, damp = SWIPE.damp): number {
  const a = Math.abs(x);
  return Math.sign(x) * (a <= limit ? a : limit + (a - limit) * damp);
}

type Can = { left: boolean; right: boolean };
const enabled = (dx: number, can: Can) => (dx > 0 ? can.right : dx < 0 ? can.left : false);
const commitAt = (width: number) => Math.min(SWIPE.commitPx, SWIPE.commitFrac * width);

// Enabled side follows the finger (rubber past max); a disabled side only nudges a little.
export function swipeOffset(dx: number, can: Can): number {
  if (!dx) return 0;
  return enabled(dx, can) ? rubber(dx, SWIPE.max, SWIPE.damp) : Math.sign(dx) * Math.min(Math.abs(dx) * 0.3, SWIPE.offMax);
}

export function swipeStage(dx: number, width: number, can: Can): "none" | "over" {
  return enabled(dx, can) && Math.abs(dx) >= commitAt(width) ? "over" : "none";
}

// v = signed horizontal velocity in px/ms (+ = right). Right = tick, left = later (snooze).
export function swipeResult(dx: number, v: number, width: number, can: Can): "tick" | "later" | null {
  if (!enabled(dx, can)) return null;
  const a = Math.abs(dx), vs = dx > 0 ? v : -v;
  if (a >= commitAt(width) || (vs >= SWIPE.flickV && a >= SWIPE.flickMin)) return dx > 0 ? "tick" : "later";
  return null;
}

// ---- sheet detents ----
export type Detent = "medium" | "large";

// Down follows the finger; up stretches only at medium with overflowing content, else a small resistance.
export function sheetOffset(dy: number, detent: Detent, canExpand: boolean): number {
  if (dy >= 0) return dy;
  if (detent === "medium" && canExpand) return -rubber(-dy, SHEET.upTravel);
  return -Math.min(12, -dy * SWIPE.damp);
}

// v = px/ms, + = down. hasMedium = the sheet was opened at medium (large can step back down to it).
export function sheetRelease(o: { detent: Detent; dy: number; v: number; height: number; canExpand: boolean; hasMedium: boolean }): Detent | "close" {
  const down = o.dy >= SHEET.closePx || o.v >= SHEET.closeV;
  if (o.detent === "medium") {
    if (down) return "close";
    if ((o.dy <= -SHEET.expandPx || o.v <= -SHEET.expandV) && o.canExpand) return "large";
    return "medium";
  }
  if (o.hasMedium) {
    if (o.dy >= o.height * 0.5 || o.v >= SHEET.flingV) return "close";
    return down ? "medium" : "large";
  }
  return down ? "close" : "large";
}

// ---- tab bar minimize ----
export type Bar = { min: boolean; y: number; acc: number };
export const BAR0: Bar = { min: false, y: 0, acc: 0 };

// acc sums same-direction scroll; minimize after BAR.down px down past minY, restore after BAR.up px up or near the top.
export function barStep(prev: Bar, y: number, maxY: number): Bar {
  const cy = Math.max(0, Math.min(Math.max(0, maxY), y));
  if (maxY < BAR.minScroll || cy <= BAR.top) return { min: false, y: cy, acc: 0 };
  const d = cy - prev.y;
  if (Math.abs(d) < 1) return prev;
  const acc = Math.sign(d) === Math.sign(prev.acc) ? prev.acc + d : d;
  if (!prev.min && cy > BAR.minY && acc >= BAR.down) return { min: true, y: cy, acc: 0 };
  if (prev.min && acc <= -BAR.up) return { min: false, y: cy, acc: 0 };
  return { min: prev.min, y: cy, acc };
}

// Average velocity (px/ms) over the last windowMs of samples; 0 with fewer than two.
export function velocity(samples: { t: number; p: number }[], windowMs = 100): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  const first = samples.find((s) => last.t - s.t <= windowMs) ?? last;
  const dt = last.t - first.t;
  return dt > 0 ? (last.p - first.p) / dt : 0;
}
