"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconBack, IconChevron } from "@/components/Icons";
import { SHEET, sheetOffset, sheetRelease, velocity, type Detent } from "@/lib/gesture";
import { hapticsEnabled, play } from "@/lib/sound";
import { msgs } from "@/i18n";
import { useLang } from "@/i18n/react";
import * as C from "@/i18n/msg/components";
import * as Common from "@/i18n/msg/common";

const m = msgs(C), c = msgs(Common);

// True when the user or the OS asked for no motion; checked at animation start (client only).
export const motionOff = () =>
  typeof document !== "undefined" && (document.documentElement.dataset.motion === "off" || matchMedia("(prefers-reduced-motion: reduce)").matches);

export function Section({ header, footer, children, id }: { header?: string; footer?: string; children: ReactNode; id?: string }) {
  return (
    <div className="section" id={id}>
      {header && <div className="section-header">{header}</div>}
      <div className="group">{children}</div>
      {footer && <div className="section-footer">{footer}</div>}
    </div>
  );
}

// Data color arrives as --tone; .tile paints the gradient from it.
export function Tile({ color, children }: { color: string; children: ReactNode }) {
  return <span className="tile" style={{ ["--tone" as string]: color }}>{children}</span>;
}

const NATIVE_TAP = true; // one-line kill switch: false renders a plain <button>

// Main tap target. On iOS 18+ a label over a hidden <input switch> plays the native haptic on the user's own tap;
// the JS haptic from play() still runs (a doubled tick beats none). [verify on device]
// bind = extra handlers (long-press) spread before Tap's own, so the label keeps the native haptic.
export function Tap({ className = "", onTap, pressed, label, disabled, children, bind }: {
  className?: string; onTap: () => void; pressed?: boolean; label?: string; disabled?: boolean; children: ReactNode; bind?: React.HTMLAttributes<HTMLElement>;
}) {
  const aria = { "aria-pressed": pressed, "aria-label": label, "aria-disabled": disabled || undefined };
  const onKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!disabled) onTap(); } };
  if (!NATIVE_TAP) return <button type="button" {...bind} className={`tap ${className}`} {...aria} onClick={() => { if (!disabled) onTap(); }}>{children}</button>;
  const onClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return; // the synthetic click the label forwards to its input
    if (disabled) { e.preventDefault(); return; }
    if (!hapticsEnabled()) e.preventDefault(); // no native toggle, so no native haptic
    onTap();
  };
  return (
    <label {...bind} className={`tap ${className}`} role="button" tabIndex={0} {...aria} onClick={onClick} onKeyDown={onKeyDown}>
      <input type="checkbox" className="tap-switch" tabIndex={-1} aria-hidden ref={(el) => el?.setAttribute("switch", "")} />
      {children}
    </label>
  );
}

// Disclosure chevron at the end of a tappable row.
export const Chev = () => <span className="chev" aria-hidden><IconChevron size={16} weight={2.4} /></span>;

// iOS sheet with two detents. Portaled into #sheet-root (out of transformed/isolated ancestors) unless inline.
// Drag the header down to dismiss or step down; at medium, drag up (or tap the grabber) for large when content overflows.
// Drag offsets are written straight to the DOM through refs; the close animates out before unmounting.
export function Sheet({ open, title, onClose, children, detent = "large", inline }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode;
  detent?: Detent; // initial detent; a medium sheet can be pulled (or grabber-tapped) to large when its content overflows
  inline?: boolean; // render in place instead of the portal (lock screen, z-98 shell layer)
}) {
  useLang(); // sheets also render outside the keyed subtree (lock screen, z-98 layer): re-render on a language switch
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  const [cur, setCur] = useState<Detent>(detent);
  const [overflow, setOverflow] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; y0: number; dy: number; moved: boolean; samples: { t: number; p: number }[] } | null>(null);
  const noClickUntil = useRef(0);
  const flipFrom = useRef<number | null>(null);
  const entering = useRef(false);

  // Render-time adjust: every open starts at the requested detent; a close while mounted plays the exit.
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) { setMounted(true); setClosing(false); setCur(detent); } else if (mounted) setClosing(true);
  }

  // Move focus into the dialog (unless an autoFocus input already took it) and give it back on close if that node still exists.
  useEffect(() => {
    if (!open) return;
    play("open");
    entering.current = true;
    const t = setTimeout(() => { entering.current = false; }, motionOff() ? 0 : 500); // 500 = --dur-4 sheet-in
    const el = box.current, prev = document.activeElement as HTMLElement | null;
    if (el) { el.style.transform = ""; el.style.transition = ""; }
    if (backdrop.current) backdrop.current.style.opacity = "";
    if (!el || el.contains(prev)) return () => clearTimeout(t);
    el.focus({ preventScroll: true });
    return () => {
      clearTimeout(t);
      // Give focus back only if it is still in this sheet (or nowhere): a sheet opened in the same commit keeps its own.
      const a = document.activeElement;
      if (prev?.isConnected && (!a || a === document.body || el.contains(a))) prev.focus?.({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(() => { setMounted(false); setClosing(false); }, motionOff() ? 0 : 220); // 220 = .sheet.out in globals.css
    return () => clearTimeout(t);
  }, [closing]);

  // Overflow of the scroll area decides whether a medium sheet can expand (ResizeObserver also reports once on observe).
  useEffect(() => {
    const b = body.current, c = content.current;
    if (!mounted || !b || !c || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setOverflow(b.scrollHeight > b.clientHeight + 1));
    ro.observe(b); ro.observe(c);
    return () => ro.disconnect();
  }, [mounted]);

  // FLIP on a detent change: start from the old top, then let .sheet's transform transition run to 0.
  useLayoutEffect(() => {
    const el = box.current, from = flipFrom.current;
    flipFrom.current = null;
    if (!el || from === null) return;
    el.style.transition = "none";
    el.style.transform = "";
    el.style.transform = `translateY(${from - el.getBoundingClientRect().top}px)`;
    void el.offsetHeight;
    const raf = requestAnimationFrame(() => { el.style.transition = ""; el.style.transform = ""; });
    return () => { cancelAnimationFrame(raf); el.style.transition = ""; el.style.transform = ""; };
  }, [cur]);

  if (!mounted) return null;
  const canExpand = cur === "medium" && overflow;
  const toggle: Detent | null = canExpand ? "large" : cur === "large" && detent === "medium" ? "medium" : null;
  const close = () => { play("close"); onClose(); };
  const home = () => {
    const el = box.current;
    if (el) { el.style.transition = ""; el.style.transform = ""; }
    if (backdrop.current) backdrop.current.style.opacity = "";
  };
  const setDetent = (next: Detent) => {
    const el = box.current;
    if (!el || next === cur) return home();
    if (motionOff() || entering.current) home();
    else flipFrom.current = el.getBoundingClientRect().top;
    if (backdrop.current) backdrop.current.style.opacity = "";
    setCur(next);
  };
  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      drag.current = { id: e.pointerId, y0: e.clientY, dy: 0, moved: false, samples: [{ t: e.timeStamp, p: e.clientY }] };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag.current, el = box.current;
      if (!d || !el || e.pointerId !== d.id) return;
      // sheet-in would override an inline transform: the drag starts from wherever the finger is once the entrance ends.
      if (entering.current) { d.y0 = e.clientY; d.samples = [{ t: e.timeStamp, p: e.clientY }]; return; }
      const dy = e.clientY - d.y0;
      if (!d.moved) {
        if (Math.abs(dy) < SHEET.tapSlop) return; // still a tap (grabber click)
        d.moved = true;
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* pointer gone */ }
      }
      d.dy = dy;
      d.samples.push({ t: e.timeStamp, p: e.clientY });
      if (d.samples.length > 12) d.samples.shift();
      el.style.transition = "none";
      el.style.transform = `translateY(${sheetOffset(dy, cur, canExpand)}px)`;
      // Large sheets dim with the drag; a medium (glass) sheet keeps its backdrop fixed so the blur input does not change per frame.
      if (cur === "large" && backdrop.current) backdrop.current.style.opacity = String(Math.max(0.2, 1 - Math.max(0, dy) / 400));
    },
    onPointerUp: (e: React.PointerEvent) => {
      const d = drag.current, el = box.current;
      drag.current = null;
      if (!d || !el || e.pointerId !== d.id || !d.moved) return;
      noClickUntil.current = performance.now() + 350;
      const r = sheetRelease({ detent: cur, dy: d.dy, v: velocity(d.samples), height: el.offsetHeight, canExpand, hasMedium: detent === "medium" });
      if (r === "close") close(); // the inline offset stays, so sheet-out continues from it
      else setDetent(r);
    },
    onPointerCancel: () => { if (drag.current?.moved) home(); drag.current = null; },
  };

  const node = (
    <>
      <div className={`sheet-backdrop ${closing ? "out" : ""}`} ref={backdrop} aria-hidden onClick={close} />
      <div
        className={`sheet sheet--${cur} ${closing ? "out" : ""}`}
        ref={box}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } }}
      >
        <div className="sheet-drag" {...handlers}>
          {toggle
            ? <button type="button" className="grabber" aria-label={toggle === "large" ? m("ui.aria.expand") : m("ui.aria.collapse")} onClick={() => { if (performance.now() > noClickUntil.current) { play("tap"); setDetent(toggle); } }} />
            : <div className="grabber" aria-hidden />}
          <div className="sheet-title">{title}</div>
          {/* Visible dismiss for people who cannot drag; no autoFocus so the weigh sheet keeps its input focus. */}
          <button className="link sheet-close" onPointerDown={(e) => e.stopPropagation()} onClick={close}>{c("close")}</button>
        </div>
        <div className="sheet-body" ref={body}>
          <div className="sheet-content" ref={content}>{children}</div>
        </div>
      </div>
    </>
  );
  if (inline || typeof document === "undefined") return node;
  return createPortal(node, sheetRoot());
}

// Portal target, created on first use so the container is stable from a sheet's first render (Gate only toggles inert on it).
export function sheetRoot(): HTMLElement {
  let el = document.getElementById("sheet-root");
  if (!el) { el = document.createElement("div"); el.id = "sheet-root"; document.body.appendChild(el); }
  return el;
}

// Confirmation built on Sheet: red (danger) or blue confirm + cancel. Replaces window.confirm().
export function ConfirmSheet({ open, title, body, confirmLabel = c("confirm"), danger, onConfirm, onClose, inline }: {
  open: boolean; title: string; body?: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onClose: () => void; inline?: boolean;
}) {
  return (
    <Sheet open={open} title={title} onClose={onClose} detent="medium" inline={inline}>
      {body && <p className="confirm-body">{body}</p>}
      <div className="confirm-actions">
        <button className={`btn ${danger ? "danger" : ""}`} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
        <button className="btn secondary" onClick={() => { play("close"); onClose(); }}>{c("cancel")}</button>
      </div>
    </Sheet>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <button className={`switch ${on ? "on" : ""}`} role="switch" aria-checked={on} aria-label={label} onClick={() => { play("toggle"); onChange(!on); }} />;
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label?: string }) {
  const i = Math.max(0, options.findIndex(([v]) => v === value));
  return (
    <div className="segmented" role="radiogroup" aria-label={label} style={{ ["--n" as string]: options.length, ["--i" as string]: i }}>
      <span className="seg-thumb" aria-hidden />
      {options.map(([v, text]) => (
        <button key={v} role="radio" aria-checked={v === value} className={v === value ? "on" : ""} onClick={() => { if (v !== value) { play("tap"); onChange(v); } }}>{text}</button>
      ))}
    </div>
  );
}

// Number that eases to its new value (Apple Fitness style). Jumps straight there under reduced motion.
export function CountUp({ value, decimals = 0, duration = 700 }: { value: number; decimals?: number; duration?: number }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (motionOff()) {
      from.current = value;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShown(value);
      return;
    }
    const a = from.current, b = value, t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const v = a + (b - a) * (1 - Math.pow(1 - p, 3));
      setShown(v);
      from.current = v;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{shown.toFixed(decimals)}</>;
}

// v1.8 digit roller: tabular-nums strips (0-9 stacked, one line high) slide to the new digit; digits are keyed from the
// right so 9 -> 10 rolls the ones. The invisible ghost copy sets width and baseline; strips are aria-hidden with an
// sr-only copy. No roll on first render (data-on is set after mount); reduced motion = instant (global kill rules).
export function RollNum({ value, decimals = 0, label }: { value: number; decimals?: number; label?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => { if (ref.current) ref.current.dataset.on = "1"; });
    return () => cancelAnimationFrame(id);
  }, []);
  const text = (Number.isFinite(value) ? value : 0).toFixed(decimals);
  const ch = text.split("");
  return (
    <span className="roll" ref={ref}>
      <span className="roll-ghost" aria-hidden>{text}</span>
      <span className="roll-strips" aria-hidden>
        {ch.map((c, i) => {
          const k = ch.length - 1 - i;
          return /\d/.test(c) ? (
            <span key={k} className="roll-d"><span className="roll-col" style={{ ["--d" as string]: Number(c) }}>{"0123456789".split("").map((n) => <span key={n}>{n}</span>)}</span></span>
          ) : <span key={`s${k}`} className="roll-s">{c}</span>;
        })}
      </span>
      <span className="sr-only">{label ?? text}</span>
    </span>
  );
}

// v1.8 compact bar for the 4 tab pages: a sticky zero-height layer whose inner bar fades in as the large title collapses
// (scroll-driven, globals.css @supports (animation-timeline: scroll())). Decorative: it swallows taps only while visible, so
// nothing scrolled under the opaque bar fires unseen; hidden (top of the page, motion off) it takes no hits.
export function AppBar({ title }: { title: string }) {
  return <div className="appbar" aria-hidden><div className="appbar-in"><span className="appbar-title">{title}</span></div></div>;
}

// Lightweight toast bus: toast("...", { action, onAction }) from anywhere, <Toaster /> renders it.
// actions = a row of chips under the message (.toast.ask), a tap runs one and dismisses; onExpire = timed out untouched.
export type ToastOpts = { action?: string; onAction?: () => void; ms?: number; actions?: { label: string; onAction: () => void }[]; onExpire?: () => void };
export function toast(msg: string, opts?: ToastOpts) {
  window.dispatchEvent(new CustomEvent<{ msg: string } & ToastOpts>("krob-toast", { detail: { msg, ...opts } }));
}

type ToastItem = { id: number; msg: string; out?: boolean } & ToastOpts;

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  // Plays .toast.out, then removes on a timer (never animationend: motion-off kills the animation).
  const dismiss = (id: number) => {
    clearTimeout(timers.current.get(id));
    const drop = () => { timers.current.delete(id); setItems((x) => x.filter((i) => i.id !== id)); };
    if (motionOff()) return drop();
    setItems((x) => x.map((i) => (i.id === id ? { ...i, out: true } : i)));
    timers.current.set(id, setTimeout(drop, 200));
  };
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ msg: string } & ToastOpts>).detail;
      const id = Date.now() + Math.random();
      setItems((x) => [...x.slice(-2), { id, ...d }]);
      timers.current.set(id, setTimeout(() => { d.onExpire?.(); dismiss(id); }, d.ms ?? (d.action || d.actions ? 5000 : 3200)));
    };
    window.addEventListener("krob-toast", on);
    return () => window.removeEventListener("krob-toast", on);
  }, []);
  return (
    <div className="toaster" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.actions ? "ask" : ""} ${t.out ? "out" : ""}`}>
          <span>{t.msg}</span>
          {t.action && <button className="toast-action" onClick={() => { play("undo"); t.onAction?.(); dismiss(t.id); }}>{t.action}</button>}
          {t.actions && (
            <div className="toast-actions">
              {t.actions.map((a) => <button key={a.label} className="chip" onClick={() => { play("tap"); a.onAction(); dismiss(t.id); }}>{a.label}</button>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Celebration burst when the day is complete. Pure CSS particles.
export function Confetti({ fire }: { fire: number }) {
  if (!fire) return null;
  const colors = ["var(--ring-food)", "var(--ring-body)", "var(--ring-habit)", "var(--orange)", "var(--purple)"];
  // Deterministic pseudo-random (render must stay pure); varies per burst via `fire`.
  const rnd = (i: number, k: number) => { const x = Math.sin(i * 12.9898 + k * 78.233 + fire * 3.7) * 43758.5453; return x - Math.floor(x); };
  return (
    <div className="confetti" key={fire} aria-hidden>
      {Array.from({ length: 28 }, (_, i) => (
        <span key={i} style={{
          ["--x" as string]: `${(rnd(i, 1) - 0.5) * 340}px`,
          ["--y" as string]: `${-120 - rnd(i, 2) * 260}px`,
          ["--r" as string]: `${rnd(i, 3) * 720 - 360}deg`,
          ["--tone" as string]: colors[i % colors.length],
          animationDelay: `${rnd(i, 4) * 0.12}s`,
        }} />
      ))}
    </div>
  );
}

// iOS navigation bar for sub pages: "< ตั้งค่า" back link + large title below.
export function NavBar({ back = "/settings", backLabel = c("settings"), title, sub }: { back?: string; backLabel?: string; title: string; sub?: string }) {
  return (
    <>
      <div className="navbar">
        <a href={back} className="navback" onClick={(e) => { e.preventDefault(); play("nav"); if (history.length > 1) history.back(); else location.href = back; }}>
          <IconBack size={22} weight={2.4} />
          {backLabel}
        </a>
      </div>
      <h1 className="large-title">{title}</h1>
      {sub ? <div className="subtitle">{sub}</div> : <div style={{ height: 14 }} />}
    </>
  );
}
