"use client";

// DOM side of the gestures: pointer handlers feeding the pure decisions in lib/gesture.ts.
// Gesture state lives in refs (no React state per pointermove); results commit on pointerup so haptics can fire.
import { useEffect, useRef, useState, type RefObject } from "react";
import { LONG_PRESS, PRESS0, axisLock, pressStep, swipeOffset, swipeResult, swipeStage, velocity, type Press, type PressEv } from "@/lib/gesture";
import { motionOff } from "./ui";

export type Bind = Partial<Pick<React.DOMAttributes<HTMLElement>,
  "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel" | "onContextMenu" | "onClickCapture">>;

// One passive, capturing scroll listener for the whole app: a touch that stops a momentum scroll never arms a long-press.
let lastScroll = -1e9, scrollHooked = false;
function hookScroll() {
  if (scrollHooked || typeof window === "undefined") return;
  scrollHooked = true;
  window.addEventListener("scroll", () => { lastScroll = performance.now(); }, { passive: true, capture: true });
}
const scrollAge = () => performance.now() - lastScroll;
const secondary = (e: React.PointerEvent) => e.pointerType === "mouse" && e.button !== 0;

export function useLongPress(onLong: () => void, o: { disabled?: boolean } = {}): { armed: boolean; bind: Bind } {
  const press = useRef<Press>(PRESS0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cb = useRef(onLong);
  const [armed, setArmed] = useState(false);
  useEffect(() => { cb.current = onLong; });
  useEffect(() => { hookScroll(); return () => clearTimeout(timer.current); }, []);
  const step = (e: PressEv) => { const r = pressStep(press.current, e); press.current = r.s; return r; };
  const reset = () => { clearTimeout(timer.current); setArmed(false); };
  const bind: Bind = {
    onPointerDown: (e) => {
      if (o.disabled || secondary(e)) return;
      clearTimeout(timer.current);
      step({ t: "down", x: e.clientX, y: e.clientY, now: performance.now(), scrollAge: scrollAge() });
      if (press.current.st !== "down") return;
      timer.current = setTimeout(() => { if (step({ t: "arm" }).s.st === "armed") setArmed(true); }, LONG_PRESS.ms);
    },
    onPointerMove: (e) => {
      if (press.current.st === "idle") return;
      if (step({ t: "move", x: e.clientX, y: e.clientY }).s.st === "idle") reset();
    },
    // onLong runs inside pointerup (user activation), so play()'s haptic works there.
    onPointerUp: () => { const r = step({ t: "up", now: performance.now() }); reset(); if (r.fire) cb.current(); },
    onPointerCancel: () => { step({ t: "cancel" }); reset(); },
    onContextMenu: (e) => e.preventDefault(),
    // Capture phase: stopPropagation also keeps a Link's or Tap's own onClick from running.
    onClickCapture: (e) => { if (step({ t: "click", now: performance.now() }).swallow) { e.preventDefault(); e.stopPropagation(); } },
  };
  return { armed, bind };
}

type Drag = { id: number; x0: number; y0: number; dx: number; axis: "h" | null; w: number; samples: { t: number; p: number }[] };

export function useSwipe(o: { can: { left: boolean; right: boolean }; onResult: (r: "tick" | "later") => void }): { ref: RefObject<HTMLDivElement | null>; bind: Bind } {
  const ref = useRef<HTMLDivElement | null>(null);
  const drag = useRef<Drag | null>(null);
  const press = useRef<Press>(PRESS0);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const opts = useRef(o);
  useEffect(() => { opts.current = o; });
  useEffect(() => () => clearTimeout(settle.current), []);

  // Snap the face back (CSS transition); the under-layer stays until the face is home.
  const snap = () => {
    const el = ref.current, wrap = el?.parentElement;
    if (!el) return;
    el.classList.remove("dragging");
    el.style.transform = "";
    if (wrap) {
      delete wrap.dataset.stage;
      clearTimeout(settle.current);
      settle.current = setTimeout(() => { delete wrap.dataset.dir; }, motionOff() ? 0 : 320); // 320 = --dur-3 snap
    }
  };
  const end = (e: React.PointerEvent, commit: boolean) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.axis !== "h" || e.pointerId !== d.id) return;
    press.current = pressStep(press.current, { t: "drag", now: performance.now() }).s; // swallow only the click right after
    const r = commit ? swipeResult(d.dx, velocity(d.samples), d.w, opts.current.can) : null;
    snap();
    if (r) opts.current.onResult(r);
  };

  const bind: Bind = {
    onPointerDown: (e) => {
      if (secondary(e)) return;
      press.current = pressStep(press.current, { t: "down", x: e.clientX, y: e.clientY, now: performance.now(), scrollAge: Infinity }).s;
      drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, axis: null, w: ref.current?.offsetWidth ?? 0, samples: [{ t: e.timeStamp, p: e.clientX }] };
    },
    onPointerMove: (e) => {
      const d = drag.current, el = ref.current;
      if (!d || !el || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x0;
      if (!d.axis) {
        const a = axisLock(dx, e.clientY - d.y0);
        if (a === "v") { drag.current = null; return; } // native scroll (the face is touch-action: pan-y)
        if (!a) return;
        d.axis = "h";
        try { el.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
        el.classList.add("dragging");
        clearTimeout(settle.current);
      }
      d.dx = dx;
      d.samples.push({ t: e.timeStamp, p: e.clientX });
      if (d.samples.length > 12) d.samples.shift();
      const can = opts.current.can;
      el.style.transform = `translateX(${swipeOffset(dx, can)}px)`;
      const wrap = el.parentElement;
      if (wrap) {
        if (dx) wrap.dataset.dir = dx > 0 ? "right" : "left"; else delete wrap.dataset.dir;
        if (swipeStage(dx, d.w, can) === "over") wrap.dataset.stage = "over"; else delete wrap.dataset.stage;
      }
    },
    onPointerUp: (e) => end(e, true),
    onPointerCancel: (e) => end(e, false),
    onClickCapture: (e) => {
      const r = pressStep(press.current, { t: "click", now: performance.now() });
      press.current = r.s;
      if (r.swallow) { e.preventDefault(); e.stopPropagation(); }
    },
  };
  return { ref, bind };
}

// Combine handler maps: every handler of the same name runs, in argument order.
export function mergeBind<T extends object>(...binds: T[]): T {
  const out: Record<string, (...a: unknown[]) => void> = {};
  for (const b of binds) {
    for (const [k, f] of Object.entries(b)) {
      if (typeof f !== "function") continue;
      const prev = out[k];
      out[k] = prev ? (...a) => { prev(...a); (f as (...a: unknown[]) => void)(...a); } : (f as (...a: unknown[]) => void);
    }
  }
  return out as T;
}
