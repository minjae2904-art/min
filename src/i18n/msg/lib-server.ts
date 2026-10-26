// Dictionary for src/lib/server/ai.ts (batch 12). th = original strings byte-for-byte (never rephrase);
// en = English copy (spec section 3). One key per line; en keeps the key order of th.
import type { Tr } from "../core";

export const th = {
  // ai (src/lib/server/ai.ts): error texts returned to the client, localized by the request's language
  "ai.cut": "\n…(คำตอบถูกตัด)",
  "ai.err.geminiConnect": "เชื่อมต่อ Gemini ไม่ได้",
  "ai.err.noModel": "ไม่มีรุ่น {model} (ตั้ง GEMINI_MODEL เป็นรุ่นที่ใช้ได้)",
  "ai.err.geminiQuota": "โควตา Gemini หมด ลองใหม่ภายหลัง",
  "ai.err.geminiKey": "GEMINI_API_KEY ไม่ถูกต้องหรือไม่มีสิทธิ์",
  "ai.err.geminiEmpty": "Gemini ไม่ตอบ ({reason})",
  "ai.err.unknown": "ไม่ทราบสาเหตุ",
  "ai.err.refused": "AI ไม่สามารถตอบคำถามนี้ได้",
  "ai.err.anthropicKey": "ANTHROPIC_API_KEY ไม่ถูกต้อง",
  "ai.err.rate": "AI ถูกใช้ถี่เกินไป ลองใหม่อีกสักครู่",
  "ai.err.connect": "เชื่อมต่อ AI ไม่ได้",
  "ai.err.noAnswer": "AI ตอบไม่ได้",
};

export const en: Tr<typeof th> = {
  "ai.cut": "\n...(answer cut off)",
  "ai.err.geminiConnect": "Can't connect to Gemini",
  "ai.err.noModel": "Model {model} not found (set GEMINI_MODEL to an available model)",
  "ai.err.geminiQuota": "Gemini quota used up. Try again later",
  "ai.err.geminiKey": "GEMINI_API_KEY is invalid or has no access",
  "ai.err.geminiEmpty": "Gemini didn't answer ({reason})",
  "ai.err.unknown": "unknown reason",
  "ai.err.refused": "AI can't answer this question",
  "ai.err.anthropicKey": "ANTHROPIC_API_KEY is invalid",
  "ai.err.rate": "AI is getting too many requests. Try again in a moment",
  "ai.err.connect": "Can't connect to AI",
  "ai.err.noAnswer": "AI couldn't answer",
};
