// v1.7 trading gate (spec 8): a soft 3-tick check before logging, then a calm "พอแล้ววันนี้". Journal only, no market advice.
import { langArr, msgs } from "../i18n";
import * as M from "../i18n/msg/lib-6";
import type { DayLog, TradeResult } from "./model";

const m = msgs(M);

export const GATE: readonly (readonly ["plan" | "stop" | "size", string])[] = langArr<readonly ["plan" | "stop" | "size", string]>(() => [["plan", m("trade.gate.plan")], ["stop", m("trade.gate.stop")], ["size", m("trade.gate.size")]]);
export const gateBits = (t: boolean[]) => t.reduce((n, on, i) => (on && i < 3 ? n | (1 << i) : n), 0);
export const gateFull = (b?: number) => b === 7;
export const TRADE_RESULT: [TradeResult, string][] = langArr(() => [["win", m("trade.result.win")], ["loss", m("trade.result.loss")], ["be", m("trade.result.be")], ["open", m("trade.result.open")]]);
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
  if (t.result === "skip") return m("trade.sub.skip", { note });
  if (t.count < 1) return null;
  const n = t.count > 1 ? m("trade.sub.count", { n: t.count >= 5 ? "5+" : t.count }) : "";
  if (t.result === "open") return m("trade.sub.open", { n, note });
  return m("trade.sub.done", { result: resultLabel(t.result), n, note });
}
