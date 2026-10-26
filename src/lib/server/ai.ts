// AI provider for the coach. Gemini (GEMINI_API_KEY) is preferred when set, else Claude (ANTHROPIC_API_KEY).
// Force one with AI_PROVIDER=gemini|anthropic. Pattern borrowed from min1lot-web lib/ai/provider.js.
import Anthropic from "@anthropic-ai/sdk";
import { betaJSONSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { msgs, type Lang } from "../../i18n/core";
import * as M from "../../i18n/msg/lib-server";
import { buildGeminiBody, readGeminiResponse, type GeminiRead } from "./gemini-json";

const m = msgs(M);

// Default Gemini model as verified in min1lot-web (2026-09-20). Override with GEMINI_MODEL.
const GEMINI_DEFAULT = "gemini-3.5-flash-lite";
const CLAUDE_MODEL = "claude-opus-5-5";
const geminiModel = () => process.env.GEMINI_MODEL?.trim() || GEMINI_DEFAULT;

export type AiResult = { text: string } | { error: string; status: number };
// Alternating conversation turns, oldest first; the last one is the user's current request.
export type AiTurn = { role: "user" | "assistant"; text: string };

// Suffix for a reply cut at the token limit, in the request's language.
const cut = (lang: Lang) => m.in(lang, "ai.cut");
const geminiHint = (status: number, model: string, lang: Lang) =>
  status === 404 ? m.in(lang, "ai.err.noModel", { model }) : status === 429 ? m.in(lang, "ai.err.geminiQuota") : status === 400 || status === 403 ? m.in(lang, "ai.err.geminiKey") : `Gemini error ${status}`;

export function aiProvider(): "gemini" | "anthropic" | null {
  const gem = process.env.GEMINI_API_KEY?.trim(), ant = process.env.ANTHROPIC_API_KEY?.trim();
  const forced = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (forced === "gemini" && gem) return "gemini";
  if (forced === "anthropic" && ant) return "anthropic";
  return gem ? "gemini" : ant ? "anthropic" : null;
}

// Model id of the active provider (part of the brain cache hash).
export const aiModel = () => (aiProvider() === "gemini" ? geminiModel() : CLAUDE_MODEL);

// lang: language of the error texts (and the cut suffix) returned to the client.
export async function complete(system: string, messages: AiTurn[], lang: Lang = "th"): Promise<AiResult> {
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
        contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.text }] })),
        generationConfig: { maxOutputTokens: 4096, temperature: 0.4 },
      }),
      signal: AbortSignal.timeout(50_000),
    }).catch(() => null);
    if (!r) return { error: m.in(lang, "ai.err.geminiConnect"), status: 502 };
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: geminiHint(r.status, model, lang), status: r.status === 429 ? 429 : 502 };
    const cand = j.candidates?.[0];
    const text = (cand?.content?.parts ?? []).filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text ?? "").join("").trim();
    if (!text) return { error: m.in(lang, "ai.err.geminiEmpty", { reason: cand?.finishReason ?? j.promptFeedback?.blockReason ?? m.in(lang, "ai.err.unknown") }), status: 502 };
    return { text: cand?.finishReason === "MAX_TOKENS" ? text + cut(lang) : text };
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
      messages: messages.map((m) => ({ role: m.role, content: m.text })),
    }, { timeout: 55_000, maxRetries: 0 }); // fail before maxDuration 60 so the coach refund runs
    if (res.stop_reason === "refusal") return { error: m.in(lang, "ai.err.refused"), status: 422 };
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
    return { text: res.stop_reason === "max_tokens" ? text + cut(lang) : text };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { error: m.in(lang, "ai.err.anthropicKey"), status: 500 };
    if (e instanceof Anthropic.RateLimitError) return { error: m.in(lang, "ai.err.rate"), status: 429 };
    if (e instanceof Anthropic.APIError) return { error: `AI error ${e.status}`, status: 502 };
    return { error: m.in(lang, "ai.err.connect"), status: 502 };
  }
}

export type JsonResult = { json: unknown; provider: "gemini" | "anthropic" } | { error: string; status: number };

// Set once the legacy Gemini fields (responseMimeType + responseJsonSchema) worked, so later calls skip the 400.
let geminiLegacy = false;

// Schema-constrained JSON completion for the brain. The caller validates the JSON (validateAiOutput); nothing here
// trusts it. Never logs the prompt or the response.
export async function completeJson(system: string, user: string, schema: Record<string, unknown>, mode: "brief" | "weekly", lang: Lang = "th"): Promise<JsonResult> {
  const provider = aiProvider();
  if (!provider) return { error: "missing env", status: 500 };

  if (provider === "gemini") {
    const model = geminiModel();
    const deadline = Date.now() + 50_000;
    const call = async (legacy: boolean): Promise<{ status: number; read: GeminiRead } | null> => {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY!.trim() },
        body: JSON.stringify(buildGeminiBody(system, user, schema, { mode, model, legacy })),
        signal: AbortSignal.timeout(Math.max(1_000, deadline - Date.now())),
      }).catch(() => null);
      if (!r) return null;
      return { status: r.status, read: readGeminiResponse(r.status, await r.json().catch(() => ({}))) };
    };
    let res = await call(geminiLegacy);
    if (res && !geminiLegacy && "legacyRetry" in res.read && res.read.legacyRetry) {
      res = await call(true);
      if (res && "json" in res.read) geminiLegacy = true;
    }
    if (!res) return { error: m.in(lang, "ai.err.geminiConnect"), status: 502 };
    if ("json" in res.read) return { json: res.read.json, provider: "gemini" };
    if (res.status < 200 || res.status >= 300) return { error: geminiHint(res.status, model, lang), status: res.status === 429 ? 429 : 502 };
    return { error: m.in(lang, "ai.err.geminiEmpty", { reason: res.read.error }), status: 502 };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY!.trim() });
  try {
    const res = await client.beta.messages.parse({
      model: CLAUDE_MODEL, max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      output_config: { effort: mode === "weekly" ? "medium" : "low", format: betaJSONSchemaOutputFormat(schema as { type: "object" }) },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
    }, { timeout: 50_000, maxRetries: 0 }); // one attempt: fits maxDuration 60 so the quota refund runs
    if (res.stop_reason === "refusal") return { error: "refusal", status: 422 };
    if (res.stop_reason === "max_tokens" || !res.parsed_output) return { error: "incomplete", status: 502 };
    return { json: res.parsed_output, provider: "anthropic" };
  } catch (e) {
    // parse() throws AnthropicError("Failed to parse structured output") on invalid JSON: falls through to 502.
    if (e instanceof Anthropic.AuthenticationError) return { error: m.in(lang, "ai.err.anthropicKey"), status: 500 };
    if (e instanceof Anthropic.RateLimitError) return { error: m.in(lang, "ai.err.rate"), status: 429 };
    if (e instanceof Anthropic.APIError) return { error: `AI error ${e.status}`, status: 502 };
    return { error: m.in(lang, "ai.err.noAnswer"), status: 502 };
  }
}
