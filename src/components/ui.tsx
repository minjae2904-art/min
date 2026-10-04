"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { play } from "@/lib/sound";

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

// iOS sheet: slides up, drag the grabber/header down to dismiss, animates out before unmounting.
export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const [dy, setDy] = useState(0);
  const start = useRef<number | null>(null);

  if (open && !mounted) { setMounted(true); setClosing(false); }
  if (!open && mounted && !closing) setClosing(true);

  useEffect(() => {
    if (open) play("open");
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
      <div className={`sheet-backdrop ${closing ? "out" : ""}`} onClick={close} style={{ opacity: closing ? undefined : Math.max(0.2, 1 - dy / 400) }} />
      <div
        className={`sheet ${closing ? "out" : ""}`}
        role="dialog"
        aria-label={title}
        style={dy ? { transform: `translateY(${dy}px)`, transition: "none" } : undefined}
      >
        <div className="sheet-drag" {...drag}>
          <div className="grabber" />
          <div className="sheet-title">{title}</div>
        </div>
        {children}
      </div>
    </>
  );
}

export function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button className={`switch ${on ? "on" : ""}`} role="switch" aria-checked={on} onClick={() => { play("toggle"); onChange(!on); }} />;
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  const i = Math.max(0, options.findIndex(([v]) => v === value));
  return (
    <div className="segmented" style={{ ["--n" as string]: options.length, ["--i" as string]: i }}>
      <span className="seg-thumb" />
      {options.map(([v, label]) => (
        <button key={v} className={v === value ? "on" : ""} onClick={() => { if (v !== value) { play("tap"); onChange(v); } }}>{label}</button>
      ))}
    </div>
  );
}

// Number that eases to its new value (Apple Fitness style).
export function CountUp({ value, decimals = 0, duration = 700 }: { value: number; decimals?: number; duration?: number }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
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

// Lightweight toast bus: toast("...") from anywhere, <Toaster /> renders it.
export function toast(msg: string) {
  window.dispatchEvent(new CustomEvent("krob-toast", { detail: msg }));
}

export function Toaster() {
  const [items, setItems] = useState<{ id: number; msg: string }[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const id = Date.now() + Math.random();
      setItems((x) => [...x.slice(-2), { id, msg: (e as CustomEvent<string>).detail }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3200);
    };
    window.addEventListener("krob-toast", on);
    return () => window.removeEventListener("krob-toast", on);
  }, []);
  return (
    <div className="toaster" aria-live="polite">
      {items.map((t) => <div key={t.id} className="toast">{t.msg}</div>)}
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
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
          {backLabel}
        </a>
      </div>
      <h1 className="large-title">{title}</h1>
      {sub ? <div className="subtitle">{sub}</div> : <div style={{ height: 14 }} />}
    </>
  );
}
