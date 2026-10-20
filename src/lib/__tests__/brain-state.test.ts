import { describe, expect, it } from "vitest";
import { addDays } from "../date";
import { mergeBrain, sanitizeBrain } from "../brain/state";
import { DEFAULT_BRAIN, type AppliedRec, type Brain } from "../brain/types";

const rec = (i: number, extra: Partial<AppliedRec> = {}): AppliedRec => ({
  id: `a-${(1760000000000 + i).toString(36)}`, cid: `R01:${(123456789 + i).toString(36)}`, rule: "R01", area: "leisure",
  at: 1760000000000 + i * 1000, date: addDays("2026-09-01", i % 40),
  actions: [{ k: "move_item", tpl: "game-max", item: "game-stop", delta: -30 }, { k: "set_game_break", min: 60 }],
  ops: [
    { t: "override", key: "game-max:game-stop", field: "min", before: undefined, after: 1770 },
    { t: "setting", key: "gameBreakMin", before: 0, after: 60 },
  ],
  eval: { metric: "leisure.bedLate", windowDays: 7, dir: -1, min: 15, base: 62.5 },
  ...extra,
});

describe("sanitizeBrain", () => {
  it("returns a fresh default for garbage", () => {
    expect(sanitizeBrain(null)).toEqual(DEFAULT_BRAIN);
    expect(sanitizeBrain("x")).toEqual(DEFAULT_BRAIN);
    expect(sanitizeBrain([])).toEqual(DEFAULT_BRAIN);
    expect(sanitizeBrain(undefined).applied).not.toBe(DEFAULT_BRAIN.applied);
  });
  it("repairs bad records and fields", () => {
    const b = sanitizeBrain({
      applied: [
        rec(1),
        { ...rec(2), id: "bad id" },
        { ...rec(3), actions: [{ k: "setDone", item: "gym" }] }, // unknown kind -> no actions -> dropped
        { ...rec(4), actions: [{ k: "tip", ref: "mvd" }], ops: [] }, // tip-only record without ops is kept
        { ...rec(5), ops: [{ t: "nope" }] }, // move without valid ops -> dropped
        { ...rec(6), actions: [...rec(6).actions, { k: "set_flag", key: "goodDay", on: true }] }, // bad action filtered
        "junk",
      ],
      decisions: [{ sig: "R01:x", rule: "R01", d: "a", at: 1 }, { sig: "R01:x", rule: "R01", d: "z", at: 2 }, { sig: 5, rule: "R01", d: "a", at: 3 }],
      snooze: { "R01:a": "mute", "R02:b": "2026-10-30", "R03:c": "soon", "R04:d": 5 },
      focus: { area: "sleep", ref: "sleep-anchor", from: "2026-10-20", to: "bad" },
      deload: { from: "2026-10-27", to: "2026-10-20" },
      weeks: [["2026-10-12", 70, 1, 2, 3, 4, 5, 6, 7, 8, 9], ["2026-10-19", 70], ["x", 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
      reviewDone: 7,
    });
    expect(b.applied.map((r) => r.id).sort()).toEqual([rec(1).id, rec(4).id, rec(6).id].sort());
    expect(b.applied.find((r) => r.id === rec(6).id)!.actions).toHaveLength(2);
    expect(b.decisions).toHaveLength(1);
    expect(b.snooze).toEqual({ "R01:a": "mute", "R02:b": "2026-10-30" });
    expect(b.focus).toBeNull();
    expect(b.deload).toBeNull();
    expect(b.weeks).toEqual([["2026-10-12", 70, 1, 2, 3, 4, 5, 6, 7, 8, 9]]);
    expect(b.reviewDone).toBe("");
  });
  it("caps every list (newest kept)", () => {
    const b = sanitizeBrain({
      applied: Array.from({ length: 30 }, (_, i) => rec(i)),
      decisions: Array.from({ length: 50 }, (_, i) => ({ sig: `R0${i % 9}:x${i}`, rule: "R01", d: "r", at: i })),
      snooze: Object.fromEntries(Array.from({ length: 70 }, (_, i) => [`R07:t:${i}`, "2026-11-01"])),
      weeks: Array.from({ length: 15 }, (_, i) => [addDays("2026-07-05", i * 7), 60, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
    });
    expect(b.applied).toHaveLength(20);
    expect(b.applied[0].id).toBe(rec(29).id);
    expect(b.decisions).toHaveLength(40);
    expect(b.decisions[0].at).toBe(49);
    expect(Object.keys(b.snooze)).toHaveLength(60);
    expect(b.weeks).toHaveLength(12);
    expect(b.weeks.at(-1)![0]).toBe(addDays("2026-07-05", 14 * 7));
  });
  it("a worst-case full-caps brain serialises to 24 KB or less", () => {
    const b: Brain = sanitizeBrain({
      // largest real variant (R20 "cut extras": 3 toggles on a user template) in every record
      applied: Array.from({ length: 20 }, (_, i) => rec(i, {
        rule: "R20", area: "recovery", undoneAt: 1760000999000, kept: true, outcome: "better",
        actions: ["posture", "persona", "review"].map((item) => ({ k: "toggle_item" as const, tpl: "u-mgx1abcdef1", item, on: false })),
        ops: ["posture", "persona", "review"].map((item) => ({ t: "override" as const, key: `u-mgx1abcdef1:${item}`, field: "enabled" as const, before: undefined, after: false })),
        eval: { metric: "area:recovery", windowDays: 14, dir: 1, min: 5, base: 61.25 },
      })),
      // every decision an "a" carrying the candidate id (the longest decision shape)
      decisions: Array.from({ length: 40 }, (_, i) => ({ sig: `R07:u-mgx1abc${i % 10}:meal3`, rule: "R07", cid: `R07:${(99999999 + i).toString(36)}`, d: "a", at: 1760000000000 + i })),
      snooze: Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`R07:u-mgx1abc${i}:meal3`, "2026-11-01"])),
      focus: { area: "sleep", ref: "sleep-anchor", from: "2026-10-20", to: "2026-10-26" },
      deload: { from: "2026-10-20", to: "2026-10-26" },
      weeks: Array.from({ length: 12 }, (_, i) => [addDays("2026-08-02", i * 7), 66, 58, 72, 80, 61, 70, 55, 90, 64, 77]),
      reviewDone: "2026-10-18",
    });
    expect(b.applied).toHaveLength(20);
    expect(b.applied[0].ops).toHaveLength(3);
    const size = new TextEncoder().encode(JSON.stringify(b)).length;
    expect(size).toBeLessThanOrEqual(24 * 1024); // about 20.3 KB; keepalive allows a 60 KB body (store.tsx)
  });
});

describe("mergeBrain", () => {
  const B = (p: Partial<Brain>): Brain => ({ ...sanitizeBrain(null), ...p });
  it("unions applied by id and caps at 20", () => {
    const m = mergeBrain(B({ applied: Array.from({ length: 15 }, (_, i) => rec(i)) }), B({ applied: Array.from({ length: 15 }, (_, i) => rec(i + 10)) }));
    expect(m.applied).toHaveLength(20);
    expect(m.applied[0].id).toBe(rec(24).id);
  });
  it("undoneAt wins over a newer copy without it, then outcome, then kept", () => {
    const undone = rec(1, { undoneAt: 5 });
    expect(mergeBrain(B({ applied: [rec(1)] }), B({ applied: [undone] })).applied[0].undoneAt).toBe(5);
    expect(mergeBrain(B({ applied: [rec(1, { kept: true })] }), B({ applied: [rec(1, { outcome: "worse" })] })).applied[0].outcome).toBe("worse");
  });
  it("mute wins, else the later snooze date", () => {
    const m = mergeBrain(B({ snooze: { a: "2026-10-30", b: "mute", c: "2026-10-01" } }), B({ snooze: { a: "mute", b: "2026-11-01", c: "2026-10-05", d: "2026-10-09" } }));
    expect(m.snooze).toEqual({ a: "mute", b: "mute", c: "2026-10-05", d: "2026-10-09" });
  });
  it("focus and deload follow the newer copy; weeks union with newer winning; reviewDone max", () => {
    const n = B({ focus: null, deload: { from: "2026-10-20", to: "2026-10-26" }, weeks: [["2026-10-18", 70, 1, 2, 3, 4, 5, 6, 7, 8, 9]], reviewDone: "2026-10-11" });
    const o = B({ focus: { area: "sleep", ref: "mvd", from: "2026-10-01", to: "2026-10-07" }, weeks: [["2026-10-18", 10, 1, 2, 3, 4, 5, 6, 7, 8, 9], ["2026-10-11", 60, 1, 2, 3, 4, 5, 6, 7, 8, 9]], reviewDone: "2026-10-18" });
    const m = mergeBrain(n, o);
    expect(m.focus).toBeNull();
    expect(m.deload).toEqual({ from: "2026-10-20", to: "2026-10-26" });
    expect(m.weeks.map((w) => w.slice(0, 2))).toEqual([["2026-10-11", 60], ["2026-10-18", 70]]);
    expect(m.reviewDone).toBe("2026-10-18");
  });
  it("snooze cap keeps mutes and the latest dates", () => {
    const old = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`R07:old:${i}`, "2026-09-01"]));
    const m = mergeBrain(B({ snooze: { "R01:new": "2026-10-25", "R02:m": "mute" } }), B({ snooze: old }));
    expect(Object.keys(m.snooze)).toHaveLength(60);
    expect(m.snooze["R01:new"]).toBe("2026-10-25");
    expect(m.snooze["R02:m"]).toBe("mute");
  });
  it("unions decisions by at|sig|d", () => {
    const d = { sig: "R01:x", rule: "R01", d: "a" as const, at: 1 };
    const m = mergeBrain(B({ decisions: [d, { ...d, d: "r", at: 2 }] }), B({ decisions: [d, { ...d, at: 3 }] }));
    expect(m.decisions.map((x) => x.at)).toEqual([3, 2, 1]);
  });
});
