import { describe, expect, it } from "vitest";
import { aiSummary } from "../ai-summary";
import { buildAiContext, CTX_MAX_BYTES, ctxBytes, stableStringify, userText } from "../brain/context";
import { brainReport } from "../brain/report";
import type { Mode } from "../brain/types";
import { addDays, at } from "../date";
import type { State } from "../model";
import { itemsFor } from "../schedule";
import { build, dowOf, tsAt, TODAY } from "./brain-fixtures";

const U = "u-abc";
const SENTINELS = ["SENTINEL_J", "SENTINEL_N", "SENTINEL_C", "SENTINEL_O", "SENTINEL_T", "SENTINEL_I", "x@y.z"];

// Every private string the user can type, placed where a leak would show up (late game nights on the user copy
// of game-max trigger R01, which proposes moving that copy's game-stop).
function sentinel(): State {
  const s = build(21, (d) => ({
    tpl: dowOf(d) % 2 ? U : "balanced", bedLate: d >= addDays(TODAY, -6) ? 80 : 0, sleepH: 6.5, trade: { count: 2, result: "loss" },
  }), {
    extra: (x) => {
      x.schedule.templates = [{ id: U, name: "SENTINEL_T", from: "game-max" }];
      x.schedule.custom = [{ id: "c-1", title: "SENTINEL_C", min: at(15), ring: "habit", days: "both" }];
      x.schedule.overrides[`${U}:game-stop`] = { title: "SENTINEL_O" };
      x.schedule.overrides["balanced:meal1"] = { title: "SENTINEL_O" };
      x.profile.identity = "SENTINEL_I";
      x.profile.name = "x@y.z";
    },
  });
  for (const d of Object.values(s.days)) {
    d.journal = { good: "SENTINEL_J", fix: "SENTINEL_J", thanks: "SENTINEL_J" };
    if (d.trade) d.trade.note = "SENTINEL_N";
  }
  s.settings.weekPlan = s.settings.weekPlan.map((t, i) => (i % 2 ? U : t));
  return s;
}
const ctxOf = (s: State, mode: Mode, today = TODAY) => buildAiContext(brainReport(s, today, mode), s, today, mode);

describe("buildAiContext privacy", () => {
  it("never contains journal, notes, custom/override titles, user template names, identity or name", () => {
    const s = sentinel();
    for (const mode of ["brief", "weekly"] as const) {
      const ctx = ctxOf(s, mode);
      const txt = stableStringify(ctx) + userText(ctx, mode);
      for (const x of SENTINELS) expect(txt, `${mode} leaks ${x}`).not.toContain(x);
      expect(txt).toContain("(สำเนา #1)"); // the user copy is present, under its canonical alias
      expect(ctx.candidates.length).toBeGreaterThan(0);
    }
  });
  it("aiSummary (coach) leaks none of them either", () => {
    const txt = aiSummary(sentinel(), TODAY);
    for (const x of SENTINELS) expect(txt, `aiSummary leaks ${x}`).not.toContain(x);
    expect(txt).toContain("(สำเนา #1)");
  });
  it("has no epoch timestamps", () => {
    const txt = stableStringify(ctxOf(sentinel(), "weekly"));
    expect(txt).not.toMatch(/\d{12,}/);
  });
});

describe("buildAiContext size and hash", () => {
  it("stays within 6 KB on a 400-day fixture", () => {
    const s = build(400, (d, i) => ({
      tpl: i % 3 ? undefined : "game-max", bedLate: i % 4 ? 0 : 90, sleepH: i % 5 ? 7.5 : 5.5,
      trade: i % 6 ? { count: 1, result: "win" } : { count: 3, result: "loss" }, late: { meal3: i % 2 ? 0 : 60, gym: 50 },
      checkin: [i % 7 ? 4 : 2, 3, 3], water: i % 3 ? "goal" : 500,
    }));
    for (const mode of ["brief", "weekly"] as const) expect(ctxBytes(ctxOf(s, mode))).toBeLessThanOrEqual(CTX_MAX_BYTES);
  });
  it("brief hash input ignores ticks today but follows a new check-in", () => {
    const s = build(14, (d) => (d === TODAY ? { ticks: ["weigh", "meal1"], bedLate: null } : {}));
    const h = stableStringify(ctxOf(s, "brief"));
    const ticked = structuredClone(s);
    const next = itemsFor(ticked.schedule, ticked.days[TODAY], TODAY).filter((i) => i.ring && !ticked.days[TODAY].done[i.id]).slice(0, 2);
    expect(next.length).toBe(2);
    for (const it of next) ticked.days[TODAY].done[it.id] = tsAt(TODAY, it.min);
    expect(stableStringify(ctxOf(ticked, "brief"))).toBe(h);
    const checked = structuredClone(s);
    checked.days[TODAY].checkin = { energy: 2, mood: 2, sleep: 2 };
    expect(stableStringify(ctxOf(checked, "brief"))).not.toBe(h);
  });
  it("stableStringify is key-order independent", () => {
    expect(stableStringify({ b: 1, a: { d: [1, { y: 1, x: 2 }], c: 2 }, z: undefined })).toBe(stableStringify({ a: { c: 2, d: [1, { x: 2, y: 1 }] }, b: 1 }));
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
    expect(JSON.parse(stableStringify({ b: [null, "x"], a: 1.5 }))).toEqual({ a: 1.5, b: [null, "x"] });
  });
});
