import { describe, expect, it } from "vitest";
import { PLAN_SCHEMA } from "../brain/schema";
import { buildGeminiBody, readGeminiResponse } from "../server/gemini-json";

const ok = (parts: { text?: string; thought?: boolean }[], finishReason = "STOP") => ({ candidates: [{ finishReason, content: { parts } }] });

describe("buildGeminiBody", () => {
  it("uses responseFormat by default and the legacy fields when legacy is set", () => {
    const b = buildGeminiBody("sys", "u", PLAN_SCHEMA, { mode: "brief", model: "gemini-3.5-flash-lite", legacy: false });
    expect(b.systemInstruction).toEqual({ parts: [{ text: "sys" }] });
    expect(b.contents).toEqual([{ role: "user", parts: [{ text: "u" }] }]);
    expect(b.generationConfig).toEqual({ maxOutputTokens: 4096, temperature: 0.3, responseFormat: { text: { mimeType: "APPLICATION_JSON", schema: PLAN_SCHEMA } } });
    const l = buildGeminiBody("sys", "u", PLAN_SCHEMA, { mode: "weekly", model: "gemini-3.5-flash-lite", legacy: true });
    expect(l.generationConfig).toEqual({ maxOutputTokens: 8192, temperature: 0.3, responseMimeType: "application/json", responseJsonSchema: PLAN_SCHEMA });
  });
  it("sends thinkingConfig only for gemini-3/4 weekly, never with legacy, never thinkingBudget", () => {
    const cfg = (model: string, mode: "brief" | "weekly", legacy = false) => buildGeminiBody("s", "u", {}, { mode, model, legacy }).generationConfig as Record<string, unknown>;
    expect(cfg("gemini-3.5-flash-lite", "weekly").thinkingConfig).toEqual({ thinkingLevel: "low" });
    expect(cfg("gemini-4-pro", "weekly").thinkingConfig).toEqual({ thinkingLevel: "low" });
    expect(cfg("gemini-3.5-flash-lite", "brief").thinkingConfig).toBeUndefined();
    expect(cfg("gemini-2.5-flash", "weekly").thinkingConfig).toBeUndefined();
    expect(cfg("gemini-3.5-flash-lite", "weekly", true).thinkingConfig).toBeUndefined();
    expect(JSON.stringify(cfg("gemini-3.5-flash-lite", "weekly"))).not.toContain("thinkingBudget");
  });
});

describe("readGeminiResponse", () => {
  it("parses STOP + valid JSON", () => {
    expect(readGeminiResponse(200, ok([{ text: '{"headline":' }, { text: '"x"}' }]))).toEqual({ json: { headline: "x" } });
  });
  it("filters thought parts", () => {
    expect(readGeminiResponse(200, ok([{ text: "thinking...", thought: true }, { text: '{"a":1}' }]))).toEqual({ json: { a: 1 } });
  });
  it("rejects MAX_TOKENS and SAFETY", () => {
    expect(readGeminiResponse(200, ok([{ text: '{"a":' }], "MAX_TOKENS"))).toEqual({ error: "finish MAX_TOKENS" });
    expect(readGeminiResponse(200, ok([], "SAFETY"))).toEqual({ error: "finish SAFETY" });
  });
  it("reports blockReason when there are no candidates", () => {
    expect(readGeminiResponse(200, { promptFeedback: { blockReason: "PROHIBITED_CONTENT" } })).toEqual({ error: "blocked PROHIBITED_CONTENT" });
    expect(readGeminiResponse(200, {})).toEqual({ error: "blocked unknown" });
  });
  it("handles invalid JSON", () => {
    expect(readGeminiResponse(200, ok([{ text: "นี่คือคำตอบ ไม่ใช่ JSON" }]))).toEqual({ error: "invalid json" });
    expect(readGeminiResponse(200, null)).toEqual({ error: "blocked unknown" });
  });
  it("asks for one legacy retry on a 400 about unknown fields only", () => {
    expect(readGeminiResponse(400, { error: { message: 'Invalid JSON payload received. Unknown name "responseFormat" at generation_config' } })).toEqual({ error: "http 400", legacyRetry: true });
    expect(readGeminiResponse(400, { error: { message: "thinking_level is not supported" } })).toEqual({ error: "http 400", legacyRetry: true });
    expect(readGeminiResponse(400, { error: { message: "API key not valid" } })).toEqual({ error: "http 400" });
    expect(readGeminiResponse(429, { error: { message: "Unknown name" } })).toEqual({ error: "http 429" });
  });
});
