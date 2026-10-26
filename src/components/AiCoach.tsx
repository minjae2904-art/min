"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { fmt, msgs, storedText } from "@/i18n";
import * as C from "@/i18n/msg/components";
import * as Common from "@/i18n/msg/common";
import { askAI, type AiTurn } from "@/lib/ai";
import { insightsHref } from "@/lib/intent";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { IconChevron } from "./Icons";
import { Section, toast } from "./ui";

const m = msgs(C), c = msgs(Common);
const DAILY_LIMIT = 20;
// History entries store the built-in coach question in Thai (canonical); shown in the current language.
const storedQ = storedText(C, "aiCoach.q.");

// Minimal renderer for the coach's "heading + - bullets" format.
function Answer({ text }: { text: string }) {
  return (
    <div className="ai-answer">
      {text.split("\n").filter((l) => l.trim()).map((l, i) => {
        const line = l.replace(/\*\*/g, "").trim();
        if (/^[-•*+]\s+/.test(line)) return <div key={i} className="ai-li">{line.replace(/^[-•*+]\s+/, "")}</div>;
        if (/^(\d+\.|#+)\s/.test(line)) return <div key={i} className="ai-h">{line.replace(/^#+\s/, "")}</div>;
        return <p key={i}>{line}</p>;
      })}
    </div>
  );
}

const when = (at: number) => fmt.dayMonthClock(at);

export function AiCoach() {
  const { s, update, auth } = useStore();
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null); // expanded history row (its `at`)
  const [fresh, setFresh] = useState(0); // `at` of the answer received on this visit (only it rises in)
  const lastArgs = useRef<{ mode: "coach" | "ask"; question: string } | null>(null);
  const last = s.ai[0];
  const suggest = [m("aiCoach.suggest.weight"), m("aiCoach.suggest.rest"), m("aiCoach.suggest.schedule"), m("aiCoach.suggest.trade")];

  async function run(mode: "coach" | "ask", question = "") {
    play("tap");
    setBusy(true);
    setErr(null);
    lastArgs.current = { mode, question };
    // The 2 newest answers, oldest first, so follow-up questions keep their context.
    const history: AiTurn[] = s.ai.slice(0, 2).reverse().map(({ q, a }) => ({ q: storedQ(q), a }));
    const r = await askAI(auth.token, mode, question, history);
    setBusy(false);
    if (r.unauthorized) { play("error"); toast(r.error ?? m("aiCoach.err.session")); auth.dropSession(); return; } // keep the cached data
    if (r.error || !r.text) { play("error"); setErr(r.error ?? m("aiCoach.err.empty")); return; }
    play("done");
    if (r.remaining !== undefined) setRemaining(r.remaining);
    const text = r.text, at = Date.now();
    update((x) => { x.ai = [{ at, q: mode === "coach" ? m.in("th", "aiCoach.q.coach") : question, a: text }, ...x.ai].slice(0, 5); });
    setFresh(at);
    setQ("");
  }

  const footer = m("aiCoach.footer", { quota: remaining === null ? m("aiCoach.quota.daily", { n: DAILY_LIMIT }) : m("aiCoach.quota.left", { left: remaining, n: DAILY_LIMIT }) });

  return (
    <Section header={m("aiCoach.header")} footer={footer}>
      <div style={{ padding: 16 }}>
        <button className="btn" disabled={busy} onClick={() => run("coach")}>
          {busy ? m("aiCoach.btn.busy") : m("aiCoach.btn.run")}
        </button>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input className="field field--fill" placeholder={last ? m("aiCoach.ph.follow") : m("aiCoach.ph.ask")} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && q.trim() && !busy) run("ask", q.trim()); }} />
          <button className="chip" disabled={busy || !q.trim()} onClick={() => run("ask", q.trim())}>{m("aiCoach.btn.ask")}</button>
        </div>
        <div className="chips" style={{ marginTop: 10 }}>
          {suggest.map((x) => <button key={x} className="chip chip--sm" disabled={busy} onClick={() => run("ask", x)}>{x}</button>)}
        </div>
        {err && (
          <div role="alert" className="alert alert--danger">
            <span style={{ flex: 1 }}>{err}</span>
            <button className="chip chip--sm" disabled={busy} onClick={() => { const a = lastArgs.current; if (a) run(a.mode, a.question); }}>{c("retry")}</button>
          </div>
        )}
        {busy && <div className="ai-skel" aria-hidden><span className="skel" style={{ width: "92%" }} /><span className="skel" style={{ width: "78%" }} /><span className="skel" style={{ width: "85%" }} /></div>}
        {last && (
          <div key={last.at} className={last.at === fresh ? "ai-new" : undefined} style={{ marginTop: 16 }}>
            <div className="row-sub" style={{ marginBottom: 6 }}>{storedQ(last.q)} · {when(last.at)}</div>
            <Answer text={last.a} />
            <Link href={insightsHref("balance")} className="chip chip--sm" style={{ display: "inline-block", marginTop: 10 }} onClick={() => play("nav")}>{m("aiCoach.btn.toBrain")}</Link>
          </div>
        )}
      </div>
      {s.ai.slice(1).map((h) => (
        <div key={h.at}>
          <button className="row" aria-expanded={open === h.at} onClick={() => { play("tap"); setOpen(open === h.at ? null : h.at); }}>
            <span className="row-main">
              <div className="row-title fs-sub">{storedQ(h.q)}</div>
              <div className="row-sub">{when(h.at)}</div>
            </span>
            <span className="chev" aria-hidden style={{ transform: open === h.at ? "rotate(90deg)" : undefined }}><IconChevron size={16} weight={2.4} /></span>
          </button>
          {open === h.at && <div className="ai-expand" style={{ padding: "0 16px 14px" }}><Answer text={h.a} /></div>}
        </div>
      ))}
    </Section>
  );
}
