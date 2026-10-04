"use client";

import { useState } from "react";
import { askAI } from "@/lib/ai";
import { play } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { Section, toast } from "./ui";

// Minimal renderer for the coach's "heading + - bullets" format.
function Answer({ text }: { text: string }) {
  return (
    <div className="ai-answer">
      {text.split("\n").filter((l) => l.trim()).map((l, i) => {
        const line = l.replace(/\*\*/g, "").trim();
        if (/^[-•]\s/.test(line)) return <div key={i} className="ai-li">{line.replace(/^[-•]\s/, "")}</div>;
        if (/^(\d+\.|#+)\s/.test(line)) return <div key={i} className="ai-h">{line.replace(/^#+\s/, "")}</div>;
        return <p key={i}>{line}</p>;
      })}
    </div>
  );
}

const SUGGEST = ["ทำไมน้ำหนักขึ้นช้า", "วันไหนควรพักยิม", "ควรปรับเวลาอะไรในตาราง", "วินัยการเทรดเป็นอย่างไร"];

export function AiCoach() {
  const { s, update, auth } = useStore();
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const last = s.ai[0];

  async function run(mode: "coach" | "ask", question = "") {
    play("tap");
    setBusy(true);
    const r = await askAI(auth.token, mode, question);
    setBusy(false);
    if (r.error || !r.text) { play("error"); return toast(r.error ?? "ไม่มีคำตอบ"); }
    play("done");
    const text = r.text;
    update((x) => { x.ai = [{ at: Date.now(), q: mode === "coach" ? "วิเคราะห์ภาพรวม" : question, a: text }, ...x.ai].slice(0, 5); });
    setQ("");
  }

  return (
    <Section header="AI โค้ช" footer="AI เห็นเฉพาะตัวเลขสรุป ไม่เห็นข้อความ journal หรือโน้ต · ใช้ได้ 20 ครั้ง/วัน · ไม่ใช่คำแนะนำทางการแพทย์หรือการลงทุน">
      <div style={{ padding: 16 }}>
        <button className="btn" disabled={busy} style={{ opacity: busy ? 0.6 : 1 }} onClick={() => run("coach")}>
          {busy ? "AI กำลังวิเคราะห์..." : "วิเคราะห์ข้อมูลของฉันด้วย AI"}
        </button>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input className="field" style={{ background: "var(--fill)" }} placeholder="ถามเกี่ยวกับข้อมูลของคุณ..." value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && q.trim() && !busy) run("ask", q.trim()); }} />
          <button className="chip" disabled={busy || !q.trim()} onClick={() => run("ask", q.trim())}>ถาม</button>
        </div>
        <div className="chips" style={{ marginTop: 10 }}>
          {SUGGEST.map((x) => <button key={x} className="chip" style={{ fontSize: 13, padding: "6px 12px" }} disabled={busy} onClick={() => run("ask", x)}>{x}</button>)}
        </div>
        {last && (
          <div style={{ marginTop: 16 }}>
            <div className="row-sub" style={{ marginBottom: 6 }}>{last.q} · {new Date(last.at).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
            <Answer text={last.a} />
          </div>
        )}
      </div>
    </Section>
  );
}
