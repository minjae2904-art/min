import { describe, expect, it } from "vitest";
import type { DayLog, TradeLog } from "../model";
import { GATE, gateBits, gateFull, tradeSub, tradeView } from "../trade";

const day = (trade?: TradeLog): DayLog => ({ type: "stream-gym", done: {}, waterMl: 0, ...(trade ? { trade } : {}) });

describe("trading gate", () => {
  it("gate bits: 1 plan, 2 stop, 4 size; full only at 7", () => {
    expect(GATE.map(([k]) => k)).toEqual(["plan", "stop", "size"]);
    expect(gateBits([false, false, false])).toBe(0);
    expect(gateBits([true, false, false])).toBe(1);
    expect(gateBits([false, true, false])).toBe(2);
    expect(gateBits([false, false, true])).toBe(4);
    expect(gateBits([true, true, true])).toBe(7);
    expect(gateFull(7)).toBe(true);
    expect(gateFull(3)).toBe(false);
    expect(gateFull(undefined)).toBe(false);
  });
  it("tradeView covers every branch", () => {
    expect(tradeView(day())).toBe("gate");
    expect(tradeView(day({ count: 1, result: "open" }))).toBe("result");
    expect(tradeView(day({ count: 1, result: "win" }))).toBe("enough");
    expect(tradeView(day({ count: 1, result: "loss" }))).toBe("enough");
    expect(tradeView(day({ count: 3, result: "be" }))).toBe("enough");
    expect(tradeView(day({ count: 2, result: "open" }))).toBe("result");
    expect(tradeView(day({ count: 0, result: "skip" }))).toBe("enough");
    expect(tradeView(day({ count: 0, result: "open" }))).toBe("gate");
  });
  it("tradeSub strings", () => {
    expect(tradeSub(day())).toBeNull();
    expect(tradeSub(day({ count: 1, result: "win" }))).toBe("พอแล้ววันนี้ · กำไร");
    expect(tradeSub(day({ count: 1, result: "loss", note: "เข้าเร็วไป" }))).toBe("พอแล้ววันนี้ · ขาดทุน · เข้าเร็วไป");
    expect(tradeSub(day({ count: 2, result: "be" }))).toBe("พอแล้ววันนี้ · เสมอ · 2 ไม้");
    expect(tradeSub(day({ count: 6, result: "be" }))).toBe("พอแล้ววันนี้ · เสมอ · 5+ ไม้");
    expect(tradeSub(day({ count: 1, result: "open", gate: 7 }))).toBe("เทรด 1 ไม้ · ยังถืออยู่");
    expect(tradeSub(day({ count: 0, result: "skip" }))).toBe("ดูกราฟแล้ว ไม่มีจังหวะ ไม่เข้า · พอแล้ววันนี้");
    expect(tradeSub(day({ count: 0, result: "open" }))).toBeNull();
  });
});
