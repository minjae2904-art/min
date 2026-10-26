// Round E batch 8: English output of ai-summary.ts and store.tsx (SYNC_LABEL). Text owned by other batches (area,
// conflict and template labels, insights) is not asserted here; only that none of batch 8's own Thai remains.
import { describe, expect, it } from "vitest";
import { keepStored, withLang } from "../../i18n";
import { gymExName } from "../../i18n/stored";
import * as L8 from "../../i18n/msg/lib-8";
import { aiSummary } from "../ai-summary";
import { DEFAULT_PLAN, planFor } from "../gymlog";
import { normalize } from "../model";
import { SYNC_LABEL } from "../store";
import { build, TODAY } from "./brain-fixtures";

const THAI = /[฀-๿]/;
// Thai fragments of batch 8's own th values (split at {var} tokens).
const pieces = Object.values(L8.th).flatMap((v) => v.split(/\{[^{}]*\}/)).map((p) => p.trim()).filter((p) => THAI.test(p));

describe("aiSummary in English", () => {
  const s = build(21, () => ({ sleepH: 7, trade: { count: 1, result: "win" } }));
  const th = aiSummary(s, TODAY);
  const en = withLang("en", () => aiSummary(s, TODAY));

  it("keeps the same line count and numbers-only structure", () => {
    expect(en.split("\n").length).toBe(th.split("\n").length);
    expect(en).toContain("Profile: ");
    expect(en).toContain("Plan for the next 7 days: ");
    expect(en).toContain("--- 7 days: logged ");
    expect(en).toContain("--- 30 days: logged ");
    expect(en).toContain("By weekday: Sun:");
    expect(en).toContain("Next gym: ");
  });
  it("contains none of batch 8's Thai", () => {
    for (const p of pieces) expect(en, p).not.toContain(p);
  });
  it("Thai output is unchanged by an English run", () => {
    expect(aiSummary(s, TODAY)).toBe(th);
    expect(th).toContain("ตามวัน: อา:");
  });
});

describe("SYNC_LABEL", () => {
  it("follows the language", () => {
    expect(SYNC_LABEL.synced).toBe("ซิงค์แล้ว");
    const en = withLang("en", () => ({ ...SYNC_LABEL }));
    expect(en).toEqual({ local: "This device only", syncing: "Syncing...", synced: "Synced", error: "Couldn't sync" });
    for (const v of Object.values(en)) expect(v).not.toMatch(THAI);
  });
});

describe("lib-8 English values", () => {
  it("have no Thai and differ from their keys", () => {
    for (const [k, v] of Object.entries(L8.en)) { expect(v).not.toMatch(THAI); expect(v).not.toBe(k); }
  });
});

// ExerciseEditor save path (spec 7): orig is read under th, so saving an untouched default plan in English stores
// the canonical th names; an edited row keeps the typed text.
describe("ExerciseEditor canonical save", () => {
  const save = (s: ReturnType<typeof normalize>, code: string, edit?: [string, string]) => withLang("en", () => {
    const orig = Object.fromEntries(withLang("th", () => planFor(s, code)).map((e) => [e.id, e.name]));
    const draft = planFor(s, code).map((e) => ({ ...e, name: gymExName(e.name) })).map((e) => (edit && e.id === edit[0] ? { ...e, name: edit[1] } : e));
    return draft.map((e) => keepStored(gymExName, orig[e.id], e.name.trim(), 40));
  });
  it("stores th defaults when saved in English", () => {
    const s = normalize({});
    const th = DEFAULT_PLAN.D1.map((e) => e.name);
    expect(save(s, "D1")).toEqual(th);
    const out = save(s, "D1", ["sq", "Front squat"]);
    expect(out[0]).toBe("Front squat");
    expect(out.slice(1)).toEqual(th.slice(1));
  });
  it("a plan already stored in Thai stays Thai when saved in English", () => {
    const s = normalize({});
    s.gym.plan.D2 = DEFAULT_PLAN.D2.map((e) => ({ ...e }));
    expect(save(s, "D2")).toEqual(DEFAULT_PLAN.D2.map((e) => e.name));
  });
});
