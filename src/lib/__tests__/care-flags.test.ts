import { describe, expect, it } from "vitest";
import { addDays } from "../date";
import { normalize, type DayLog, type State } from "../model";
import { careFlag, HELP, RED_FLAGS, snoozeFlag } from "../care/flags";
import { applyLevel } from "../care/progress";

const T = "2026-10-27";
const mk = (): State => { const s = normalize({}); applyLevel(s, "std", T); return s; };
const put = (s: State, back: number, o: Partial<DayLog>) => { const date = addDays(T, -back); s.days[date] = { ...(s.days[date] ?? { type: "stream-gym", done: {}, waterMl: 0 }), ...o }; };

describe("doctor flags", () => {
  it("is null before setup and with nothing to say", () => {
    const s = normalize({});
    s.care.ms.mole = 3;
    expect(careFlag(s, T)).toBeNull();
    expect(careFlag(mk(), T)).toBeNull();
  });
  it("raises each trigger", () => {
    const one = (f: (s: State) => void) => { const s = mk(); f(s); return careFlag(s, T)?.id ?? null; };
    expect(one((s) => { s.care.shelf = [{ id: "a", name: "เซรั่ม", cat: "face", patch: { start: T, res: "red" } }]; })).toBe("patch");
    expect(one((s) => { s.care.shelf = [{ id: "a", name: "เซรั่ม", cat: "face", done: T, patch: { start: T, res: "red" } }]; })).toBeNull();
    expect(one((s) => { s.care.ms.mole = 3; })).toBe("mole");
    expect(one((s) => { s.care.ms.mole = 1; })).toBeNull();
    expect(one((s) => { s.care.checks.find((c) => c.id === "bp")!.bp = [[140, 90, "2026-10-20"], [138, 88, "2026-10-22"]]; })).toBe("bp");
    expect(one((s) => { s.care.checks.find((c) => c.id === "lab")!.flag = true; })).toBe("lab");
    expect(one((s) => { s.care.ms["pm.ret.84"] = 2; })).toBe("skin");
    expect(one((s) => { s.care.ms["pm.ret.84"] = 1; })).toBeNull();
    expect(one((s) => { for (let i = 0; i < 15; i++) put(s, i, { bowel: 2 }); })).toBe("bowel");
    expect(one((s) => { for (let i = 0; i < 14; i++) put(s, i, { bowel: i % 2 ? 3 : 1 }); })).toBeNull();
    expect(one((s) => { for (const i of [0, 5, 13]) put(s, i, { sym: ["ear"] }); })).toBe("ear");
    expect(one((s) => { for (const i of [0, 5, 14]) put(s, i, { sym: ["ear"] }); })).toBeNull(); // day 14 is outside 14 days
    expect(one((s) => { for (let i = 0; i < 7; i++) put(s, i * 2, { sym: ["eye"] }); })).toBe("eye");
    expect(one((s) => { for (let i = 0; i < 8; i++) put(s, i * 3, { sym: ["head"] }); })).toBe("head");
    expect(one((s) => { for (const i of [1, 2, 3]) put(s, i, { sym: ["sick"] }); })).toBe("sick");
    expect(one((s) => { for (const i of [0, 1, 3]) put(s, i, { sym: ["sick"] }); })).toBeNull();
  });
  it("voice: one strained live recap is not a flag; 12 of 21 symptom/strong-strain days is; mild recaps never are", () => {
    const s = mk();
    const live = (v: 0 | 1 | 2) => ({ live: { min: 300, n: 1, at: 1, end: 2, ok: 0, seen: 0, br: 0, v } });
    put(s, 0, live(2));
    expect(careFlag(s, T)).toBeNull();
    for (let i = 1; i < 12; i++) put(s, i, i % 2 ? { sym: ["voice"] } : live(2));
    expect(careFlag(s, T)).toMatchObject({ id: "voice", who: "หมอ หู คอ จมูก" });
    put(s, 0, live(0));
    expect(careFlag(s, T)).toBeNull(); // 11 of 21
    const m = mk();
    for (let i = 0; i < 21; i++) put(m, i, i % 2 ? { ...live(1), sing: { strain: true } } : live(1));
    expect(careFlag(m, T)).toBeNull(); // "แหบนิดหน่อย" after lives and sing strain do not count
  });
  it("follows the priority order", () => {
    const s = mk();
    for (let i = 0; i < 8; i++) put(s, i * 3, { sym: ["head", "eye"] });
    for (let i = 0; i < 15; i++) put(s, i, { bowel: 3, sym: ["voice", "eye", "head"] });
    s.care.ms["pm.ret.84"] = 3;
    s.care.checks.find((c) => c.id === "lab")!.flag = true;
    s.care.ms.mole = 3;
    s.care.shelf = [{ id: "a", name: "เซรั่ม", cat: "face", patch: { start: T, res: "red" } }];
    const order: string[] = [];
    for (let k = 0; k < 10; k++) { const f = careFlag(s, T); if (!f) break; order.push(f.id); snoozeFlag(s, f.id, T); }
    expect(order).toEqual(["patch", "mole", "voice", "lab", "skin", "bowel", "eye", "head"]);
  });
  it("snoozes 14 days", () => {
    const s = mk();
    s.care.ms.mole = 3;
    snoozeFlag(s, "mole", T);
    expect(s.care.snooze["f:mole"]).toBe("2026-11-10");
    expect(careFlag(s, "2026-11-10")).toBeNull();
    expect(careFlag(s, "2026-11-11")?.id).toBe("mole");
  });
  it("says it is not a diagnosis and labels heuristics", () => {
    const s = mk();
    for (let i = 0; i < 8; i++) put(s, i, { sym: ["head"] });
    const f = careFlag(s, T)!;
    expect(f).toMatchObject({ id: "head", heuristic: true });
    expect(f.body).toContain("เกณฑ์โดยประมาณ");
    expect(f.body).toContain("ไม่ใช่การวินิจฉัย");
    s.care.shelf = [{ id: "a", name: "เซรั่ม", cat: "face", patch: { start: T, res: "red" } }];
    expect(careFlag(s, T)).toMatchObject({ id: "patch", call: "1669", title: "หยุดใช้ เซรั่ม" });
    expect(RED_FLAGS.length).toBe(8);
    expect(HELP.map((h) => h[0])).toEqual(["1323", "1669", "191"]);
  });
});
