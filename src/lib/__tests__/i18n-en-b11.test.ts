// Round E batch 11: English output of push-steps, schedule, brain schema and the rules headline.
import { describe, expect, it } from "vitest";
import { withLang } from "../../i18n";
import { planSchema, systemBrain, textMax, validateAiOutput, TEXT_MAX } from "../brain/schema";
import { rulesBrief } from "../brain/report";
import type { Report } from "../brain/types";
import { pushSteps, standaloneFix, STANDALONE_FIX, type Facts } from "../push-steps";
import { CUES, MEAL2_LABEL, baseDay } from "../schedule";

const THAI = /[฀-๿]/;
const ORIGIN = "https://krob.example.app";
const good: Facts = {
  ios: true, standalone: true, support: true, mode: "server", reason: null, token: true, permission: "granted", sw: "active",
  key: "ok", sub: "ok", saved: "yes", devices: 2, appUrl: ORIGIN, origin: ORIGIN, host: "krob.example.app", cronAgeMin: 1, test: "received",
};
// One variant per failure branch, so every step text is produced at least once.
const VARIANTS: Partial<Facts>[] = [
  {}, { ios: false, standalone: false }, { standalone: false }, { support: false }, { ios: false, support: false },
  { mode: "loading" }, { mode: "local", reason: "unreachable" }, { mode: "local", reason: "unconfigured" }, { token: false },
  { permission: "default" }, { permission: "denied" }, { permission: "unsupported" }, { sw: "installing" }, { sw: "none" },
  { key: "unknown" }, { key: "missing" }, { key: "error" }, { sub: "unverified" }, { sub: "unknown" }, { sub: "none" }, { sub: "mismatch" },
  { saved: "unknown" }, { saved: "no" }, { saved: "error" }, { saved: "unauthorized" }, { appUrl: undefined }, { appUrl: null },
  { appUrl: "https://other.example.app" }, { cronAgeMin: undefined }, { cronAgeMin: null }, { cronAgeMin: 45 },
  { test: "sending" }, { test: "idle" }, { test: "sent" }, { test: "none" }, { test: "error" },
];

describe("push-steps en", () => {
  it("every label, detail and fix is English", () => {
    for (const v of VARIANTS) for (const s of withLang("en", () => pushSteps({ ...good, ...v }))) {
      for (const t of [s.label, s.detail, s.fix ?? ""]) expect(t, `${JSON.stringify(v)} ${s.id}`).not.toMatch(THAI);
    }
  });
  it("plural and vars", () => {
    expect(withLang("en", () => pushSteps({ ...good, devices: 1 }).find((s) => s.id === "saved")!.detail)).toBe("Saved · 1 device in total");
    expect(withLang("en", () => pushSteps(good).find((s) => s.id === "saved")!.detail)).toBe("Saved · 2 devices in total");
  });
  it("accessor follows the language, legacy const stays th", () => {
    expect(withLang("en", standaloneFix)).not.toMatch(THAI);
    expect(withLang("th", standaloneFix)).toBe(STANDALONE_FIX);
  });
});

describe("schedule en", () => {
  it("base day items, cues and meal2 labels are English", () => {
    withLang("en", () => {
      for (const [type, meal2] of [["off", undefined], ["work", undefined], ["work", "A"], ["work", "B"], ["work", "C"]] as const) {
        for (const i of baseDay(type, meal2)) expect(`${i.title} ${i.sub ?? ""}`).not.toMatch(THAI);
      }
      for (const v of Object.values(CUES)) expect(v).not.toMatch(THAI);
      for (const v of Object.values(MEAL2_LABEL)) expect(v).not.toMatch(THAI);
      expect(baseDay("off")[0].title).toBe("Wake up + weigh in");
    });
  });
  it("th stays the original text", () => {
    expect(baseDay("off")[0].title).toBe("ตื่น + ชั่งน้ำหนัก");
    expect(CUES.sleep).toBe("หลังเขียน journal");
  });
});

describe("brain schema en", () => {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([k]) => k !== "description").map(([k, x]) => [k, strip(x)]));
    return v;
  };
  it("system prompt is English with the same 14 rules", () => {
    const p = systemBrain("en");
    expect(p).not.toMatch(THAI);
    for (let i = 1; i <= 14; i++) expect(p).toContain(`\n${i}) `);
    expect(p).toContain("JSON");
  });
  it("en schema has the th structure and English descriptions", () => {
    expect(strip(planSchema("en"))).toEqual(strip(planSchema("th")));
    expect(JSON.stringify(planSchema("en"))).not.toMatch(THAI);
  });
  it("en caps are 30% longer", () => {
    expect(textMax("th")).toBe(TEXT_MAX);
    expect(textMax("en").headline).toBe(104);
    const raw = { headline: "a".repeat(100) };
    expect(validateAiOutput(raw, [], "brief", "en")!.headline).toHaveLength(100);
    expect(validateAiOutput(raw, [], "brief", "th")!.headline).toHaveLength(80);
  });
});

describe("rules headline en", () => {
  it("balance fallback", () => {
    const r = { today: "2026-11-02", sigs: [], candidates: [], gaps: [], balance: { b: 70, best: null, weakest: null } } as unknown as Report;
    expect(withLang("en", () => rulesBrief(r, "brief").headline)).toBe("Balance 70/100");
    expect(rulesBrief(r, "brief").headline).toBe("สมดุล 70/100");
  });
});
