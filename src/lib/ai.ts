"use client";

export type AiTurn = { q: string; a: string };
export type AiReply = { text?: string; remaining?: number; error?: string; unauthorized?: boolean };

// `history` = the previous Q/A pairs (oldest first) so a follow-up question keeps its context.
export async function askAI(token: string | null, mode: "coach" | "ask", question = "", history: AiTurn[] = []): Promise<AiReply> {
  if (!token) return { error: "ต้องเข้าด้วย PIN ก่อน" };
  const r = await fetch("/api/ai/coach", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ mode, question, history }),
  }).catch(() => null);
  if (!r) return { error: "เชื่อมต่อไม่ได้" };
  if (r.status === 404) return { error: "เว็บนี้ยังไม่มี AI (push โค้ดล่าสุดก่อน)" };
  if (r.status === 401) return { error: "เซสชันหมดอายุ เข้า PIN ใหม่", unauthorized: true };
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { error: j.missing ? "ต้องใส่ GEMINI_API_KEY (หรือ ANTHROPIC_API_KEY) ใน Vercel ก่อน" : j.error ?? `ผิดพลาด (${r.status})` };
  return { text: j.text, remaining: typeof j.remaining === "number" ? j.remaining : undefined };
}
