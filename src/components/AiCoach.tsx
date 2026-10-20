"use client";

import { useRef, useState } from "react";
import { askAI, type AiTurn } from "@/lib/ai";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { IconChevron } from "./Icons";
import { Section, toast } from "./ui";

const DAILY_LIMIT = 20;

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

const SUGGEST = ["ทำไมน้ำหนักขึ้นช้า", "วันไหนควรพักยิม", "ควรปรับเวลาอะไรในตาราง", "วินัยการเทรดเป็นอย่างไร"];
const when = (at: number) => new Date(at).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

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

  async function run(mode: "coach" | "ask", question = "") {
    play("tap");
    setBusy(true);
    setErr(null);
    lastArgs.current = { mode, question };
    // The 2 newest answers, oldest first, so follow-up questions keep their context.
    const history: AiTurn[] = s.ai.slice(0, 2).reverse().map(({ q, a }) => ({ q, a }));
    const r = await askAI(auth.token, mode, question, history);
    setBusy(false);
    if (r.unauthorized) { play("error"); toast(r.error ?? "เซสชันหมดอายุ"); auth.dropSession(); return; } // keep the cached data
    if (r.error || !r.text) { play("error"); setErr(r.error ?? "ไม่มีคำตอบ"); return; }
    play("done");
    if (r.remaining !== undefined) setRemaining(r.remaining);
    const text = r.text, at = Date.now();
    update((x) => { x.ai = [{ at, q: mode === "coach" ? "วิเคราะห์ภาพรวม" : question, a: text }, ...x.ai].slice(0, 5); });
    setFresh(at);
    setQ("");
  }

  const footer = `AI (Gemini หรือ Claude) เห็นเฉพาะตัวเลขสรุป ไม่เห็นข้อความ journal หรือโน้ต · ${remaining === null ? `ใช้ได้ ${DAILY_LIMIT} ครั้ง/วัน` : `เหลือ ${remaining}/${DAILY_LIMIT} วันนี้`} · ไม่ใช่คำแนะนำทางการแพทย์หรือการลงทุน`;

  return (
    <Section header="AI โค้ช" footer={footer}>
      <div style={{ padding: 16 }}>
        <button className="btn" disabled={busy} style={{ opacity: busy ? 0.6 : 1 }} onClick={() => run("coach")}>
          {busy ? "AI กำลังวิเคราะห์..." : "วิเคราะห์ข้อมูลของฉันด้วย AI"}
        </button>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input className="field" style={{ background: "var(--fill)" }} placeholder={last ? "ถามต่อจากคำตอบล่าสุด..." : "ถามเกี่ยวกับข้อมูลของคุณ..."} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && q.trim() && !busy) run("ask", q.trim()); }} />
          <button className="chip" disabled={busy || !q.trim()} onClick={() => run("ask", q.trim())}>ถาม</button>
        </div>
        <div className="chips" style={{ marginTop: 10 }}>
          {SUGGEST.map((x) => <button key={x} className="chip" style={{ fontSize: 13, padding: "6px 12px" }} disabled={busy} onClick={() => run("ask", x)}>{x}</button>)}
        </div>
        {err && (
          <div role="alert" style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, padding: "10px 12px", borderRadius: 12, background: "color-mix(in srgb, var(--red) 12%, transparent)", color: "var(--red)", fontSize: 14 }}>
            <span style={{ flex: 1 }}>{err}</span>
            <button className="chip" style={{ fontSize: 13, padding: "6px 12px" }} disabled={busy} onClick={() => { const a = lastArgs.current; if (a) run(a.mode, a.question); }}>ลองใหม่</button>
          </div>
        )}
        {busy && <div className="ai-skel" aria-hidden><span className="skel" style={{ width: "92%" }} /><span className="skel" style={{ width: "78%" }} /><span className="skel" style={{ width: "85%" }} /></div>}
        {last && (
          <div key={last.at} className={last.at === fresh ? "ai-new" : undefined} style={{ marginTop: 16 }}>
            <div className="row-sub" style={{ marginBottom: 6 }}>{last.q} · {when(last.at)}</div>
            <Answer text={last.a} />
          </div>
        )}
      </div>
      {s.ai.slice(1).map((h) => (
        <div key={h.at}>
          <button className="row" aria-expanded={open === h.at} onClick={() => { play("tap"); setOpen(open === h.at ? null : h.at); }}>
            <span className="row-main">
              <div className="row-title" style={{ fontSize: 15 }}>{h.q}</div>
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
