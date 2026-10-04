// AI provider for the coach. Gemini (GEMINI_API_KEY) is preferred when set, else Claude (ANTHROPIC_API_KEY).
// Force one with AI_PROVIDER=gemini|anthropic. Pattern borrowed from min1lot-web lib/ai/provider.js.
import Anthropic from "@anthropic-ai/sdk";

// Default Gemini model as verified in min1lot-web (2026-09-20). Override with GEMINI_MODEL.
const GEMINI_DEFAULT = "gemini-3.5-flash-lite";

export type AiResult = { text: string } | { error: string; status: number };

export function aiProvider(): "gemini" | "anthropic" | null {
  const gem = process.env.GEMINI_API_KEY?.trim(), ant = process.env.ANTHROPIC_API_KEY?.trim();
  const forced = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (forced === "gemini" && gem) return "gemini";
  if (forced === "anthropic" && ant) return "anthropic";
  return gem ? "gemini" : ant ? "anthropic" : null;
}

export async function complete(system: string, user: string): Promise<AiResult> {
  const provider = aiProvider();
  if (!provider) return { error: "missing env", status: 500 };

  if (provider === "gemini") {
    const model = process.env.GEMINI_MODEL?.trim() || GEMINI_DEFAULT;
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      // Key in a header, not the URL, so it never shows up in logs.
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY!.trim() },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: 4096, temperature: 0.4 },
      }),
      signal: AbortSignal.timeout(50_000),
    }).catch(() => null);
    if (!r) return { error: "เชื่อมต่อ Gemini ไม่ได้", status: 502 };
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const hint = r.status === 404 ? `ไม่มีรุ่น ${model} (ตั้ง GEMINI_MODEL เป็นรุ่นที่ใช้ได้)` : r.status === 429 ? "โควตา Gemini หมด ลองใหม่ภายหลัง" : r.status === 400 || r.status === 403 ? "GEMINI_API_KEY ไม่ถูกต้องหรือไม่มีสิทธิ์" : `Gemini error ${r.status}`;
      return { error: hint, status: r.status === 429 ? 429 : 502 };
    }
    const cand = j.candidates?.[0];
    const text = (cand?.content?.parts ?? []).filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text ?? "").join("").trim();
    if (!text) return { error: `Gemini ไม่ตอบ (${cand?.finishReason ?? j.promptFeedback?.blockReason ?? "ไม่ทราบสาเหตุ"})`, status: 502 };
    return { text };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY!.trim() });
  try {
    const res = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "medium" },
      // Re-run on a fallback model if a safety classifier declines (enabled by default for Opus 5.5).
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
    });
    if (res.stop_reason === "refusal") return { error: "AI ไม่สามารถตอบคำถามนี้ได้", status: 422 };
    return { text: res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim() };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { error: "ANTHROPIC_API_KEY ไม่ถูกต้อง", status: 500 };
    if (e instanceof Anthropic.RateLimitError) return { error: "AI ถูกใช้ถี่เกินไป ลองใหม่อีกสักครู่", status: 429 };
    if (e instanceof Anthropic.APIError) return { error: `AI error ${e.status}`, status: 502 };
    return { error: "เชื่อมต่อ AI ไม่ได้", status: 502 };
  }
}
