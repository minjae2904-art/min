"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Chev, Sheet } from "@/components/ui";
import { play } from "@/lib/sound";
import { arrangeNotices, type NoticeKey } from "@/lib/today";
import { msgs } from "@/i18n";
import * as C from "@/i18n/msg/components-today";
import * as Common from "@/i18n/msg/common";

const m = msgs(C), c = msgs(Common);

// One Today notice. body = a sheet behind the pill (stream / intro): the whole pill opens it; close() shuts it.
export type Notice = {
  key: NoticeKey; text: string; tone: "warn" | "accent" | "neutral"; icon?: ReactNode; status?: boolean;
  act?: { label: string; href?: string; onAct?: () => void }; onDismiss?: () => void;
  sheet?: { title: string; body: (close: () => void) => ReactNode };
};

function Pill({ n, onOpen }: { n: Notice; onOpen: (n: Notice) => void }) {
  const cls = `notice notice--${n.tone}`;
  const icon = n.icon ? <span className="notice-icon" aria-hidden>{n.icon}</span> : null;
  if (n.sheet) {
    return (
      <button type="button" className={cls} onClick={() => onOpen(n)}>
        {icon}<span className="notice-text">{n.text}</span><Chev />
      </button>
    );
  }
  const { act } = n;
  return (
    <div className={cls} role={n.status ? "status" : undefined}>
      {icon}
      <span className="notice-text">{n.text}</span>
      {act && (act.href
        ? <Link href={act.href} className="notice-act" onClick={() => play("nav")}>{act.label}</Link>
        : <button type="button" className="notice-act" onClick={act.onAct}>{act.label}</button>)}
      {n.onDismiss && <button type="button" className="notice-x" aria-label={c("close")} onClick={() => { play("tap"); n.onDismiss?.(); }}>x</button>}
    </div>
  );
}

// One slot under the header (spec 8.3): priority order, at most 2 pills; past that the first one plus "อีก N เรื่อง",
// which lists every notice in a sheet. daymsg shows only when it is alone.
export function NoticeSlot({ notices }: { notices: Notice[] }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [openKey, setOpenKey] = useState<NoticeKey | null>(null);
  // The last opened sheet stays rendered through its exit, even after its notice is answered and leaves the list.
  const [last, setLast] = useState<Notice | null>(null);
  const { shown, more } = arrangeNotices(notices, 2);
  const live = notices.find((n) => n.key === openKey && n.sheet) ?? last;
  const open = (n: Notice) => { setLast(n); setOpenKey(n.key); }; // Sheet plays "open"
  const close = () => setOpenKey(null);
  if (!shown.length && !last && !moreOpen) return null;
  return (
    <>
      {shown.length > 0 && (
        <div className="notices">
          {shown.map((n) => <Pill key={n.key} n={n} onOpen={open} />)}
          {more.length > 0 && (
            <button type="button" className="notice notice--neutral notice--more" onClick={() => setMoreOpen(true)}>
              <span className="notice-text">{m("noticeSlot.more", { n: more.length })}</span><Chev />
            </button>
          )}
        </div>
      )}
      <Sheet open={moreOpen} title={m("noticeSlot.moreTitle")} detent="medium" onClose={() => setMoreOpen(false)}>
        <div className="notices notices--list">
          {[...shown, ...more].map((n) => <Pill key={n.key} n={n} onOpen={(x) => { setMoreOpen(false); open(x); }} />)}
        </div>
      </Sheet>
      <Sheet open={openKey !== null && !!live?.sheet} title={live?.sheet?.title ?? ""} detent="medium" onClose={close}>
        {live?.sheet?.body(close)}
      </Sheet>
    </>
  );
}
