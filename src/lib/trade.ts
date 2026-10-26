// v1.7 trading gate (spec 8): a soft 3-tick check before logging, then a calm "พอแล้ววันนี้". Journal only, no market advice.
import type { DayLog, TradeResult } from "./model";

export const GATE = [["plan", "ตรงแผนที่เขียนไว้"], ["stop", "ตั้ง stop-loss แล้ว"], ["size", "ขนาดไม้ตามกฎของตัวเอง"]] as const;
export const gateBits = (t: boolean[]) => t.reduce((n, on, i) => (on && i < 3 ? n | (1 << i) : n), 0);
export const gateFull = (b?: number) => b === 7;
export const TRADE_RESULT: [TradeResult, string][] = [["win", "กำไร"], ["loss", "ขาดทุน"], ["be", "เสมอ"], ["open", "ยังถืออยู่"]];
const resultLabel = (r: TradeResult) => TRADE_RESULT.find(([k]) => k === r)?.[1] ?? "";

export type TradeView = "gate" | "result" | "enough";
// No trade -> gate; a stay-out skip -> enough; logged and still open -> result; logged and settled -> enough.
export function tradeView(d: DayLog): TradeView {
  const t = d.trade;
  if (!t) return "gate";
  if (t.result === "skip") return "enough";
  if (t.count >= 1) return t.result === "open" ? "result" : "enough";
  return "gate";
}

// Today row subtitle.
export function tradeSub(d: DayLog): string | null {
  const t = d.trade;
  if (!t) return null;
  const note = t.note ? ` · ${t.note}` : "";
  if (t.result === "skip") return `ดูกราฟแล้ว ไม่มีจังหวะ ไม่เข้า · พอแล้ววันนี้${note}`;
  if (t.count < 1) return null;
  const n = t.count > 1 ? ` · ${t.count >= 5 ? "5+" : t.count} ไม้` : "";
  if (t.result === "open") return `เทรด 1 ไม้ · ยังถืออยู่${n}${note}`;
  return `พอแล้ววันนี้ · ${resultLabel(t.result)}${n}${note}`;
}
