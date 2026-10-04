"use client";

export async function askAI(token: string | null, mode: "coach" | "ask", question = ""): Promise<{ text?: string; error?: string }> {
  if (!token) return { error: "ต้องเข้าด้วย PIN ก่อน" };
  const r = await fetch("/api/ai/coach", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ mode, question }),
  }).catch(() => null);
  if (!r) return { error: "เชื่อมต่อไม่ได้" };
  if (r.status === 404) return { error: "เว็บนี้ยังไม่มี AI (push โค้ดล่าสุดก่อน)" };
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { error: j.missing ? "ต้องใส่ GEMINI_API_KEY (หรือ ANTHROPIC_API_KEY) ใน Vercel ก่อน" : j.error ?? `ผิดพลาด (${r.status})` };
  return { text: j.text };
}
