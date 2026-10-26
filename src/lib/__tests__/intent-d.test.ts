// v1.8 intents: new members, care routine param and the safe app url used by push deep links.
import { describe, expect, it } from "vitest";
import { INTENTS, intentHref, parseIntent, parseRoutineParam, safeAppUrl } from "../intent";
import { URL_CASES } from "./url-cases";

describe("intents v1.8", () => {
  it("appends care, sing and meal2 and keeps the old order", () => {
    expect(INTENTS.slice(0, 8)).toEqual(["water", "weigh", "trade", "live", "quick", "golive", "plan", "shut"]);
    expect(INTENTS.slice(8)).toEqual(["care", "sing", "meal2"]);
  });
  it("every intent round-trips through its href", () => {
    for (const i of INTENTS) expect(parseIntent(new URL(intentHref(i), "http://x").searchParams.get("do"))).toBe(i);
  });
  it("care carries the routine id; other intents ignore it", () => {
    expect(intentHref("care", "pm")).toBe("/?do=care&r=pm");
    expect(intentHref("care")).toBe("/?do=care");
    expect(intentHref("water", "pm")).toBe("/?do=water");
    const u = new URL(intentHref("care", "u-abc1"), "http://x");
    expect([parseIntent(u.searchParams.get("do")), parseRoutineParam(u.searchParams.get("r"))]).toEqual(["care", "u-abc1"]);
  });
  it("parseRoutineParam accepts short slug ids only", () => {
    for (const v of ["pm", "am", "u-abc1", "a".repeat(24), "r-1-2"]) expect(parseRoutineParam(v)).toBe(v);
    for (const v of [null, undefined, "", "PM", "a b", "a".repeat(25), "../x", "<x>", 5]) expect(parseRoutineParam(v)).toBeNull();
  });
  it("safeAppUrl keeps same-origin app paths only", () => {
    for (const [input, out] of URL_CASES) expect(safeAppUrl(input)).toBe(out);
  });
});
