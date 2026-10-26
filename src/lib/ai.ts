"use client";

import { getLang, langHeader, msgs } from "../i18n/core";
import * as Common from "../i18n/msg/common";
import * as M from "../i18n/msg/lib-9";

const m = msgs(M), c = msgs(Common);

export type AiTurn = { q: string; a: string };
export type AiReply = { text?: string; remaining?: number; error?: string; unauthorized?: boolean };

// `history` = the previous Q/A pairs (oldest first) so a follow-up question keeps its context.
// Error text uses the language captured at the call (the request is async).
export async function askAI(token: string | null, mode: "coach" | "ask", question = "", history: AiTurn[] = []): Promise<AiReply> {
  const lang = getLang();
  if (!token) return { error: m.in(lang, "ai.err.pin") };
  const r = await fetch("/api/ai/coach", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...langHeader() },
    body: JSON.stringify({ mode, question, history }),
  }).catch(() => null);
  if (!r) return { error: c.in(lang, "cantConnect") };
  if (r.status === 404) return { error: m.in(lang, "ai.err.noAi") };
  if (r.status === 401) return { error: m.in(lang, "ai.err.expired"), unauthorized: true };
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { error: j.missing ? m.in(lang, "ai.err.missingKey") : j.error ?? m.in(lang, "ai.err.status", { status: r.status }) };
  return { text: j.text, remaining: typeof j.remaining === "number" ? j.remaining : undefined };
}
