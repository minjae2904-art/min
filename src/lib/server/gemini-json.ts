// Pure request builder + response reader for Gemini structured output (no SDK, unit-tested).
// responseFormat.text is documented but not live-tested, so a 400 that names it triggers one legacy retry
// with responseMimeType + responseJsonSchema. The Claude path (ai.ts completeJson) is not unit-tested: no key.

export type GeminiOpt = { mode: "brief" | "weekly"; model: string; legacy: boolean };

export function buildGeminiBody(system: string, user: string, schema: unknown, o: GeminiOpt) {
  const thinking = /^gemini-(3|4)/.test(o.model) && o.mode === "weekly" && !o.legacy;
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: {
      maxOutputTokens: o.mode === "weekly" ? 8192 : 4096, temperature: 0.3,
      ...(o.legacy ? { responseMimeType: "application/json", responseJsonSchema: schema } : { responseFormat: { text: { mimeType: "APPLICATION_JSON", schema } } }),
      ...(thinking ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
    },
  };
}

type Part = { text?: string; thought?: boolean };
type GeminiJson = {
  error?: { message?: string };
  promptFeedback?: { blockReason?: string };
  candidates?: { finishReason?: string; content?: { parts?: Part[] } }[];
};
export type GeminiRead = { json: unknown } | { error: string; legacyRetry?: boolean };

const LEGACY_HINTS = ["responseFormat", "Unknown name", "Invalid JSON payload", "thinking"];

export function readGeminiResponse(status: number, body: unknown): GeminiRead {
  const j = (body && typeof body === "object" ? body : {}) as GeminiJson;
  if (status < 200 || status >= 300) {
    const msg = typeof j.error?.message === "string" ? j.error.message : "";
    return { error: `http ${status}`, ...(status === 400 && LEGACY_HINTS.some((h) => msg.includes(h)) ? { legacyRetry: true } : {}) };
  }
  const cand = j.candidates?.[0];
  if (!cand) return { error: `blocked ${j.promptFeedback?.blockReason ?? "unknown"}` };
  if (cand.finishReason !== "STOP") return { error: `finish ${cand.finishReason ?? "unknown"}` };
  const text = (cand.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
  try { return { json: JSON.parse(text) }; } catch { return { error: "invalid json" }; }
}
