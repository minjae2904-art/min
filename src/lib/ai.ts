"use client";

import type { Session } from "@supabase/supabase-js";

export async function askAI(session: Session, mode: "coach" | "ask", question = ""): Promise<{ text?: string; error?: string }> {
  const r = await fetch("/api/ai/coach", {
    method: "POST",
    headers: { authorization: `Bearer ${session.access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ mode, question }),
  }).catch(() => null);
  if (!r) return { error: "เชื่อมต่อไม่ได้" };
  if (r.status === 404) return { error: "เว็บนี้ยังไม่มี AI (push โค้ดล่าสุดก่อน)" };
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { error: j.missing ? `ต้องตั้งค่า ${j.missing.join(", ")} ใน Vercel ก่อน` : j.error ?? `ผิดพลาด (${r.status})` };
  return { text: j.text };
}
