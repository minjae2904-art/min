"use client";

import type { ReactNode } from "react";

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

export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label={title}>
        <div className="grabber" />
        <div className="sheet-title">{title}</div>
        {children}
      </div>
    </>
  );
}

export function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button className={`switch ${on ? "on" : ""}`} role="switch" aria-checked={on} onClick={() => onChange(!on)} />;
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="segmented">
      {options.map(([v, label]) => (
        <button key={v} className={v === value ? "on" : ""} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}
