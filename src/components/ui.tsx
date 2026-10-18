"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconBack, IconChevron } from "@/components/Icons";
import { play } from "@/lib/sound";

// True when the user or the OS asked for no motion; checked at animation start (client only).
export const motionOff = () =>
  typeof document !== "undefined" && (document.documentElement.dataset.motion === "off" || matchMedia("(prefers-reduced-motion: reduce)").matches);

export function Section({ header, footer, children }: { header?: string; footer?: string; children: ReactNode }) {
  return (
    <div className="section">
      {header && <div className="section-header">{header}</div>}
      <div className="group">{children}</div>
      {footer && <div className="section-footer">{footer}</div>}
    </div>
  );
}

export function Tile({ color, children }: { color: string; children: ReactNode }) {
  return <span className="tile" style={{ background: color }}>{children}</span>;
}

// Disclosure chevron at the end of a tappable row.
export const Chev = () => <span className="chev" aria-hidden><IconChevron size={16} weight={2.4} /></span>;

// iOS sheet: slides up, drag the grabber/header down to dismiss, animates out before unmounting.
export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const [dy, setDy] = useState(0);
  const start = useRef<number | null>(null);
  const box = useRef<HTMLDivElement>(null);

  if (open && !mounted) { setMounted(true); setClosing(false); }
  if (!open && mounted && !closing) setClosing(true);

  // Move focus into the dialog (unless an autoFocus input already took it) and give it back on close.
  useEffect(() => {
    if (!open) return;
    play("open");
    const el = box.current, prev = document.activeElement as HTMLElement | null;
    if (!el || el.contains(prev)) return;
    el.focus({ preventScroll: true });
    return () => prev?.focus?.({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(() => { setMounted(false); setClosing(false); setDy(0); }, 220);
    return () => clearTimeout(t);
  }, [closing]);

  if (!mounted) return null;
  const close = () => { play("close"); onClose(); };
  const drag = {
    onPointerDown: (e: React.PointerEvent) => { start.current = e.clientY; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); },
    onPointerMove: (e: React.PointerEvent) => { if (start.current !== null) setDy(Math.max(0, e.clientY - start.current)); },
    onPointerUp: () => { start.current = null; if (dy > 90) close(); else setDy(0); },
  };

  return (
    <>
      <div className={`sheet-backdrop ${closing ? "out" : ""}`} aria-hidden onClick={close} style={{ opacity: closing ? undefined : Math.max(0.2, 1 - dy / 400) }} />
      <div
        className={`sheet ${closing ? "out" : ""}`}
        ref={box}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } }}
        style={dy ? { transform: `translateY(${dy}px)`, transition: "none" } : undefined}
      >
        <div className="sheet-drag" {...drag}>
          <div className="grabber" />
          <div className="sheet-title">{title}</div>
          {/* Visible dismiss for people who cannot drag; no autoFocus so the weigh sheet keeps its input focus. */}
          <button className="link sheet-close" onPointerDown={(e) => e.stopPropagation()} onClick={close}>ปิด</button>
        </div>
        {children}
      </div>
    </>
  );
}

// Confirmation built on Sheet: red (danger) or blue confirm + cancel. Replaces window.confirm().
export function ConfirmSheet({ open, title, body, confirmLabel = "ยืนยัน", danger, onConfirm, onClose }: {
  open: boolean; title: string; body?: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Sheet open={open} title={title} onClose={onClose}>
      {body && <p className="confirm-body">{body}</p>}
      <div className="confirm-actions">
        <button className={`btn ${danger ? "danger" : ""}`} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
        <button className="btn secondary" onClick={() => { play("close"); onClose(); }}>ยกเลิก</button>
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

// Lightweight toast bus: toast("...", { action, onAction }) from anywhere, <Toaster /> renders it.
export type ToastOpts = { action?: string; onAction?: () => void; ms?: number };
export function toast(msg: string, opts?: ToastOpts) {
  window.dispatchEvent(new CustomEvent<{ msg: string } & ToastOpts>("krob-toast", { detail: { msg, ...opts } }));
}

type ToastItem = { id: number; msg: string } & ToastOpts;

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const dismiss = (id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((x) => x.filter((i) => i.id !== id));
  };
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ msg: string } & ToastOpts>).detail;
      const id = Date.now() + Math.random();
      setItems((x) => [...x.slice(-2), { id, ...d }]);
      timers.current.set(id, setTimeout(() => dismiss(id), d.ms ?? (d.action ? 5000 : 3200)));
    };
    window.addEventListener("krob-toast", on);
    return () => window.removeEventListener("krob-toast", on);
  }, []);
  return (
    <div className="toaster" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="toast">
          <span>{t.msg}</span>
          {t.action && <button className="toast-action" onClick={() => { play("undo"); t.onAction?.(); dismiss(t.id); }}>{t.action}</button>}
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
          background: colors[i % colors.length],
          animationDelay: `${rnd(i, 4) * 0.12}s`,
        }} />
      ))}
    </div>
  );
}

// iOS navigation bar for sub pages: "< ตั้งค่า" back link + large title below.
export function NavBar({ back = "/settings", backLabel = "ตั้งค่า", title, sub }: { back?: string; backLabel?: string; title: string; sub?: string }) {
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
